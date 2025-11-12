import { Elysia } from 'elysia';
import { getVendedorDashboard } from '../services/reportServices';

const reportDash = new Elysia()
  reportDash.get('/report', async ({ query }: { query: Record<string, string> }): Promise<any> => {
    return await getVendedorDashboard(query as any);
  });

export default reportDash;
