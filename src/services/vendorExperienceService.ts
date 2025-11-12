import logger from '../utils/logger.js';
import crmService from './crmService.js'; // Importamos el servicio de CRM
import { Vendedor } from '../types/index.js';

interface CommandDetails {
  description: string;
}

interface MessageAnalysis {
  isVendorCommand: boolean;
  isVendorAuthorized: boolean;
  messageType: string;
  command: any | null;
  infoPattern: string | null;
  confidence: number;
  suggestions: string[];
  isClientInteraction?: boolean;
}

class VendorExperienceService {
  crmService: any;
  vendorCommands: Map<string, CommandDetails>;
  clientInteractionPatterns: Map<RegExp, string>;

  constructor() {
    this.crmService = crmService;
    this.vendorCommands = new Map();
    this.clientInteractionPatterns = new Map();
    this.initializeVendorCommands();
    this.initializeClientPatterns();
    logger.info('Vendor Experience Service inicializado');
  }

  initializeVendorCommands(): void {
    this.vendorCommands.set('/pipeline', { description: 'Muestra el estado actual del pipeline de ventas.' });
    this.vendorCommands.set('/buscar', { description: 'Busca oportunidades por nombre de empresa.' });
    this.vendorCommands.set('/estado', { description: 'Cambia el estado de una oportunidad.' });
    this.vendorCommands.set('/help', { description: 'Muestra los comandos disponibles.' });
  }

  initializeClientPatterns(): void {
    this.clientInteractionPatterns.set(/interes(ado|ada)|quiero|comprar|precio/i, 'interes_compra');
    this.clientInteractionPatterns.set(/problema|error|no funciona/i, 'problema_soporte');
    this.clientInteractionPatterns.set(/gracias|excelente|bien/i, 'feedback_positivo');
  }

  async analyzeMessage(message: string, fromNumber: string): Promise<MessageAnalysis> {
    const analysis: MessageAnalysis = {
      isVendorCommand: false,
      isVendorAuthorized: false,
      messageType: 'unknown',
      command: null,
      infoPattern: null,
      confidence: 0,
      suggestions: []
    };

    const vendor = await this.isAuthorizedVendor(fromNumber);
    analysis.isVendorAuthorized = !!vendor;

    if (!analysis.isVendorAuthorized) {
      analysis.messageType = 'unauthorized';
      analysis.confidence = 1.0;
      analysis.suggestions = ['Usuario no autorizado como vendedor'];
      return analysis;
    }

    // Detección de comandos de vendedor
    const detectedCommand = this.detectVendorCommand(message);
    if (detectedCommand) {
      analysis.isVendorCommand = true;
      analysis.messageType = 'command';
      analysis.command = detectedCommand;
      analysis.confidence = 1.0;
      return analysis;
    }

    // Detección de interacciones de cliente
    for (const [pattern, type] of this.clientInteractionPatterns) {
      if (pattern.test(message)) {
        analysis.isClientInteraction = true;
        analysis.messageType = 'client_interaction';
        analysis.infoPattern = type;
        analysis.confidence = 0.8; // Confianza media para interacciones de cliente
        return analysis;
      }
    }

    return analysis;
  }

  detectVendorCommand(message: string): { name: string; details: CommandDetails; args: string } | null {
    for (const [command, details] of this.vendorCommands) {
      if (message.startsWith(command)) {
        return { name: command, details: details, args: message.substring(command.length).trim() };
      }
    }
    return null;
  }

  async isAuthorizedVendor(phoneNumber: string): Promise<Vendedor | null> {
    console.log(phoneNumber);

    try {
      const vendedor = await this.crmService.buscarVendedorPorTelefono(phoneNumber);
      return vendedor; // Retorna el objeto del vendedor si se encuentra, o null
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error al verificar vendedor autorizado: ${message}`);
      return null;
    }
  }

 
}

export default VendorExperienceService;