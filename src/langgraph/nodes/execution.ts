import { tools } from '../../services/toolsManager';
import { sendEmail } from '../../services/sendMail';
import * as calendarService from '../../services/calendarService';
import logger from '../../utils/logger';

interface WorkflowState {
  userMessage: string;
  vendedor: any;
  history: any;
  intent: 'COMANDO_CRM' | 'CONVERSACION_GENERAL' | null;
  knowledge: any[];
  plan: any[];
  requiresApproval: boolean;
  approvalMessage: string;
  executionResults: any[];
  response: string;
}

export async function executionNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
  const { plan, vendedor, requiresApproval } = state;

  // Solo ejecutar si no requiere aprobación y hay un plan
  if (requiresApproval || !plan || plan.length === 0) {
    return { executionResults: [] };
  }

  try {
    const executionResults = [];
    const context: Record<string, any> = {};

    // Cache de entidades creadas
    const createdEntities = {
      empresa: null as string | null,
      contacto: null as string | null,
      oportunidad: null as string | null,
      producto: null as string | null,
      actividad: null as string | null
    };

    for (let i = 0; i < plan.length; i++) {
      const step = plan[i];
      const tool = tools.find(t => t.name === step.tool);

      if (!tool) {
        logger.error(`Tool not found: ${step.tool}`);
        executionResults.push({ tool: step.tool, error: `Tool not found: ${step.tool}` });
        continue;
      }

      let args = { ...step.args };
      if (!args.vendedorId) {
        args.vendedorId = vendedor._id;
      }

      // Resolver referencias del contexto
      for (const key in args) {
        const value = args[key];
        if (typeof value === 'string' && value.startsWith('REF_')) {
          if (context[value]) {
            args[key] = context[value];
            logger.info(`Resolved reference ${value} to ${context[value]}`);
          } else {
            logger.error(`Unresolved reference: ${value}`);
            executionResults.push({ tool: step.tool, error: 'Unresolved dependency.' });
            continue;
          }
        }
      }

      // Resolver referencias directas por tipo de entidad
      if (args.empresaId === undefined && createdEntities.empresa) {
        args.empresaId = createdEntities.empresa;
        logger.info(`Auto-resolved empresaId to ${createdEntities.empresa}`);
      }
      if (args.contactoId === undefined && createdEntities.contacto) {
        args.contactoId = createdEntities.contacto;
        logger.info(`Auto-resolved contactoId to ${createdEntities.contacto}`);
      }
      if (args.oportunidadId === undefined && createdEntities.oportunidad) {
        args.oportunidadId = createdEntities.oportunidad;
        logger.info(`Auto-resolved oportunidadId to ${createdEntities.oportunidad}`);
      }
      if (args.empresa === undefined && createdEntities.empresa) {
        args.empresa = createdEntities.empresa;
        logger.info(`Auto-resolved empresa field to ${createdEntities.empresa}`);
      }

      // Validación especial para crear_actividad
      if (step.tool === 'crear_actividad' && !args.oportunidadId) {
        logger.error('crear_actividad requires oportunidadId but none available');
        executionResults.push({ tool: step.tool, error: 'Missing oportunidadId for actividad.' });
        continue;
      }

      try {
        logger.info(`Executing ${step.tool} with args:`, args);
        const result = await tool.func(JSON.stringify(args));
        const parsedResult = JSON.parse(result);

        executionResults.push({ tool: step.tool, result: parsedResult });

        // Actualizar contexto con nuevos IDs creados
        if (parsedResult && parsedResult._id) {
          const entityId = parsedResult._id.toString();
          const entityType = step.tool.split('_')[1].toUpperCase();
          const refKey = `REF_${entityType}_${i}`;
          context[refKey] = entityId;

          // Actualizar cache de entidades creadas
          if (step.tool === 'crear_empresa') {
            createdEntities.empresa = entityId;
          } else if (step.tool === 'crear_contacto') {
            createdEntities.contacto = entityId;
          } else if (step.tool === 'crear_oportunidad') {
            createdEntities.oportunidad = entityId;
          } else if (step.tool === 'crear_producto') {
            createdEntities.producto = entityId;
          } else if (step.tool === 'crear_actividad') {
            createdEntities.actividad = entityId;

            // Verificar actividad duplicada
            if (args.descripcion && createdEntities.oportunidad) {
              const existingActivities = await tools.find(t => t.name === 'buscar_actividad_por_descripcion')?.func(JSON.stringify({
                descripcion: args.descripcion,
                vendedorId: vendedor._id,
                oportunidadId: createdEntities.oportunidad
              }));
              if (existingActivities) {
                const parsedActivities = JSON.parse(existingActivities);
                if (parsedActivities && parsedActivities.length > 0) {
                  logger.warn('Actividad duplicada detectada, skipping creation');
                  executionResults[executionResults.length - 1].result = { ...parsedActivities[0], nota: 'Actividad ya existente, no se ha creado una nueva.' };
                }
              }
            }

            // Crear evento en Google Calendar si hay fecha
            if (parsedResult.fecha_hora) {
              try {
                const event = {
                  summary: parsedResult.descripcion,
                  start: {
                    dateTime: new Date(parsedResult.fecha_hora).toISOString(),
                    timeZone: 'America/Bogota',
                  },
                  end: {
                    dateTime: new Date(new Date(parsedResult.fecha_hora).getTime() + 60 * 60 * 1000).toISOString(),
                    timeZone: 'America/Bogota',
                  },
                  attendees: [] as { email: string }[],
                  reminders: {
                    useDefault: false,
                    overrides: [
                      { method: 'email', minutes: 24 * 60 },
                      { method: 'popup', minutes: 10 },
                    ],
                  },
                };

                // Añadir contacto como invitado si existe
                if (createdEntities.contacto) {
                  const contactoTool = tools.find(t => t.name === 'buscar_contacto_por_id');
                  if (contactoTool) {
                    const contactoResult = await contactoTool.func(JSON.stringify({ id: createdEntities.contacto }));
                    const contacto = JSON.parse(contactoResult);
                    if (contacto && contacto.email) {
                      event.attendees.push({ email: contacto.email });
                    }
                  }
                }

                await calendarService.createEvent(vendedor._id.toString(), event);
                logger.info('Calendar event created for actividad');
              } catch (calendarError) {
                logger.error({ err: calendarError }, 'Error creating calendar event');
              }
            }
          }

          logger.info(`Updated context - RefKey: ${refKey} = ${entityId}`);
        }

      } catch (error) {
        logger.error({ err: error }, `Error executing tool ${step.tool}`);
        executionResults.push({ tool: step.tool, error: String(error), result: [] });
      }
    }

    // Enviar resumen por email si hay resultados exitosos
    const successfulResults = executionResults.filter(r => !r.error && r.tool.startsWith('crear_'));
    if (successfulResults.length > 0 && vendedor.email) {
      try {
        const subject = `Resumen de Actividad CRM | ${new Date().toLocaleDateString()}`;
        const htmlBody = generateEmailSummary(vendedor.nombre, executionResults);
        await sendEmail({ to: vendedor.email, subject, htmlBody });
        logger.info(`Executive summary sent to ${vendedor.email}`);
      } catch (emailError) {
        logger.error({ err: emailError }, 'Error sending executive summary');
      }
    }

    logger.info(`Plan executed with ${executionResults.length} results`);
    return { executionResults };

  } catch (error) {
    logger.error({ err: error }, 'Error in executionNode');
    return {
      executionResults: [{
        tool: 'execution',
        error: `Error durante la ejecución: ${error}`,
        result: []
      }]
    };
  }
}

