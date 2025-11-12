import { buscarEmpresasPorNombre } from '../services/debugService';

interface EmpresaQuery {
  nombre: string;
  vendedorId: string;
}

interface RouteContext {
  query: EmpresaQuery;
}

export default (app: any) => {
  app.get('/empresas', async (context: RouteContext): Promise<any> => {
    // Adaptar para que buscarEmpresasPorNombre funcione con Elysia
    // Asumiendo que buscarEmpresasPorNombre toma req.query y retorna data
    return await buscarEmpresasPorNombre(context.query);
  });

  return app;
};
