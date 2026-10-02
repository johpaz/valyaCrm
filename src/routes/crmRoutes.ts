import { Elysia } from 'elysia';
import logger from '../utils/logger';
import crmService from '../services/crmService';

const crmRoutes = new Elysia({ prefix: '/crm' })
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

  crmRoutes.post('/vendedores/identificar', async ({ body }: { body: any }) => {
    try {
      const telefono = body?.telefono;
      if (typeof telefono !== 'string' || telefono.trim() === '') {
        return new Response(JSON.stringify({ error: 'El campo telefono es requerido' }), { status: 400 });
      }
      const vendedor = await crmService.buscarVendedorPorTelefono(telefono);
      if (!vendedor) {
        return new Response(JSON.stringify({ error: 'Vendedor no encontrado' }), { status: 404 });
      }
      return new Response(JSON.stringify({
        vendedorId: vendedor._id,
        nombre: vendedor.nombre,
        rol: vendedor.rol
      }), { status: 200 });
    } catch (error) {
      logger.error(`Error identificando vendedor por teléfono: ${error}`);
      return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500 });
    }
  });

export default crmRoutes;