// Función auxiliar para generar el resumen del email
function generateEmailSummary(vendedorNombre: string, results: any[]) {
  const summaryParts = results.map(res => {
    if (res.error || res.tool.startsWith('buscar_')) return '';
    const { tool, result } = res;
    let icon = '';
    let actionText = '';

    if (tool.startsWith('crear_')) {
      icon = '➕';
      actionText = 'creada';
    } else if (tool.startsWith('actualizar_')) {
      icon = '✏️';
      actionText = 'actualizada';
    }

    const entityType = tool.split('_')[1];
    const entityName = result.nombre || result.descripcion || '';

    return `<li><strong>${icon} ${entityType.charAt(0).toUpperCase() + entityType.slice(1)} ${actionText}:</strong> ${entityName}</li>`;
  }).filter(part => part !== '').join('');

  return `
    <p>Hola ${vendedorNombre},</p>
    <p>¡Buen trabajo! Aquí tienes un resumen ejecutivo de las últimas acciones que hemos registrado juntos en el CRM.</p>
    <hr>
    <h3>Resumen de Acciones</h3>
    <ul>
      ${summaryParts}
    </ul>
    <hr>
    <p>Puedes revisar todos los detalles directamente en el CRM.</p>
    <p>¡Sigamos adelante!</p>
    <br>
    <p>Saludos,</p>
    <p><b>Valya</b><br>Tu Asistente de Ventas IA</p>
  `;
}