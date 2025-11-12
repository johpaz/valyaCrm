import logger from '../utils/logger';
import Empresa from '../models/empresaModel';
import Contacto from '../models/contactoModel';
import Oportunidad from '../models/oportunidadModel';
import Actividad from '../models/actividadModel';
import Producto from '../models/productoModel';
import Vendedor from '../models/vendedorModel';
import { EmbeddingService, CRMMEntity } from './embeddingService';

// Interfaces para las entidades del grafo (compatibles con modelos Mongoose)
export interface Empresa {
  id: string;
  nombre: string | null;
  sector?: string | null;
  tamano?: string | null;
  ubicacion?: string | null;
  sitioWeb?: string | null;
  descripcion?: string | null;
  embedding?: number[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Contacto {
  id: string;
  nombre: string | null;
  apellido?: string;
  email: string | null;
  telefono?: string | null;
  cargo?: string | null;
  empresaId?: string;
  embedding?: number[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Oportunidad {
  id: string;
  titulo: string | null;
  descripcion?: string | null;
  valor: number;
  etapa: string;
  probabilidad?: number;
  fechaCierre: Date | null;
  empresaId: string;
  vendedorId: string;
  contactoId?: string | null;
  embedding?: number[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Actividad {
  id: string;
  tipo: string | null;
  descripcion: string | null;
  fecha: Date;
  oportunidadId: string;
  vendedorId: string;
  embedding?: number[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Producto {
  id: string;
  nombre: string;
  descripcion?: string | null;
  precio: number | null;
  categoria?: string | null;
  embedding?: number[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Vendedor {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  telefono?: string;
  departamento?: string;
  embedding?: number[];
  createdAt: Date;
  updatedAt: Date;
}

// Estructuras para el grafo en memoria
interface GraphNode {
  id: string;
  type: string;
  data: any;
  embedding?: number[];
}

interface GraphRelationship {
  from: string;
  to: string;
  type: string;
}

export class KnowledgeGraphService {
  private nodes: Map<string, GraphNode> = new Map();
  private relationships: Map<string, GraphRelationship[]> = new Map();
  private embeddingService: EmbeddingService;
  private loadedEntityTypes: Set<string> = new Set(); // Track which entity types are fully loaded
  private isFullyLoaded: boolean = false; // Track if full graph is loaded

  constructor(embeddingService: EmbeddingService) {
    this.embeddingService = embeddingService;
  }

  // Método para cerrar la conexión
  async close(): Promise<void> {
    this.nodes.clear();
    this.relationships.clear();
    this.loadedEntityTypes.clear();
    this.isFullyLoaded = false;
    await this.embeddingService.close();
  }

  // Método para carga lazy de entidades por tipo
  private async loadEntitiesByType(entityType: string): Promise<void> {
    if (this.loadedEntityTypes.has(entityType)) return;

    logger.info(`Cargando entidades de tipo ${entityType} de forma lazy...`);

    try {
      switch (entityType) {
        case 'empresa':
          await this.loadEmpresas();
          break;
        case 'contacto':
          await this.loadContactos();
          break;
        case 'oportunidad':
          await this.loadOportunidades();
          break;
        case 'actividad':
          await this.loadActividades();
          break;
        case 'producto':
          await this.loadProductos();
          break;
        case 'vendedor':
          await this.loadVendedores();
          break;
      }
      this.loadedEntityTypes.add(entityType);
    } catch (error) {
      logger.error(`Error cargando entidades ${entityType}: ${error}`);
    }
  }

  // Métodos auxiliares para carga lazy por tipo
  private async loadEmpresas(): Promise<void> {
    const empresas = await Empresa.find({});
    for (const emp of empresas) {
      const empresaData: Empresa = {
        id: emp._id.toString(),
        nombre: emp.nombre || null,
        sector: emp.sector || null,
        tamano: emp.tamano || null,
        ubicacion: emp.ubicacion || null,
        sitioWeb: emp.sitioWeb || null,
        descripcion: emp.descripcion || null,
        embedding: emp.embedding,
        createdAt: emp.createdAt,
        updatedAt: emp.updatedAt,
      };
      this.nodes.set(empresaData.id, {
        id: empresaData.id,
        type: 'empresa',
        data: empresaData
      });
    }
  }

  private async loadContactos(): Promise<void> {
    const contactos = await Contacto.find({});
    for (const cont of contactos) {
      const contactoData: Contacto = {
        id: cont._id.toString(),
        nombre: cont.nombre || '',
        apellido: '',
        email: cont.email || '',
        telefono: cont.telefono || null,
        cargo: cont.cargo || null,
        empresaId: cont.empresaId?.toString(),
        createdAt: cont.fechaCreacion,
        updatedAt: cont.fechaActualizacion,
      };
      this.nodes.set(contactoData.id, {
        id: contactoData.id,
        type: 'contacto',
        data: contactoData
      });
      if (contactoData.empresaId) {
        this.addRelationship(contactoData.empresaId, contactoData.id, 'HAS_CONTACT');
      }
    }
  }

  private async loadOportunidades(): Promise<void> {
    const oportunidades = await Oportunidad.find({});
    for (const opp of oportunidades) {
      const oportunidadData: Oportunidad = {
        id: opp._id.toString(),
        titulo: opp.nombre || '',
        descripcion: opp.proximosPasos || null,
        valor: opp.valorEstimado || 0,
        etapa: opp.estado || '',
        probabilidad: 0,
        fechaCierre: opp.fechaCierre || new Date(),
        empresaId: opp.empresaId?.toString() || '',
        vendedorId: opp.vendedorId?.toString() || '',
        contactoId: opp.contactoId?.toString() || null,
        createdAt: opp.fechaCreacion,
        updatedAt: opp.fechaActualizacion,
      };
      this.nodes.set(oportunidadData.id, {
        id: oportunidadData.id,
        type: 'oportunidad',
        data: oportunidadData
      });
      this.addRelationship(oportunidadData.empresaId, oportunidadData.id, 'HAS_OPPORTUNITY');
      this.addRelationship(oportunidadData.vendedorId, oportunidadData.id, 'ASSIGNED_TO');
      if (oportunidadData.contactoId) {
        this.addRelationship(oportunidadData.id, oportunidadData.contactoId, 'INVOLVES');
      }
    }
  }

  private async loadActividades(): Promise<void> {
    const actividades = await Actividad.find({});
    for (const act of actividades) {
      const actividadData: Actividad = {
        id: act._id.toString(),
        tipo: act.tipo || '',
        descripcion: act.descripcion || '',
        fecha: act.fecha,
        oportunidadId: act.oportunidadId.toString(),
        vendedorId: act.vendedorId.toString(),
        createdAt: act.fechaCreacion,
        updatedAt: act.fechaActualizacion,
      };
      this.nodes.set(actividadData.id, {
        id: actividadData.id,
        type: 'actividad',
        data: actividadData
      });
      this.addRelationship(actividadData.oportunidadId, actividadData.id, 'HAS_ACTIVITY');
    }
  }

  private async loadProductos(): Promise<void> {
    const productos = await Producto.find({});
    for (const prod of productos) {
      const productoData: Producto = {
        id: prod._id.toString(),
        nombre: prod.nombre || '',
        descripcion: prod.descripcion || null,
        precio: prod.precio || null,
        categoria: prod.clasificacion || null,
        createdAt: prod.fechaActualizacion,
        updatedAt: prod.fechaActualizacion,
      };
      this.nodes.set(productoData.id, {
        id: productoData.id,
        type: 'producto',
        data: productoData
      });
    }
  }

  private async loadVendedores(): Promise<void> {
    const vendedores = await Vendedor.find({});
    for (const vend of vendedores) {
      const vendedorData: Vendedor = {
        id: vend._id.toString(),
        nombre: vend.nombre || '',
        apellido: '', // No hay apellido en el modelo
        email: vend.email || '',
        telefono: vend.telefono || '',
        departamento: vend.cargo || '', // Usar cargo como departamento
        createdAt: vend.fechaCreacion,
        updatedAt: vend.fechaActualizacion,
      };
      this.nodes.set(vendedorData.id, {
        id: vendedorData.id,
        type: 'vendedor',
        data: vendedorData
      });
    }
  }

  // Construir grafo dinámicamente desde MongoDB
  async buildGraphFromMongoDB(): Promise<void> {
    logger.info('Construyendo grafo de conocimiento desde MongoDB...');

    // Limpiar grafo actual
    this.nodes.clear();
    this.relationships.clear();

    // Cargar empresas
    const empresas = await Empresa.find({});
    for (const emp of empresas) {
      const empresaData: Empresa = {
        id: emp._id.toString(),
        nombre: emp.nombre || null,
        sector: emp.sector || null,
        tamano: emp.tamano || null,
        ubicacion: emp.ubicacion || null,
        sitioWeb: emp.sitioWeb || null,
        descripcion: emp.descripcion || null,
        embedding: emp.embedding,
        createdAt: emp.createdAt,
        updatedAt: emp.updatedAt,
      };

      this.nodes.set(empresaData.id, {
        id: empresaData.id,
        type: 'empresa',
        data: empresaData
      });
    }

    // Cargar contactos
    const contactos = await Contacto.find({});
    for (const cont of contactos) {
      const contactoData: Contacto = {
        id: cont._id.toString(),
        nombre: cont.nombre || '',
        apellido: '', // No hay apellido en el modelo
        email: cont.email || '',
        telefono: cont.telefono || null,
        cargo: cont.cargo || null,
        empresaId: cont.empresaId?.toString(),
        createdAt: cont.fechaCreacion,
        updatedAt: cont.fechaActualizacion,
      };

      this.nodes.set(contactoData.id, {
        id: contactoData.id,
        type: 'contacto',
        data: contactoData
      });

      // Crear relación empresa-contacto
      if (contactoData.empresaId) {
        this.addRelationship(contactoData.empresaId, contactoData.id, 'HAS_CONTACT');
      }
    }

    // Cargar oportunidades
    const oportunidades = await Oportunidad.find({});
    for (const opp of oportunidades) {
      const oportunidadData: Oportunidad = {
        id: opp._id.toString(),
        titulo: opp.nombre || '',
        descripcion: opp.proximosPasos || null,
        valor: opp.valorEstimado || 0,
        etapa: opp.estado || '',
        probabilidad: 0, // No hay probabilidad en el modelo
        fechaCierre: opp.fechaCierre || new Date(),
        empresaId: opp.empresaId?.toString() || '',
        vendedorId: opp.vendedorId?.toString() || '',
        contactoId: opp.contactoId?.toString() || null,
        createdAt: opp.fechaCreacion,
        updatedAt: opp.fechaActualizacion,
      };

      this.nodes.set(oportunidadData.id, {
        id: oportunidadData.id,
        type: 'oportunidad',
        data: oportunidadData
      });

      // Crear relaciones
      this.addRelationship(oportunidadData.empresaId, oportunidadData.id, 'HAS_OPPORTUNITY');
      this.addRelationship(oportunidadData.vendedorId, oportunidadData.id, 'ASSIGNED_TO');
      if (oportunidadData.contactoId) {
        this.addRelationship(oportunidadData.id, oportunidadData.contactoId, 'INVOLVES');
      }
    }

    // Cargar actividades
    const actividades = await Actividad.find({});
    for (const act of actividades) {
      const actividadData: Actividad = {
        id: act._id.toString(),
        tipo: act.tipo || '',
        descripcion: act.descripcion || '',
        fecha: act.fecha,
        oportunidadId: act.oportunidadId.toString(),
        vendedorId: act.vendedorId.toString(),
        createdAt: act.fechaCreacion,
        updatedAt: act.fechaActualizacion,
      };

      this.nodes.set(actividadData.id, {
        id: actividadData.id,
        type: 'actividad',
        data: actividadData
      });

      // Crear relación oportunidad-actividad
      this.addRelationship(actividadData.oportunidadId, actividadData.id, 'HAS_ACTIVITY');
    }

    // Cargar productos
    const productos = await Producto.find({});
    for (const prod of productos) {
      const productoData: Producto = {
        id: prod._id.toString(),
        nombre: prod.nombre || '',
        descripcion: prod.descripcion || null,
        precio: prod.precio || null,
        categoria: prod.clasificacion || null,
        createdAt: prod.fechaActualizacion,
        updatedAt: prod.fechaActualizacion,
      };

      this.nodes.set(productoData.id, {
        id: productoData.id,
        type: 'producto',
        data: productoData
      });
    }

    logger.info(`Grafo construido con ${this.nodes.size} nodos y ${this.relationships.size} tipos de relaciones`);
  }

  // Método auxiliar para agregar relaciones
  private addRelationship(from: string, to: string, type: string): void {
    if (!this.relationships.has(from)) {
      this.relationships.set(from, []);
    }
    this.relationships.get(from)!.push({ from, to, type });
  }

  // Operaciones CRUD para Empresa
  async createEmpresa(empresa: Omit<Empresa, 'id' | 'createdAt' | 'updatedAt'>): Promise<Empresa> {
    const newEmpresa = new Empresa(empresa);
    const saved = await newEmpresa.save();

    const empresaData: Empresa = {
      id: saved._id.toString(),
      nombre: saved.nombre || null,
      sector: saved.sector || null,
      tamano: saved.tamano || null,
      ubicacion: saved.ubicacion || null,
      sitioWeb: saved.sitioWeb || null,
      descripcion: saved.descripcion || null,
      embedding: saved.embedding,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };

    // Agregar al grafo en memoria
    this.nodes.set(empresaData.id, {
      id: empresaData.id,
      type: 'empresa',
      data: empresaData
    });

    // Generar y almacenar embedding si hay descripción
    if (empresaData.descripcion) {
      await this.embeddingService.vectorizarEntidadCRM({
        id: empresaData.id,
        type: 'empresa',
        data: empresaData
      });
    }

    return empresaData;
  }

  async getEmpresa(id: string): Promise<Empresa | null> {
    let node = this.nodes.get(id);
    if (!node || node.type !== 'empresa') {
      // Cargar lazy si no está en memoria
      await this.loadEntitiesByType('empresa');
      node = this.nodes.get(id);
    }
    return node && node.type === 'empresa' ? node.data : null;
  }

  async getContacto(id: string): Promise<Contacto | null> {
    let node = this.nodes.get(id);
    if (!node || node.type !== 'contacto') {
      await this.loadEntitiesByType('contacto');
      node = this.nodes.get(id);
    }
    return node && node.type === 'contacto' ? node.data : null;
  }

  async getOportunidad(id: string): Promise<Oportunidad | null> {
    let node = this.nodes.get(id);
    if (!node || node.type !== 'oportunidad') {
      await this.loadEntitiesByType('oportunidad');
      node = this.nodes.get(id);
    }
    return node && node.type === 'oportunidad' ? node.data : null;
  }

  async getActividad(id: string): Promise<Actividad | null> {
    let node = this.nodes.get(id);
    if (!node || node.type !== 'actividad') {
      await this.loadEntitiesByType('actividad');
      node = this.nodes.get(id);
    }
    return node && node.type === 'actividad' ? node.data : null;
  }

  async getProducto(id: string): Promise<Producto | null> {
    let node = this.nodes.get(id);
    if (!node || node.type !== 'producto') {
      await this.loadEntitiesByType('producto');
      node = this.nodes.get(id);
    }
    return node && node.type === 'producto' ? node.data : null;
  }

  async getVendedor(id: string): Promise<Vendedor | null> {
    let node = this.nodes.get(id);
    if (!node || node.type !== 'vendedor') {
      await this.loadEntitiesByType('vendedor');
      node = this.nodes.get(id);
    }
    return node && node.type === 'vendedor' ? node.data : null;
  }

  async updateEmpresa(id: string, updates: Partial<Omit<Empresa, 'id' | 'createdAt'>>): Promise<Empresa | null> {
    const node = this.nodes.get(id);
    if (!node || node.type !== 'empresa') return null;

    // Actualizar en MongoDB
    const updated = await Empresa.findByIdAndUpdate(id, updates, { new: true });
    if (!updated) return null;

    // Actualizar en memoria
    const empresaData: Empresa = {
      id: updated._id.toString(),
      nombre: updated.nombre || '',
      sector: updated.sector || null,
      tamano: updated.tamano || null,
      ubicacion: updated.ubicacion || null,
      sitioWeb: updated.sitioWeb || null,
      descripcion: updated.descripcion || null,
      embedding: updated.embedding,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };

    node.data = empresaData;
    return empresaData;
  }

  async deleteEmpresa(id: string): Promise<boolean> {
    const deleted = await Empresa.findByIdAndDelete(id);
    if (deleted) {
      this.nodes.delete(id);
      // Remover relaciones
      this.relationships.delete(id);
      for (const rels of this.relationships.values()) {
        const filtered = rels.filter(rel => rel.to !== id);
        if (filtered.length === 0) {
          this.relationships.delete(rels[0].from);
        } else {
          this.relationships.set(rels[0].from, filtered);
        }
      }
    }
    return !!deleted;
  }

  // Método para almacenar embeddings vectoriales
  async storeEmbedding(entityType: string, entityId: string, embedding: number[]): Promise<void> {
    const node = this.nodes.get(entityId);
    if (node) {
      node.embedding = embedding;
      node.data.embedding = embedding;
    }

    // Almacenar en el servicio de embeddings
    await this.embeddingService.vectorizarEntidadCRM({
      id: entityId,
      type: entityType as CRMMEntity['type'],
      data: node?.data || {}
    });
  }

  // Método para buscar entidades similares usando embeddings
  async findSimilarEntities(query: string, limit: number = 10): Promise<Array<{
    entityId: string;
    entityType: string;
    text: string;
    score?: number;
  }>> {
    return await this.embeddingService.buscarEntidadesSimilares(query, limit);
  }

  // Método para inicializar el esquema del grafo (lazy loading)
  async initializeSchema(): Promise<void> {
    // No cargar todo el grafo al inicializar, solo preparar para carga lazy
    logger.info('Esquema del grafo de conocimiento inicializado con carga lazy');
  }

  // Método opcional para cargar el grafo completo (para casos donde se necesite)
  async loadFullGraph(): Promise<void> {
    if (this.isFullyLoaded) return;

    logger.info('Cargando grafo completo desde MongoDB...');
    await this.buildGraphFromMongoDB();
    this.isFullyLoaded = true;
    logger.info('Grafo completo cargado');
  }
}