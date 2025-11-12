import { getVendedorDashboard } from '../services/reportServices';

interface RouteContext {
  query: Record<string, string>;
}

export default (app: any) => {
  app.get('/report', async (context: RouteContext): Promise<any> => {
    return await getVendedorDashboard(context.query as any);
  });

  return app;
};
