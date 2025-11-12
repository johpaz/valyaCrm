import { GoogleGenerativeAI } from '@google/generative-ai';
import { tools } from '../../services/toolsManager';
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

export async function planningNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
  const { userMessage, history, intent, knowledge } = state;

  // Solo planificar si es un comando CRM
  if (intent !== 'COMANDO_CRM') {
    return { plan: [], requiresApproval: false, approvalMessage: '' };
  }

  try {
    // Inicializar modelo Gemini
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-pro",
      generationConfig: {
        temperature: 0.2,
        topK: 1,
        topP: 0.9,
        maxOutputTokens: 10000,
      }
    });

    // Construir contexto de búsqueda si hay conocimiento disponible
    let searchContext: Record<string, any> = {};
    if (knowledge && knowledge.length > 0) {
      // Mapear conocimiento a IDs de entidades para contexto
      knowledge.forEach(item => {
        const { entityType, entityId } = item;
        const key = `${entityType}Id`;
        if (!searchContext[key]) {
          searchContext[key] = entityId;
        }
      });
    }

    // Preparar historial de conversación
    const historyText = history.map((h: any) => `${h.role}: ${h.parts[0].text}`).join('\n');

    // Ejecutar búsquedas preliminares si hay conocimiento disponible
    let toolResults: any[] = [];
    if (Object.keys(searchContext).length > 0) {
      // Si hay IDs conocidos, buscar información adicional
      for (const [key, entityId] of Object.entries(searchContext)) {
        try {
          let toolName = '';
          if (key === 'empresaId') toolName = 'buscar_empresa_por_id';
          else if (key === 'contactoId') toolName = 'buscar_contacto_por_id';
          // Para otros tipos, podríamos agregar más búsquedas

          if (toolName) {
            const tool = tools.find(t => t.name === toolName);
            if (tool) {
              const result = await tool.func(JSON.stringify({ id: entityId }));
              toolResults.push({ tool: toolName, result: JSON.parse(result) });
            }
          }
        } catch (error) {
          logger.error({ err: error }, `Error in preliminary search for ${key}`);
        }
      }
    }

    // Prompt para planificación usando Gemini directamente
    const planningPrompt = `
Eres un planificador inteligente para un sistema CRM de ventas. Tu tarea es analizar el mensaje del usuario y generar un plan de acciones específico para ejecutar en el CRM.

**Historial de Conversación:**
${historyText}

**Mensaje del Usuario:**
"${userMessage}"

**Contexto Adicional:**
${searchContext ? JSON.stringify(searchContext, null, 2) : 'Sin contexto adicional'}

**Información encontrada:**
${toolResults.map(tr => `${tr.tool}: ${JSON.stringify(tr.result)}`).join('\n')}

**Herramientas Disponibles:**
- crear_empresa: Crear una nueva empresa
- crear_contacto: Crear un nuevo contacto
- crear_oportunidad: Crear una nueva oportunidad
- crear_actividad: Crear una nueva actividad
- crear_producto: Crear un nuevo producto
- actualizar_empresa: Actualizar una empresa existente
- actualizar_contacto: Actualizar un contacto existente
- actualizar_oportunidad: Actualizar una oportunidad existente
- actualizar_actividad: Actualizar una actividad existente
- actualizar_producto: Actualizar un producto existente
- buscar_empresa_por_nombre: Buscar empresa por nombre
- buscar_contacto_por_nombre: Buscar contacto por nombre
- buscar_oportunidad_por_nombre: Buscar oportunidad por nombre
- buscar_producto_por_nombre: Buscar producto por nombre
- buscar_actividad_por_descripcion: Buscar actividad por descripción
- listar_empresas: Listar todas las empresas
- listar_contactos: Listar todos los contactos
- listar_oportunidades: Listar todas las oportunidades
- listar_productos: Listar todos los productos
- listar_actividades: Listar todas las actividades
- listar_ventas_ganadas: Listar ventas ganadas
- consultar_calendario: Consultar eventos del calendario

**Instrucciones:**
1. Analiza el mensaje del usuario y determina qué acciones del CRM necesita.
2. Genera un plan secuencial de pasos usando las herramientas disponibles.
3. Cada paso debe tener "tool" (nombre de la herramienta) y "args" (argumentos requeridos).
4. Si la acción requiere aprobación del usuario (como crear o actualizar datos importantes), marca requiresApproval: true y proporciona un mensaje de aprobación.
5. Si no se puede determinar un plan claro, devuelve un mensaje pidiendo aclaración.
6. Usa el contexto para resolver referencias (ej: IDs de entidades encontradas).

**Formato de Respuesta JSON:**
{
  "requiresApproval": boolean,
  "plan": [{"tool": "string", "args": {}}],
  "message": "string (opcional)",
  "approvalMessage": "string (opcional)"
}
`;

    const result = await model.generateContent(planningPrompt);
    const responseText = result.response.text().trim();

    // Intentar parsear el JSON
    let planData;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        planData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      logger.warn('Could not parse plan JSON, using fallback');
      planData = {
        requiresApproval: false,
        plan: [],
        message: 'No pude determinar claramente qué acción realizar. ¿Podrías reformular tu solicitud?'
      };
    }

    logger.info(`Plan generated with LangGraph: ${JSON.stringify(planData)}`);

    return {
      plan: planData.plan || [],
      requiresApproval: planData.requiresApproval || false,
      approvalMessage: planData.approvalMessage || planData.message || ''
    };

  } catch (error) {
    logger.error({ err: error }, 'Error in planningNode');
    return {
      plan: [],
      requiresApproval: false,
      approvalMessage: 'Lo siento, tuve problemas al generar un plan de acción. ¿Podrías reformular tu solicitud?'
    };
  }
}