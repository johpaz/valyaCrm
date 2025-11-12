
import { Elysia } from 'elysia';
import cors from '@elysiajs/cors';
import { helmet } from 'elysia-helmet';
import logger from './utils/logger';
import connectDB from './config/database';
import webhookRoutes from './routes/webhookRoutes';
import mediaService from './services/mediaService';
import crmRoutes from './routes/crmRoutes';
import reportRoutes from './routes/reportRoutes';
import reportDash from './routes/reportDash';
import calendarRoutes from './routes/calendarRoutes';
import healthRoutes from './routes/healthRoutes';

// Conectar a la base de datos
connectDB();

const app = new Elysia();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());

// Ruta raíz
app.get('/', () => {
  return {
    name: 'whatsapp-gemini-agent-crm-b2b',
    version: '4.0.0',
    description: 'Agente Valya WhatsApp-Gemini especializado para Vendedores2B '
  };
});



const apiVersion = 'v1';
app.group(`/api/${apiVersion}`, (app) =>
  app
    .use(reportRoutes)
    .use(reportDash)
    .use(calendarRoutes)
    .use(healthRoutes)
    .use(crmRoutes)
    .use(webhookRoutes)
);

// Inicializar servidor
app.listen(PORT, () => {
  logger.info(`🚀 Servidor Valya CRM B2B iniciado en puerto ${PORT}`);

  // Configurar limpieza automática de archivos multimedia
  const cleanupHours = parseInt(process.env.MEDIA_CLEANUP_HOURS || '24');
  setInterval(async () => {
    try {
      await mediaService.cleanupOldFiles(cleanupHours);
      logger.info(`🧹 Limpieza automática de archivos completada (${cleanupHours}h)`);
    } catch (cleanupError) {
      logger.error(`Error en limpieza automática: ${cleanupError}`);
    }
  }, cleanupHours * 60 * 60 * 1000);
});
