// Core types for the WhatsApp CRM AI Agent project

// ========== BASE TYPES ==========

export interface BaseEntity {
  _id?: string | any; // Allow ObjectId from MongoDB
  createdAt?: Date;
  updatedAt?: Date;
}

export interface User {
  id: string;
  phoneNumber: string;
  name?: string;
  email?: string;
}

export interface Message {
  id: string;
  from: string;
  to: string;
  content: string;
  type: 'text' | 'image' | 'audio' | 'video' | 'document';
  timestamp: Date;
  metadata?: Record<string, any>;
}

// ========== CRM TYPES ==========

export interface Vendedor extends BaseEntity {
  nombre: string;
  email: string;
  telefono: string;
  cargo?: string | null;
  activo: boolean;
  rol?: 'vendedor' | 'admin';
  contrasena?: string;
  fechaCreacion?: Date;
  fechaActualizacion?: Date;
}

export interface Empresa extends BaseEntity {
  nombre?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  notas?: string | null;
  fechaActualizacion?: Date;
  vendedorId?: string | any;
}

export interface Contacto extends BaseEntity {
  nombre?: string | null;
  email?: string | null;
  telefono?: string | null;
  cargo?: string | null;
  empresaId: string | any;
  vendedor: string | any;
  fechaCreacion: Date;
  fechaActualizacion?: Date;
  empresa?: Empresa;
}

export interface Oportunidad extends BaseEntity {
  empresaId?: string | any; // ObjectId
  productoId?: string | any; // ObjectId
  vendedorId: string | any; // ObjectId, required
  contactoId?: string | any; // ObjectId
  estado: 'Prospecto' | 'Calificado' | 'Propuesta' | 'Negociación' | 'Cerrado Ganado' | 'Cerrado Perdido' | 'Seguimiento';
  nombre: string;
  valorEstimado?: number;
  fechaCreacion?: Date | null;
  fechaActualizacion?: Date | null;
  fechaCierre?: Date | null;
  valorCierre?: number | null;
  comision?: number | null;
  proximosPasos?: string | null;
  actividades?: string[] | any[]; // ObjectId[]
  notas?: string[];
}

export interface Actividad extends BaseEntity {
  tipo: 'Reunión' | 'Llamada' | 'Seguimiento' | 'Envío de Documentos' | 'Prueba' | 'Otro';
  descripcion: string;
  fecha: string;
  hora?: string;
  estado: 'Pendiente' | 'En progreso' | 'Completada' | 'Cancelada';
  oportunidadId?: string;
  empresaId?: string;
  contactoId?: string;
  vendedorId: string;
  fechaProgramada?: Date;
  fechaCompletada?: Date;
  notas?: string;
  recordatorio?: boolean;
  fechaRecordatorio?: Date;
}

export interface Producto extends BaseEntity {
  nombre: string;
  tipo?: string | null;
  proveedor?: string[] | string | null;
  marca?: string[] | string | null;
  clasificacion?: string | null;
  precio?: number | null;
  descripcion?: string | null;
  vendedorId: string | any;
  fechaActualizacion?: Date;
}

export interface VentaGanada extends BaseEntity {
  oportunidadId: string | any; // ObjectId
  valor: number;
  fecha?: Date | null;
  mes?: number;
  año?: number;
  vendedorId: string | any; // ObjectId
}

// ========== API RESPONSE TYPES ==========

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface HealthCheckResponse {
  database: ServiceStatus;
  google: ServiceStatus;
  gemini: ServiceStatus;
  openai: ServiceStatus;
  resend: ServiceStatus;
}

export interface ServiceStatus {
  status: 'OK' | 'DOWN' | 'NOT_IN_USE';
  message: string;
}

// ========== AI/LANGCHAIN TYPES ==========

export interface ConversationMessage {
  role: 'user' | 'model' | 'system';
  parts: Array<{
    text: string;
  }>;
}

export interface ConversationHistory extends Array<ConversationMessage> {}

export interface IntentAnalysis {
  intent: string;
  entities: Record<string, any>;
  confidence: number;
}

export interface PlanStep {
  tool: string;
  args: Record<string, any>;
}

export interface ExecutionPlan {
  requiresApproval: boolean;
  plan?: PlanStep[];
  message?: string;
  approvalMessage?: string;
  planId?: string;
}

export interface ToolExecutionResult {
  tool: string;
  result?: any;
  error?: string;
}

// ========== ERROR TYPES ==========

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.name = this.constructor.name;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} no encontrado`, 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'No autorizado') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Acceso denegado') {
    super(message, 403);
  }
}

// ========== UTILITY TYPES ==========

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// ========== SERVICE TYPES ==========

export interface EmailOptions {
  to: string;
  subject: string;
  htmlBody: string;
}

export interface WhatsAppMessageOptions {
  to: string;
  message: string;
}

export interface TranscriptionResult {
  text: string;
  confidence?: number;
  language?: string;
}

// ========== CONFIGURATION TYPES ==========

export interface DatabaseConfig {
  uri: string;
  options?: {
    useNewUrlParser?: boolean;
    useUnifiedTopology?: boolean;
    maxPoolSize?: number;
  };
}

export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  verifyToken: string;
  baseUrl: string;
}

export interface AIConfig {
  geminiApiKey: string;
  openaiApiKey?: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface EmailConfig {
  resendApiKey: string;
  fromEmail: string;
  fromName: string;
}

// ========== REQUEST/RESPONSE TYPES FOR ROUTES ==========

export interface AuthenticatedRequest {
  user?: Vendedor;
  params: Record<string, string>;
  query: Record<string, string>;
  body: any;
}

export interface ApiRouteHandler {
  (request: AuthenticatedRequest): Promise<Response> | Response;
}

// ========== DASHBOARD TYPES ==========

export interface DashboardData {
  vendedor: Vendedor;
  actividades: Actividad[];
  oportunidadesPorEstado: Array<{ _id: string; count: number }>;
  empresas: Empresa[];
  ventasPorMes: Array<{
    _id: { mes: number; año: number };
    totalMes: number;
    count: number;
  }>;
  conversaciones: ConversationMessage[];
  productosTop: Producto[];
  contactos: Contacto[];
}

// ========== CALENDAR TYPES ==========

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
  }>;
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{
      method: 'email' | 'popup';
      minutes: number;
    }>;
  };
}