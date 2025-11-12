
import logger from '../utils/logger.js';
import Conversacion from '../models/conversacionModel.js';
import CRMService from './crmService.js';
import type {
  Vendedor,
  ConversationHistory
} from '../types/index.js';

const crmService = new CRMService();

class ConversationService {
  private activeAgents: Map<string, any>; // Almacena el agente activo por userId
  private sellerCache: Map<string, Vendedor>; // Caché para los datos del vendedor

  constructor() {
    this.activeAgents = new Map();
    this.sellerCache = new Map();
  }

  // --- Métodos para el caché de Vendedor ---

  async getSeller(userId: string): Promise<Vendedor | null> {
    if (this.sellerCache.has(userId)) {
      logger.info(`Vendedor encontrado en caché para ${userId}`);
      return this.sellerCache.get(userId) || null;
    }

    logger.info(`Vendedor no encontrado en caché para ${userId}. Buscando en BD...`);
    const seller = await crmService.buscarVendedorPorTelefono(userId);
    if (seller) {
      this.sellerCache.set(userId, seller);
      logger.info(`Vendedor para ${userId} guardado en caché.`);
    }
    return seller;
  }

  // --- Métodos de Agente Activo ---

  getActiveAgent(userId: string): any {
    return this.activeAgents.get(userId);
  }

  setActiveAgent(userId: string, agent: any): void {
    if (agent) {
      this.activeAgents.set(userId, agent);
      logger.debug(`Agente activo para ${userId}: ${agent.constructor.name}`);
    } else {
      this.activeAgents.delete(userId);
      logger.debug(`Agente desactivado para ${userId}.`);
    }
  }

  // --- Métodos de Conversación ---

  async saveMessage(
    userId: string,
    message: string,
    sender: 'user' | 'model' | 'system' = 'user',
    metadata: Record<string, any> = {}
  ): Promise<string> {
    try {
      const doc = new Conversacion({
        userId,
        text: message,
        sender,
        metadata: { messageLength: message.length, ...metadata }
      });
      await doc.save();
      logger.debug(`Mensaje guardado para ${userId}: ${message.substring(0, 50)}...`);
      return doc._id.toString();
    } catch (error) {
      logger.error(`Error guardando mensaje en MongoDB: ${(error as Error).message}`);
      throw new Error(`Error guardando mensaje: ${(error as Error).message}`);
    }
  }

  async getConversationHistory(userId: string, limit: number = 5): Promise<ConversationHistory> {
    try {
      const history = await Conversacion.find({ userId })
        .sort({ timestamp: -1 })
        .limit(limit);

      history.reverse(); // Ordenar cronológicamente

      logger.debug(`Historial recuperado para ${userId}: ${history.length} mensajes`);

      const formattedHistory: ConversationHistory = history.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
      }));

      // Asegurarse de que el historial no comience con múltiples mensajes del modelo
      let firstUserIndex = formattedHistory.findIndex(h => h.role === 'user');
      if (firstUserIndex > 0) {
        return formattedHistory.slice(firstUserIndex);
      }

      return formattedHistory;
    } catch (error) {
      logger.error(`Error recuperando historial de MongoDB: ${(error as Error).message}`);
      return [];
    }
  }
}

export default new ConversationService();
