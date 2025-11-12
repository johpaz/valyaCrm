import { GoogleGenerativeAI } from '@google/generative-ai';
import logger from '../utils/logger';

// Tipos para las entidades CRM
export interface CRMMEntity {
  id: string;
  type: 'empresa' | 'contacto' | 'oportunidad' | 'actividad' | 'producto' | 'vendedor';
  data: any;
}

// Estructura para almacenar embeddings en memoria
interface StoredEmbedding {
  entityId: string;
  entityType: string;
  text: string;
  embedding: number[];
}

// Estructura para cache de texto con TTL
interface CachedTextEmbedding {
  embedding: number[];
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

export class EmbeddingService {
  private genAI: GoogleGenerativeAI;
  private embeddingsStore: Map<string, StoredEmbedding> = new Map();
  private textCache: Map<string, CachedTextEmbedding> = new Map();
  private readonly DEFAULT_TTL = 30 * 60 * 1000; // 30 minutos

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  /**
    * Genera embedding para un texto simple con caching
    */
   async vectorizarTexto(text: string, ttl?: number): Promise<number[]> {
     try {
       // Verificar cache primero
       const cached = this.getCachedTextEmbedding(text);
       if (cached) {
         logger.info(`Embedding cacheado encontrado para texto: ${text.substring(0, 50)}...`);
         return cached;
       }

       const model = this.genAI.getGenerativeModel({ model: 'text-embedding-004' });
       const result = await model.embedContent(text);
       const embedding = result.embedding.values;

       // Almacenar en cache
       this.setCachedTextEmbedding(text, embedding, ttl || this.DEFAULT_TTL);

       return embedding;
     } catch (error) {
       logger.error(`Error generando embedding para texto: ${error}`);
       throw new Error(`Error al vectorizar texto: ${error}`);
     }
   }

  /**
   * Genera embedding para un documento completo
   */
  async vectorizarDocumento(document: string): Promise<number[]> {
    try {
      // Para documentos largos, dividir en chunks si es necesario
      const maxLength = 10000; // Límite aproximado para Gemini
      const chunks = this.splitTextIntoChunks(document, maxLength);

      if (chunks.length === 1) {
        return await this.vectorizarTexto(document);
      }

      // Para múltiples chunks, generar embeddings y promediar
      const embeddings = await Promise.all(
        chunks.map(chunk => this.vectorizarTexto(chunk))
      );

      // Calcular promedio de embeddings
      const averagedEmbedding = this.averageEmbeddings(embeddings);
      return averagedEmbedding;
    } catch (error) {
      logger.error(`Error generando embedding para documento: ${error}`);
      throw new Error(`Error al vectorizar documento: ${error}`);
    }
  }

  /**
   * Genera embedding para una entidad CRM
   */
  async vectorizarEntidadCRM(entity: CRMMEntity): Promise<number[]> {
    try {
      // Crear texto representativo de la entidad
      const textRepresentation = this.createEntityTextRepresentation(entity);

      // Generar embedding
      const embedding = await this.vectorizarTexto(textRepresentation);

      // Almacenar en el grafo de conocimiento
      await this.storeEntityEmbedding(entity, textRepresentation, embedding);

      return embedding;
    } catch (error) {
      logger.error(`Error generando embedding para entidad CRM: ${error}`);
      throw new Error(`Error al vectorizar entidad CRM: ${error}`);
    }
  }

  /**
   * Almacena el embedding de una entidad en memoria
   */
  private async storeEntityEmbedding(
    entity: CRMMEntity,
    text: string,
    embedding: number[]
  ): Promise<void> {
    const key = `${entity.type}:${entity.id}`;
    this.embeddingsStore.set(key, {
      entityId: entity.id,
      entityType: entity.type,
      text,
      embedding
    });
    logger.info(`Embedding almacenado en memoria para entidad ${entity.type}:${entity.id}`);
  }

