import { Elysia } from 'elysia';
import logger from '../utils/logger';
import crmService from '../services/crmService';

const crmRoutes = new Elysia()
  crmRoutes.post('/vendedores', async ({ body }: { body: any }) => {
    try {
      const nuevoVendedor = await crmService.crearVendedor(body);
      return new Response(JSON.stringify(nuevoVendedor), { status: 201 });
    } catch (error) {
      logger.error(`Error creando vendedor: ${error}`);
      return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500 });
    }
  })
  crmRoutes.get('/contactos/buscar', async ({ query }: { query: any }) => {
    const { nombre } = query;
    const contacto = await crmService.buscarContactosPorNombre(nombre, ''); // Need vendedorId, but for now empty
    return contacto;
  })
  crmRoutes.get('/actividades/buscar', async ({ query }: { query: any }) => {
    const { nombre } = query;
    const actividades = await crmService.buscarActividadesPorDescripcion(nombre, '', null);
    return actividades;
  })
  crmRoutes.get('/oportunidades/buscar', async ({ query }: { query: any }) => {
    const { nombre } = query;
    const oportunidades = await crmService.buscar_oportunidad_por_nombre(nombre, '');
    return oportunidades;
  });

export default crmRoutes;
