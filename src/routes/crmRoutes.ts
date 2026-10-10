import { Elysia } from 'elysia';
import logger from '../utils/logger';
import crmService, { campoDuplicadoVendedor, ESTADOS_OPORTUNIDAD } from '../services/crmService';
import { AppError } from '../types/index';

// Respuesta JSON con su tipo de contenido (las Response construidas a mano no
// lo reciben automáticamente de Elysia).
const respuestaJson = (cuerpo: unknown, estado: number) =>
  new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

// Errores de negocio del servicio (AppError con estado 4xx) se devuelven tal
// cual; cualquier otro fallo, con un mensaje genérico.
const respuestaDeError = (error: unknown, mensajeGenerico: string) =>
  error instanceof AppError && error.statusCode < 500
    ? respuestaJson({ error: error.message }, error.statusCode)
    : respuestaJson({ error: mensajeGenerico }, 500);

const MENSAJE_FECHA_CIERRE = 'La fecha de cierre no puede ser futura ni anterior a la creación de la oportunidad.';

const crmRoutes = new Elysia({ prefix: '/crm' })
  crmRoutes.post('/vendedores', async ({ body }: { body: any }) => {
    try {
      const nuevoVendedor: any = await crmService.crearVendedor(body);
      // La contraseña nunca sale en la respuesta.
      const { contrasena, ...vendedorSinContrasena } = nuevoVendedor.toObject?.() ?? nuevoVendedor;
      return new Response(JSON.stringify(vendedorSinContrasena), { status: 201 });
    } catch (error) {
      const campoDuplicado = campoDuplicadoVendedor(error);
      if (campoDuplicado) {
        logger.warn(`Vendedor duplicado: ya existe el campo ${campoDuplicado}`);
        const mensaje = campoDuplicado === 'email'
          ? 'Ya existe un usuario con ese correo electrónico.'
          : 'Ya existe un usuario con ese teléfono.';
        return new Response(JSON.stringify({ error: mensaje, campo: campoDuplicado }), { status: 409 });
      }
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

  // Lista del tablero CRM del frontend (2.1): hasta 20 oportunidades del vendedor.
  crmRoutes.get('/oportunidades', async ({ query }: { query: any }) => {
    const vendedorId = typeof query?.vendedorId === 'string' ? query.vendedorId.trim() : '';
    if (!vendedorId) {
      return respuestaJson({ error: 'El parámetro vendedorId es requerido.' }, 400);
    }
    if (!/^[0-9a-f]{24}$/i.test(vendedorId)) {
      return respuestaJson({ error: 'El parámetro vendedorId no tiene un formato válido.' }, 400);
    }
    try {
      const oportunidades = await crmService.listarOportunidadesDeVendedor(vendedorId);
      return respuestaJson(oportunidades, 200);
    } catch (error) {
      logger.error(`Error listando oportunidades: ${error}`);
      return respuestaJson({ error: 'No se pudieron obtener las oportunidades.' }, 500);
    }
  });

  // Detalle de una oportunidad para el frontend (2.2), con sus actividades.
  crmRoutes.get('/oportunidades/:id', async ({ params }: { params: any }) => {
    const id = typeof params?.id === 'string' ? params.id : '';
    if (!/^[0-9a-f]{24}$/i.test(id)) {
      return respuestaJson({ error: 'El id de la oportunidad no tiene un formato válido.' }, 400);
    }
    try {
      const oportunidad = await crmService.obtenerOportunidadPorId(id);
      if (!oportunidad) {
        return respuestaJson({ error: 'Oportunidad no encontrada.' }, 404);
      }
      return respuestaJson(oportunidad, 200);
    } catch (error) {
      logger.error(`Error obteniendo la oportunidad: ${error}`);
      return respuestaJson({ error: 'No se pudo obtener la oportunidad.' }, 500);
    }
  });

  // Cambio de etapa desde el frontend (2.3). Solo se guarda `estado`. Las siete
  // etapas exactas se validan aquí; el rechazo de "Cerrado Ganado" y el borrado de
  // la venta al reabrir viven en actualizarOportunidad (2.10), que también usa el agente.
  crmRoutes.patch('/oportunidades/:id/estado', async ({ params, body }: { params: any; body: any }) => {
    const id = typeof params?.id === 'string' ? params.id : '';
    if (!/^[0-9a-f]{24}$/i.test(id)) {
      return respuestaJson({ error: 'El id de la oportunidad no tiene un formato válido.' }, 400);
    }
    const estado = body && typeof body === 'object' ? body.estado : undefined;
    if (typeof estado !== 'string' || !ESTADOS_OPORTUNIDAD.includes(estado)) {
      return respuestaJson({ error: `Estado no válido. Usa uno de: ${ESTADOS_OPORTUNIDAD.join(', ')}.` }, 400);
    }
    try {
      const actualizada = await crmService.actualizarOportunidad(id, { estado } as any);
      if (!actualizada) {
        return respuestaJson({ error: 'Oportunidad no encontrada.' }, 404);
      }
      const oportunidad = await crmService.obtenerOportunidadPorId(id);
      if (!oportunidad) {
        // Borrada entre la actualización y la relectura.
        return respuestaJson({ error: 'Oportunidad no encontrada.' }, 404);
      }
      return respuestaJson(oportunidad, 200);
    } catch (error) {
      logger.error(`Error actualizando el estado de la oportunidad: ${error}`);
      return respuestaDeError(error, 'No se pudo actualizar la oportunidad.');
    }
  });

  // Marcar como ganada desde el frontend (2.10): una sola venta con monto final,
  // fecha real de cierre (por defecto hoy) y comentario opcional.
  crmRoutes.post('/oportunidades/:id/ganada', async ({ params, body }: { params: any; body: any }) => {
    const id = typeof params?.id === 'string' ? params.id : '';
    if (!/^[0-9a-f]{24}$/i.test(id)) {
      return respuestaJson({ error: 'El id de la oportunidad no tiene un formato válido.' }, 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return respuestaJson({ error: 'El monto final debe ser un número mayor que cero.' }, 400);
    }
    let fechaCierreReal: Date | undefined;
    if (body.fechaCierreReal !== undefined && body.fechaCierreReal !== null) {
      fechaCierreReal = typeof body.fechaCierreReal === 'string' && body.fechaCierreReal.trim()
        ? new Date(body.fechaCierreReal)
        : new Date(Number.NaN);
      if (Number.isNaN(fechaCierreReal.getTime())) {
        return respuestaJson({ error: MENSAJE_FECHA_CIERRE }, 400);
      }
    }
    if (body.comentario !== undefined && body.comentario !== null && typeof body.comentario !== 'string') {
      return respuestaJson({ error: 'El comentario debe ser texto.' }, 400);
    }
    try {
      await crmService.marcarOportunidadComoGanada(id, {
        valor: body.valorCierre,
        fechaCierreReal,
        comentario: typeof body.comentario === 'string' ? body.comentario : undefined,
      });
      const oportunidad = await crmService.obtenerOportunidadPorId(id);
      if (!oportunidad) {
        return respuestaJson({ error: 'Oportunidad no encontrada.' }, 404);
      }
      return respuestaJson(oportunidad, 200);
    } catch (error) {
      logger.error(`Error marcando la oportunidad como ganada: ${error}`);
      return respuestaDeError(error, 'No se pudo marcar la oportunidad como ganada.');
    }
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
