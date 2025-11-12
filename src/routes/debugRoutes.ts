import { Elysia } from 'elysia';
import { buscarEmpresasPorNombre } from '../services/debugService';

const debugRoutes = new Elysia()
  debugRoutes.get('/empresas', async ({ query }: { query: Record<string, string> }): Promise<any> => {
    // Adaptar para que buscarEmpresasPorNombre funcione con Elysia
    // Asumiendo que buscarEmpresasPorNombre toma req.query y retorna data
    return await buscarEmpresasPorNombre(query as any);
  });

export default debugRoutes;
