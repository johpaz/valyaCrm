import logger from '../utils/logger';
import VendorExperienceService from '../services/vendorExperienceService';
import crmService from '../services/crmService'; // Necesario para las estadísticas
import { executeTool } from '../services/toolsManager';
import crmRoutes from './crmRoutes';
import pkg from '../../package.json';

interface RouteParams {
  phoneNumber: string;
}

interface CommandBody {
  phoneNumber: string;
  command: string;
  params: Record<string, any>;
}

export default (app: any) => {
  // Ruta raíz para información de la aplicación
  app.get('/', () => {
    return {
      name: "valya_agent_crm",
      version:"1.0.0",
      description: "Agente langgraph Valya para Vendedores B2B",
      author:"Tu Profe de IA"
    };
  });

  // Ruta para estadísticas del vendedor
  app.get('/vendor/stats/:phoneNumber', async ({ params }: { params: RouteParams }) => {
    try {
      const { phoneNumber } = params;
      console.log(phoneNumber);

      const vendorExperience = new VendorExperienceService();
      const vendor = await vendorExperience.isAuthorizedVendor(phoneNumber);
      console.log(vendor);

      if (!vendor) {
        return new Response(JSON.stringify({ error: 'No autorizado como vendedor' }), { status: 403 });
      }

      // Asumimos que el crmService tiene un método para obtener estadísticas
      const stats = await crmService.obtenerOportunidadesPorVendedor(vendor._id);
      return { vendor: phoneNumber, timestamp: new Date().toISOString(), stats };
    } catch (error) {
      logger.error(`Error obteniendo estadísticas del vendedor: ${error instanceof Error ? error.message : String(error)}`);
      return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Error interno del servidor' }), { status: 500 });
    }
  });

  // Ruta para comandos del vendedor via API
  app.post('/vendor/command', async ({ body }: { body: CommandBody }) => {
    try {
      const { phoneNumber, command, params } = body;
      const vendorExperience = new VendorExperienceService();
      const vendor = await vendorExperience.isAuthorizedVendor(phoneNumber);
      if (!vendor) {
        return new Response(JSON.stringify({ error: 'No autorizado como vendedor' }), { status: 403 });
      }

      const commandConfig = vendorExperience.vendorCommands.get(command);
      if (!commandConfig) {
        return new Response(JSON.stringify({ error: 'Comando no encontrado' }), { status: 400 });
      }

      // Añadir el ID del vendedor a los parámetros para el contexto de la herramienta
      const toolParams = { ...params, vendedorId: vendor._id };

      const result = await executeTool(command, toolParams);
      return { command, result, timestamp: new Date().toISOString() };
    } catch (error) {
      logger.error(`Error ejecutando comando del vendedor: ${error instanceof Error ? error.message : String(error)}`);
      return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Error interno del servidor' }), { status: 500 });
    }
  });

  // Rutas CRM
  app.group('/crm', crmRoutes);
};