
import { Elysia } from 'elysia';
import cors from '@elysiajs/cors';
import { helmet } from 'elysia-helmet';
import logger from './utils/logger.js';
import connectDB from './config/database.js';
import webhookRoutes from './routes/webhookRoutes.js';
import apiRoutes from './routes/apiRoutes.js';
import mediaService from './services/mediaService.js';
import crmRoutes from './routes/crmRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import reportDash from './routes/reportDash.js';
import debugRouter from './routes/debugRoutes.js';
import calendarRoutes from './routes/calendarRoutes.js';
import healthRoutes from './routes/healthRoutes.js';

// Conectar a la base de datos
connectDB();

const app = new Elysia();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());

// Rutas
webhookRoutes(app);
apiRoutes(app);
app.group('/api/reports', reportRoutes);
app.group('/api/dashboard', reportDash);
app.group('/api/debug', debugRouter);
app.group('/api/calendar', calendarRoutes);
app.group('/api', healthRoutes);
app.group('/api', crmRoutes);

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
