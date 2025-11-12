import { Elysia } from 'elysia';
import logger from '../utils/logger';
import crmService from '../services/crmService';
import Admin from '../models/adminModel';
import Vendedor from '../models/vendedorModel';
import {  UnauthorizedError, NotFoundError, AppError } from '../types/index';

// Función para simular autenticación y autorización
const auth = async (query: Record<string, string>): Promise<{ _id: string; rol: string }> => {
  const { userId } = query;
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

const reportRoutes = new Elysia()
  reportRoutes.get('/sales-over-time', async ({ query }: { query: Record<string, string> }): Promise<Response | any> => {
    try {
      const user = await auth(query);
      const { startDate, endDate } = query;
      const vendedorId = user.rol === 'admin' ? undefined : user._id;
      const data = await crmService.getSalesOverTime(startDate!, endDate!, vendedorId);
      return data;
    } catch (error: unknown) {
      return handleAuthError(error);
    }
  })
  reportRoutes.get('/pipeline-by-stage', async ({ query }: { query: Record<string, string> }): Promise<Response | any> => {
    try {
      const user = await auth(query);
      const vendedorId = user.rol === 'admin' ? undefined : user._id;
      const data = await crmService.getPipelineByStage(vendedorId);
      return data;
    } catch (error: unknown) {
      return handleAuthError(error);
    }
  })
  reportRoutes.get('/sales-by-vendor', async ({ query }: { query: Record<string, string> }): Promise<Response | any> => {
    try {
      const user = await auth(query);
      const { startDate, endDate } = query;
      // Este reporte es para admins, no necesita vendedorId
      if (user.rol !== 'admin') {
        return new Response(JSON.stringify({ error: 'Acceso denegado. Solo para administradores.' }), { status: 403 });
      }
      const data = await crmService.getSalesByVendor(startDate!, endDate!);
      return data;
    } catch (error: unknown) {
      return handleAuthError(error);
    }
  })
  reportRoutes.get('/recent-activity', async ({ query }: { query: Record<string, string> }): Promise<Response | any> => {
    try {
      const user = await auth(query);
      const { limit } = query;
      const vendedorId = user.rol === 'admin' ? undefined : user._id;
      const data = await crmService.getRecentActivity(vendedorId, limit);
      return data;
    } catch (error: unknown) {
      return handleAuthError(error);
    }
  })
  reportRoutes.get('/entity-overview', async ({ query }: { query: Record<string, string> }): Promise<Response | any> => {
    try {
      const user = await auth(query);
      if (user.rol !== 'admin') {
        return new Response(JSON.stringify({ error: 'Acceso denegado. Solo para administradores.' }), { status: 403 });
      }
      const data = await crmService.getEntityOverview();
      return data;
    } catch (error: unknown) {
      return handleAuthError(error);
    }
  });

export default reportRoutes;