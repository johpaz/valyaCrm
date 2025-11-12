import logger from '../utils/logger.js';
import CRMService from '../services/crmService.js';
import Admin from '../models/adminModel.js';
import Vendedor from '../models/vendedorModel.js';
import {  UnauthorizedError, NotFoundError, AppError } from '../types/index.js';

interface RouteContext {
  query: Record<string, string>;
}

const crmService = new CRMService();

// Función para simular autenticación y autorización
const auth = async (context: RouteContext): Promise<{ _id: string; rol: string }> => {
  const { userId } = context.query;
  if (!userId) {
    throw new UnauthorizedError('No autorizado. Se requiere userId.');
  }

  try {
    let user = await Admin.findById(userId);
    if (user) {
      return { _id: user._id.toString(), rol: 'admin' };
    }

    user = await Vendedor.findById(userId);
    if (user) {
      return { _id: user._id.toString(), rol: user.rol || 'vendedor' };
    }

    throw new NotFoundError('Usuario');
  } catch (error) {
    logger.error(error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Error interno del servidor.', 500);
  }
};

// Función helper para manejar errores de auth
const handleAuthError = (error: unknown): Response => {
  if (error instanceof AppError) {
    return new Response(JSON.stringify({ error: error.message }), { status: error.statusCode });
  }
  if (error instanceof Error) {
    try {
      const err = JSON.parse(error.message);
      return new Response(JSON.stringify({ error: err.error }), { status: err.status });
    } catch {
      return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
    }
  }
  return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
};

export default (app: any) => {

  app.get('/sales-over-time', async (context: RouteContext): Promise<Response | any> => {
    try {
      const user = await auth(context);
      const { startDate, endDate } = context.query;
      const vendedorId = user.rol === 'admin' ? undefined : user._id;
      const data = await crmService.getSalesOverTime(startDate!, endDate!, vendedorId);
      return data;
    } catch (error: unknown) {
      return handleAuthError(error);
    }
  });

  app.get('/pipeline-by-stage', async (context: RouteContext): Promise<Response | any> => {
    try {
      const user = await auth(context);
      const vendedorId = user.rol === 'admin' ? undefined : user._id;
      const data = await crmService.getPipelineByStage(vendedorId);
      return data;
    } catch (error: unknown) {
      return handleAuthError(error);
    }
  });

  app.get('/sales-by-vendor', async (context: RouteContext): Promise<Response | any> => {
    try {
      const user = await auth(context);
      const { startDate, endDate } = context.query;
      // Este reporte es para admins, no necesita vendedorId
      if (user.rol !== 'admin') {
        return new Response(JSON.stringify({ error: 'Acceso denegado. Solo para administradores.' }), { status: 403 });
      }
      const data = await crmService.getSalesByVendor(startDate!, endDate!);
      return data;
    } catch (error: unknown) {
      return handleAuthError(error);
    }
  });

  app.get('/recent-activity', async (context: RouteContext): Promise<Response | any> => {
    try {
      const user = await auth(context);
      const { limit } = context.query;
      const vendedorId = user.rol === 'admin' ? undefined : user._id;
      const data = await crmService.getRecentActivity(vendedorId, limit);
      return data;
    } catch (error: unknown) {
      return handleAuthError(error);
    }
  });

  app.get('/entity-overview', async (context: RouteContext): Promise<Response | any> => {
    try {
      const user = await auth(context);
      if (user.rol !== 'admin') {
        return new Response(JSON.stringify({ error: 'Acceso denegado. Solo para administradores.' }), { status: 403 });
      }
      const data = await crmService.getEntityOverview();
      return data;
    } catch (error: unknown) {
      return handleAuthError(error);
    }
  });

  return app;
};