  /**
    * Busca entidades similares usando embeddings con similitud coseno
    */
   async buscarEntidadesSimilares(
     query: string,
     limit: number = 10,
     maxComparisons: number = 1000 // Limitar comparaciones para rendimiento
   ): Promise<Array<{
     entityId: string;
     entityType: string;
     text: string;
     score?: number;
   }>> {
     try {
       // Limpiar cache expirado
       this.cleanExpiredCache();

       // Generar embedding para la query
       const queryEmbedding = await this.vectorizarTexto(query);

       // Calcular similitud coseno con embeddings almacenados (limitado)
       const similarities: Array<{
         entityId: string;
         entityType: string;
         text: string;
         score: number;
       }> = [];

       // Convertir a array y tomar una muestra si hay demasiadas entidades
       const storedEmbeddings = Array.from(this.embeddingsStore.values());
       const comparisonSet = storedEmbeddings.length > maxComparisons
         ? storedEmbeddings.slice(0, maxComparisons) // Tomar primeras N para simplicidad
         : storedEmbeddings;

       for (const stored of comparisonSet) {
         const score = this.cosineSimilarity(queryEmbedding, stored.embedding);
         similarities.push({
           entityId: stored.entityId,
           entityType: stored.entityType,
           text: stored.text,
           score
         });
       }

       // Ordenar por similitud descendente y limitar resultados
       similarities.sort((a, b) => b.score - a.score);
       return similarities.slice(0, limit);
     } catch (error) {
       logger.error(`Error buscando entidades similares: ${error}`);
       throw new Error(`Error al buscar entidades similares: ${error}`);
     }
   }

  /**
   * Crea una representación textual de una entidad CRM
   */
  private createEntityTextRepresentation(entity: CRMMEntity): string {
    const { type, data } = entity;

    switch (type) {
      case 'empresa':
        return `Empresa: ${data.nombre || ''} ${data.sector || ''} ${data.descripcion || ''} ${data.ubicacion || ''}`.trim();

      case 'contacto':
        return `Contacto: ${data.nombre || ''} ${data.apellido || ''} ${data.email || ''} ${data.cargo || ''}`.trim();

      case 'oportunidad':
        return `Oportunidad: ${data.titulo || ''} ${data.descripcion || ''} valor: ${data.valor || 0} etapa: ${data.etapa || ''}`.trim();

      case 'actividad':
        return `Actividad: ${data.tipo || ''} ${data.descripcion || ''}`.trim();

      case 'producto':
        return `Producto: ${data.nombre || ''} ${data.descripcion || ''} precio: ${data.precio || 0} categoria: ${data.categoria || ''}`.trim();

      case 'vendedor':
        return `Vendedor: ${data.nombre || ''} ${data.apellido || ''} ${data.email || ''} ${data.departamento || ''}`.trim();

      default:
        return JSON.stringify(data);
    }
  }

  /**
   * Divide un texto largo en chunks más pequeños
   */
  private splitTextIntoChunks(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) {
      return [text];
    }

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      let end = start + maxLength;

      // Intentar cortar en un límite de palabra
      if (end < text.length) {
        const lastSpace = text.lastIndexOf(' ', end);
        if (lastSpace > start) {
          end = lastSpace;
        }
      }

      chunks.push(text.slice(start, end));
      start = end;
    }

    return chunks;
  }

  /**
   * Calcula el promedio de múltiples embeddings
   */
  private averageEmbeddings(embeddings: number[][]): number[] {
    if (embeddings.length === 0) return [];

    const dimension = embeddings[0].length;
    const averaged = new Array(dimension).fill(0);

    for (const embedding of embeddings) {
      for (let i = 0; i < dimension; i++) {
        averaged[i] += embedding[i];
      }
    }

    return averaged.map(value => value / embeddings.length);
  }

  /**
   * Calcula la similitud coseno entre dos vectores
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error('Los vectores deben tener la misma dimensión');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
    * Obtiene embedding cacheado para texto si existe y no ha expirado
    */
  private getCachedTextEmbedding(text: string): number[] | null {
    const cached = this.textCache.get(text);
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > cached.ttl) {
      // Cache expirado, remover
      this.textCache.delete(text);
      return null;
    }

    return cached.embedding;
  }

  /**
    * Almacena embedding en cache con TTL
    */
  private setCachedTextEmbedding(text: string, embedding: number[], ttl: number): void {
    this.textCache.set(text, {
      embedding,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
    * Limpia entradas expiradas del cache de texto
    */
  private cleanExpiredCache(): void {
    const now = Date.now();
    for (const [key, cached] of this.textCache.entries()) {
      if (now - cached.timestamp > cached.ttl) {
        this.textCache.delete(key);
      }
    }
  }

  /**
    * Cierra las conexiones
    */
  async close(): Promise<void> {
    // Limpiar el store de embeddings en memoria
    this.embeddingsStore.clear();
    this.textCache.clear();
  }
}
