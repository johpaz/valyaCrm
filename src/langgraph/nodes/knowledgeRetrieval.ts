import { EmbeddingService } from '../../services/embeddingService';
import { KnowledgeGraphService } from '../../services/knowledgeGraphService';
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

export async function knowledgeRetrievalNode(
  state: WorkflowState,
  embeddingService?: EmbeddingService,
  knowledgeGraph?: KnowledgeGraphService
): Promise<Partial<WorkflowState>> {
  const { userMessage, intent } = state;

  // Solo buscar conocimiento si es un comando CRM
  if (intent !== 'COMANDO_CRM') {
    return { knowledge: [] };
  }

  try {
    // Usar servicios inyectados o crear si no se proporcionan (para compatibilidad)
    const embService = embeddingService || new EmbeddingService(process.env.GEMINI_API_KEY!);
    const kgService = knowledgeGraph || new KnowledgeGraphService(embService);

    // Buscar entidades similares usando embeddings
    const similarEntities = await embService.buscarEntidadesSimilares(userMessage, 5);
    logger.info(`Found ${similarEntities.length} similar entities for query: ${userMessage}`);

    // Enriquecer con datos completos del grafo de conocimiento
    const enrichedKnowledge = [];
    for (const entity of similarEntities) {
      try {
        let fullEntity = null;
        switch (entity.entityType) {
          case 'empresa':
            fullEntity = await kgService.getEmpresa(entity.entityId);
            break;
          case 'contacto':
            fullEntity = await kgService.getContacto(entity.entityId);
            break;
          case 'oportunidad':
            fullEntity = await kgService.getOportunidad(entity.entityId);
            break;
          case 'actividad':
            fullEntity = await kgService.getActividad(entity.entityId);
            break;
          case 'producto':
            fullEntity = await kgService.getProducto(entity.entityId);
            break;
          case 'vendedor':
            fullEntity = await kgService.getVendedor(entity.entityId);
            break;
        }

        if (fullEntity) {
          enrichedKnowledge.push({
            ...entity,
            fullData: fullEntity,
            score: entity.score
          });
        }
      } catch (error) {
        logger.warn(`Error retrieving full data for entity ${entity.entityId}: ${error}`);
      }
    }

    logger.info(`Enriched knowledge with ${enrichedKnowledge.length} complete entities`);
    return { knowledge: enrichedKnowledge };

  } catch (error) {
    logger.error({ err: error }, 'Error in knowledgeRetrievalNode');
    return { knowledge: [] };
  }
}