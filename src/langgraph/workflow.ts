import { tools } from '../services/toolsManager';
import logger from '../utils/logger';

// Variables globales para caching de modelos de Gemini
let genAI: any = null;
let conversationalModel: any = null;

// Función para inicializar modelos una vez (lazy loading)
async function initModels() {
  if (!genAI) {
    logger.info('Initializing Gemini models for caching...');
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

    conversationalModel = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1000,
      }
    });

    logger.info('Gemini models initialized successfully');
  }
}

export interface WorkflowState {
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




// Función principal del workflow simplificado con un solo agente
export async function runCRMWorkflow(initialState: WorkflowState): Promise<WorkflowState> {
  let state = { ...initialState };
  const startTime = performance.now();

  try {
    logger.info('Running unified CRM agent...');

    // Inicializar modelos si no están cacheados
    await initModels();

    const { userMessage, history, vendedor } = state;
    logger.info(`Workflow processing userMessage: "${userMessage}" (length: ${userMessage.length})`);
    const historyText = Array.isArray(history) ? history.map(h => `${h.role}: ${h.parts[0].text}`).join('\n') : '';

    // Respuestas rápidas para mensajes comunes
    const message = userMessage.toLowerCase().trim();
    if (message === 'hola' || message === 'hi' || message === 'hello' || message === 'buenos dias' || message === 'buenas tardes' || message === 'buenas noches') {
      logger.info('Using fast response for greeting');
      state.response = `¡Hola ${vendedor?.nombre || 'amigo'}! 👋 Soy Valya, tu asistente de ventas. ¿En qué puedo ayudarte hoy con tu CRM?`;
      return state;
    }

    if (message === 'gracias' || message === 'thank you' || message === 'thanks') {
      logger.info('Using fast response for thanks');
      state.response = `¡De nada ${vendedor?.nombre || 'amigo'}! 😊 ¿Hay algo más en lo que pueda asistirte?`;
      return state;
    }

    logger.info(`Processing user message: "${userMessage}"`);
    logger.info(`Seller: ${vendedor?.nombre || 'Unknown'}, History length: ${Array.isArray(history) ? history.length : 0}`);

    // Prompt unificado para respuesta conversacional y acciones CRM
    const unifiedPrompt = `
Eres Valya, una asistente de ventas de IA amigable y conversadora para un CRM B2B. Tu tarea es responder al mensaje del usuario de manera natural, útil y fluida, interpretando la conversación y llamando herramientas cuando sea necesario.

**Contexto del Usuario:**
- Vendedor: ${vendedor?.nombre || 'Usuario'}
- Historial de Conversación:
${historyText}

**Mensaje del Usuario:**
"${userMessage}"

**Instrucciones Generales:**
- Sé amigable, conversadora y natural en tus respuestas.
- Preséntate como Valya y usa el nombre del vendedor (${vendedor?.nombre || 'amigo'}) en tus respuestas cuando sea apropiado.
- Interpreta la intención del usuario basándote en el contexto y el historial.
- Si el mensaje es una conversación general (saludos, preguntas casuales, etc.), responde de manera conversacional sin usar herramientas.
- Si el usuario quiere realizar acciones en el CRM (crear, actualizar, buscar, eliminar empresas, contactos, oportunidades, actividades), identifica la herramienta apropiada y úsala.
- Puedes combinar conversación con acciones: por ejemplo, "Voy a crear esa empresa para ti" y luego usar la herramienta.
- Si no estás seguro, pide aclaración de manera amable.
- Mantén el enfoque en ayudar al vendedor con su pipeline de ventas.

**Herramientas Disponibles:**
${tools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

**Cómo Usar Herramientas:**
Si necesitas usar una herramienta, responde en el formato:
TOOL: nombre_de_la_herramienta
ARGS: {"param1": "value1", "param2": "value2"}

Luego, en una línea separada, incluye tu respuesta conversacional.

**Ejemplos:**
- Para conversación: "¡Claro! Aquí tienes la información que pediste."
- Para acción: "TOOL: buscar_empresas\nARGS: {"nombre": "ABC Corp"}\nVoy a buscar esa empresa para ti."

Responde de manera natural, como si estuvieras charlando con el vendedor.
`;

    logger.info(`Generated unified prompt length: ${unifiedPrompt.length}`);

    let fullResponse = '';
    try {
      const result = await conversationalModel.generateContent(unifiedPrompt);
      fullResponse = result.response.text();
      logger.info(`Gemini full response length: ${fullResponse.length}, content: "${fullResponse.slice(0, 200)}..."`);
    } catch (geminiError: any) {
      logger.error({ err: geminiError }, 'Error calling Gemini API');
      fullResponse = 'Lo siento, estoy teniendo problemas técnicos con mi IA. ¿Puedes intentarlo de nuevo?';
    }

    // Parsear si hay herramienta
    const toolMatch = fullResponse.match(/TOOL:\s*(\w+)\nARGS:\s*(\{.*\})/);
    let response = fullResponse;

    if (toolMatch) {
      logger.info(`Tool match found: ${toolMatch[0]}`);
      const toolName = toolMatch[1];
      const args = JSON.parse(toolMatch[2]);

      const tool = tools.find(t => t.name === toolName);
      if (tool) {
        try {
          const toolResult = await tool.func(JSON.stringify(args));
          const resultData = JSON.parse(toolResult);
          // Reemplazar la parte de la herramienta con el resultado
          response = fullResponse.replace(/TOOL:.*\nARGS:.*\n/, `Acción realizada: ${resultData.message || 'Completado exitosamente'}.\n`);
          logger.info(`Tool executed successfully, response: ${response}`);
        } catch (error: any) {
          logger.error({ err: error }, `Error executing tool ${toolName}`);
          response = fullResponse.replace(/TOOL:.*\nARGS:.*\n/, `Lo siento, hubo un error ejecutando la acción: ${error.message}.\n`);
        }
      } else {
        response = fullResponse.replace(/TOOL:.*\nARGS:.*\n/, 'No pude identificar la herramienta apropiada.\n');
        logger.warn(`Tool not found: ${toolName}`);
      }
    } else {
      logger.info('No tool match found, using full response as is');
      response = fullResponse;
    }

    state.response = response;

    const totalTime = performance.now() - startTime;
    logger.info(`Unified agent completed in ${totalTime.toFixed(2)}ms`);

    return state;

  } catch (error) {
    logger.error({ err: error }, 'Error in unified CRM workflow');
    return {
      ...state,
      response: 'Lo siento, tuve un problema procesando tu solicitud. ¿Podrías intentarlo de nuevo?'
    };
  }
}

// Exportar función principal como workflow
export const crmWorkflow = {
  invoke: runCRMWorkflow
};