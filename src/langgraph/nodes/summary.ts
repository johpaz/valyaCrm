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

export async function summaryNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
  const { executionResults, intent, vendedor } = state;

  if (intent === 'CONVERSACION_GENERAL') {
    // Para conversaciones generales, devolver respuesta conversacional
    // Esto se manejará en el workflow principal
    return { response: '' };
  }

  if (!executionResults || executionResults.length === 0) {
    return { response: `Hola ${vendedor?.nombre || 'amigo'}, no se realizaron acciones en esta solicitud.` };
  }

  try {
    const summary = generateSummary(executionResults, vendedor);
    logger.info(`Summary generated: ${summary}`);
    return { response: summary };

  } catch (error) {
    logger.error({ err: error }, 'Error in summaryNode');
    return { response: `Hola ${vendedor?.nombre || 'amigo'}, se completaron las acciones, pero hubo un problema generando el resumen.` };
  }
}

// Función para generar resumen de resultados de ejecución
function generateSummary(results: any[], vendedor?: any): string {
  if (!results || results.length === 0) {
    return 'No se realizaron acciones.';
  }

  const summaryParts = results.map(res => {
    if (res.error) {
      return `❌ Error en ${res.tool}: ${res.error}`;
    }

    const { tool, result } = res;

    // Manejar herramientas de listado
    if (tool.startsWith('listar_')) {
      const entityType = tool.split('_')[1];
      if (!result || result.length === 0) {
        return `No encontré ${entityType} para ti.`;
      }
      if (tool === 'listar_ventas_ganadas') {
        const list = result.map((item: any) => `  - *Oportunidad: ${item.oportunidadId.nombre}* - Valor: ${item.valor}`).join('\n');
        return `Aquí tienes tus ventas ganadas:\n${list}`;
      }
      const list = result.map((item: any) => `  - *${item.nombre}*`).join('\n');
      return `Aquí tienes tus ${entityType}:\n${list}`;
    }

    if (tool === 'consultar_calendario') {
      if (!result || result.length === 0) {
        return 'No tienes eventos en tu calendario para hoy.';
      }
      const eventList = result.map((event: any) => {
        const start = new Date(event.start.dateTime || event.start.date).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true });
        return `  - *${event.summary}* a las ${start}`;
      }).join('\n');
      return `Aquí tienes tus eventos de hoy:\n${eventList}`;
    }

    // No mostrar búsquedas en el resumen (son internas)
    if (tool.startsWith('buscar_')) {
      return null;
    }

    // Mapear herramientas a nombres de entidad en español
    const entityNames: Record<string, string> = {
      'crear_empresa': 'Empresa',
      'crear_contacto': 'Contacto',
      'crear_oportunidad': 'Oportunidad',
      'crear_producto': 'Producto',
      'crear_actividad': 'Actividad',
      'actualizar_empresa': 'Empresa',
      'actualizar_contacto': 'Contacto',
      'actualizar_oportunidad': 'Oportunidad',
      'actualizar_producto': 'Producto',
      'actualizar_actividad': 'Actividad'
    };

    let details = '';
    if (result && typeof result === 'object') {
      if (tool.startsWith('crear_')) {
        const entityName = result.nombre || result.descripcion || 'entidad';
        const entityType = entityNames[tool] || tool.split('_')[1];
        details = `✅ ${entityType} creada: *${entityName}*`;
      } else if (tool.startsWith('actualizar_')) {
        const entityName = result.nombre || result.descripcion || 'entidad';
        const entityType = entityNames[tool] || tool.split('_')[1];
        details = `🔄 ${entityType} actualizada: *${entityName}*`;
      }
    } else {
      const entityType = entityNames[tool] || tool.split('_')[1];
      details = `✅ Acción completada: ${entityType}`;
    }
    return details;
  }).filter(part => part !== null);

  if (summaryParts.length === 0) {
    return `Hola ${vendedor?.nombre || 'amigo'}, he verificado la información y realizado las actualizaciones necesarias.`;
  }

  return `¡Listo ${vendedor?.nombre || 'amigo'}! Hecho. Aquí tienes el resumen:\n${summaryParts.join('\n')}`;
}