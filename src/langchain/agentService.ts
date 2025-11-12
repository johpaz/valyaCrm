import { crmWorkflow, WorkflowState } from '../langgraph/workflow';
import conversationService from '../services/conversationService'; // Importar conversationService
import logger from '../utils/logger';


/**
 * AgentService es el punto de entrada principal para manejar los mensajes de los usuarios.
 * Utiliza el workflow de LangGraph para orquestar la lógica de negocio, determinar la intención
 * del usuario y ejecutar las acciones apropiadas integrando knowledge graph y embeddings.
 */
class AgentService {
  /**
   * Inicializa el servicio con el modelo de IA generativa.
   */
  constructor() {
    logger.info('AgentService initialized with LangGraph workflow');
  }

  /**
   * Maneja un mensaje entrante de un usuario usando el workflow de LangGraph.
   * @param userId - El ID del usuario (número de teléfono).
   * @param userMessage - El mensaje enviado por el usuario.
   * @returns La respuesta a ser enviada al usuario.
   */
  async handleMessage(userId: string, userMessage: string): Promise<string> {
    const startTime = performance.now();
    try {
      logger.info(`Starting message processing for user ${userId}`);

      // Utiliza el caché para obtener los datos del vendedor.
      const sellerStart = performance.now();
      const vendedor = await conversationService.getSeller(userId);
      const sellerEnd = performance.now();
      logger.info(`Seller lookup completed in ${(sellerEnd - sellerStart).toFixed(2)}ms`);

      if (!vendedor) {
        return this.getUnregisteredUserMessage(userId);
      }

      const historyStart = performance.now();
      const history = await conversationService.getConversationHistory(userId);
      const historyEnd = performance.now();
      logger.info(`Conversation history retrieval completed in ${(historyEnd - historyStart).toFixed(2)}ms`);

      const currentState = conversationService.getActiveAgent(userId);

      // Si estamos esperando una aprobación, manejar como respuesta de aprobación
      if (currentState === 'awaiting_approval') {
        logger.info({ userId }, 'Handling approval response for user');

        // Para respuestas de aprobación, ejecutar directamente el plan aprobado
        // Por simplicidad, por ahora devolver mensaje de confirmación
        // En una implementación completa, se guardaría el plan y se ejecutaría aquí
        conversationService.setActiveAgent(userId, null);
        return `¡Perfecto ${vendedor.nombre}! He confirmado la acción. ¿En qué más puedo ayudarte?`;
      }

      // Estado inicial del workflow
      logger.info(`Initializing workflow with userMessage: "${userMessage}" (length: ${userMessage.length})`);
      const initialState: WorkflowState = {
        userMessage,
        vendedor,
        history,
        intent: null,
        knowledge: [],
        plan: [],
        requiresApproval: false,
        approvalMessage: '',
        executionResults: [],
        response: ''
      };

      // Ejecutar el workflow
      logger.info(`Starting LangGraph workflow for user ${userId}`);
      const workflowStart = performance.now();
      const finalState = await crmWorkflow.invoke(initialState);
      const workflowEnd = performance.now();
      logger.info(`Workflow execution completed in ${(workflowEnd - workflowStart).toFixed(2)}ms`);

      logger.info(`Workflow completed for user ${userId}, response: ${finalState.response}`);

      // Si el workflow indica que requiere aprobación, guardar el estado
      if (finalState.requiresApproval) {
        logger.info({ userId }, 'Setting user state to awaiting_approval');
        conversationService.setActiveAgent(userId, 'awaiting_approval');
      }

      const totalTime = performance.now() - startTime;
      logger.info(`Total message processing time for user ${userId}: ${totalTime.toFixed(2)}ms`);

      return finalState.response || 'Lo siento, no pude procesar tu mensaje correctamente.';

    } catch (error) {
      logger.error({ err: error }, 'Error in AgentService handleMessage');
      return 'Lo siento, estoy teniendo problemas técnicos. Por favor intenta de nuevo en un momento.';
    }
  }


  /**
   * Genera un mensaje estándar para usuarios no registrados en el sistema.
   * @param {string} userId - El ID del usuario (número de teléfono).
   * @returns {string} El mensaje para el usuario no registrado.
   */
  getUnregisteredUserMessage(userId: string): string {
    return `¡Hola! 👋\n\nParece que tu número de teléfono (${userId}) no está registrado en nuestro sistema CRM.\n\nPara poder ayudarte con la gestión de tu pipeline de ventas, necesito que estés registrado como vendedor autorizado.\n\n🔧 **¿Qué puedes hacer?**\n• Contacta a tu administrador o supervisor\n• Solicita que registren tu número en el sistema\n• Verifica que estés usando el número correcto\n\n💬 **¿Necesitas ayuda?**\nSi crees que esto es un error o necesitas asistencia, contacta al soporte técnico.\n\n¡Una vez que estés registrado, podrás acceder a todas las funciones del CRM! 🚀`;
  }
}

export default AgentService;