import { describe, it, expect, spyOn, afterEach } from 'bun:test';
import crmService from '../services/crmService';
import crmRoutes from './crmRoutes';
import { AppError } from '../types/index';

const VENDEDOR = '6ac956a7dfb71b89c6dccc09';

function pedir(ruta: string) {
  return crmRoutes.handle(new Request(`http://localhost${ruta}`));
}

describe('GET /crm/oportunidades', () => {
  afterEach(() => {
    (crmService.listarOportunidadesDeVendedor as any).mockRestore?.();
  });

  it('devuelve 200 con las oportunidades del vendedor', async () => {
    const lista = [{ _id: 'o1', nombre: 'Deal', empresa: { nombre: 'Bancolombia' } }];
    const listar = spyOn(crmService, 'listarOportunidadesDeVendedor').mockResolvedValue(lista as any);

    const respuesta = await pedir(`/crm/oportunidades?vendedorId=${VENDEDOR}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get('content-type')).toContain('application/json');
    expect(await respuesta.json()).toEqual(lista);
    expect(listar).toHaveBeenCalledWith(VENDEDOR);
  });

  it('devuelve 200 con una lista vacía si el vendedor no tiene oportunidades', async () => {
    spyOn(crmService, 'listarOportunidadesDeVendedor').mockResolvedValue([]);
    const respuesta = await pedir(`/crm/oportunidades?vendedorId=${VENDEDOR}`);
    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toEqual([]);
  });

  it('devuelve 400 sin consultar la base de datos si falta el vendedorId', async () => {
    const listar = spyOn(crmService, 'listarOportunidadesDeVendedor');
    const respuesta = await pedir('/crm/oportunidades');
    expect(respuesta.status).toBe(400);
    expect((await respuesta.json()).error).toBe('El parámetro vendedorId es requerido.');
    expect(listar).not.toHaveBeenCalled();
  });

  it('devuelve 400 si el vendedorId no tiene un formato válido', async () => {
    const listar = spyOn(crmService, 'listarOportunidadesDeVendedor');
    for (const valor of ['123', 'no-es-un-id', '   ']) {
      const respuesta = await pedir(`/crm/oportunidades?vendedorId=${encodeURIComponent(valor)}`);
      expect(respuesta.status).toBe(400);
    }
    expect(listar).not.toHaveBeenCalled();
  });

  it('devuelve 500 con un mensaje genérico si falla la base de datos', async () => {
    spyOn(crmService, 'listarOportunidadesDeVendedor').mockRejectedValue(new Error('MongoServerError: detalle interno'));
    const respuesta = await pedir(`/crm/oportunidades?vendedorId=${VENDEDOR}`);
    expect(respuesta.status).toBe(500);
    const cuerpo = await respuesta.json();
    expect(cuerpo.error).toBe('No se pudieron obtener las oportunidades.');
    expect(JSON.stringify(cuerpo)).not.toContain('detalle interno');
  });
});

const OPORTUNIDAD = '6ac97e3a5b2d4338d4498740';

describe('GET /crm/oportunidades/:id', () => {
  afterEach(() => {
    (crmService.obtenerOportunidadPorId as any).mockRestore?.();
    (crmService.buscar_oportunidad_por_nombre as any).mockRestore?.();
  });

  it('devuelve 200 con la oportunidad y sus actividades', async () => {
    const detalle = { _id: OPORTUNIDAD, nombre: 'Deal', actividades: [{ _id: 'a1' }] };
    const obtener = spyOn(crmService, 'obtenerOportunidadPorId').mockResolvedValue(detalle as any);

    const respuesta = await pedir(`/crm/oportunidades/${OPORTUNIDAD}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get('content-type')).toContain('application/json');
    expect(await respuesta.json()).toEqual(detalle);
    expect(obtener).toHaveBeenCalledWith(OPORTUNIDAD);
  });

  it('devuelve 404 si la oportunidad no existe', async () => {
    spyOn(crmService, 'obtenerOportunidadPorId').mockResolvedValue(null);
    const respuesta = await pedir(`/crm/oportunidades/${OPORTUNIDAD}`);
    expect(respuesta.status).toBe(404);
    expect((await respuesta.json()).error).toBe('Oportunidad no encontrada.');
  });

  it('devuelve 400 sin consultar la base de datos si el id no tiene formato válido', async () => {
    const obtener = spyOn(crmService, 'obtenerOportunidadPorId');
    for (const valor of ['123', 'no-es-un-id', '6ac97e3a5b2d4338d449874Z']) {
      const respuesta = await pedir(`/crm/oportunidades/${valor}`);
      expect(respuesta.status).toBe(400);
      expect((await respuesta.json()).error).toBe('El id de la oportunidad no tiene un formato válido.');
    }
    expect(obtener).not.toHaveBeenCalled();
  });

  it('devuelve 500 con un mensaje genérico si falla la base de datos', async () => {
    spyOn(crmService, 'obtenerOportunidadPorId').mockRejectedValue(new Error('CastError: detalle interno'));
    const respuesta = await pedir(`/crm/oportunidades/${OPORTUNIDAD}`);
    expect(respuesta.status).toBe(500);
    const cuerpo = await respuesta.json();
    expect(cuerpo.error).toBe('No se pudo obtener la oportunidad.');
    expect(JSON.stringify(cuerpo)).not.toContain('detalle interno');
  });

  it('no confunde /oportunidades/buscar con un id', async () => {
    const obtener = spyOn(crmService, 'obtenerOportunidadPorId');
    const buscar = spyOn(crmService, 'buscar_oportunidad_por_nombre').mockResolvedValue([] as any);
    await pedir('/crm/oportunidades/buscar?nombre=x');
    expect(buscar).toHaveBeenCalled();
    expect(obtener).not.toHaveBeenCalled();
  });
});

function enviarEstado(id: string, cuerpo: unknown) {
  return crmRoutes.handle(
    new Request(`http://localhost/crm/oportunidades/${id}/estado`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    }),
  );
}

describe('PATCH /crm/oportunidades/:id/estado', () => {
  afterEach(() => {
    (crmService.actualizarOportunidad as any).mockRestore?.();
    (crmService.obtenerOportunidadPorId as any).mockRestore?.();
  });

  it('guarda el nuevo estado y devuelve la oportunidad releída', async () => {
    const actualizar = spyOn(crmService, 'actualizarOportunidad').mockResolvedValue({ _id: OPORTUNIDAD } as any);
    const detalle = { _id: OPORTUNIDAD, estado: 'Propuesta', actividades: [] };
    spyOn(crmService, 'obtenerOportunidadPorId').mockResolvedValue(detalle as any);

    const respuesta = await enviarEstado(OPORTUNIDAD, { estado: 'Propuesta' });

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get('content-type')).toContain('application/json');
    expect(await respuesta.json()).toEqual(detalle);
    expect(actualizar).toHaveBeenCalledWith(OPORTUNIDAD, { estado: 'Propuesta' });
  });

  it('solo cambia el estado aunque el cuerpo traiga otros campos', async () => {
    const actualizar = spyOn(crmService, 'actualizarOportunidad').mockResolvedValue({ _id: OPORTUNIDAD } as any);
    spyOn(crmService, 'obtenerOportunidadPorId').mockResolvedValue({ _id: OPORTUNIDAD } as any);

    await enviarEstado(OPORTUNIDAD, { estado: 'Cerrado Ganado', nombre: 'Otro', valorEstimado: 1, vendedorId: 'x' });

    expect(actualizar).toHaveBeenCalledWith(OPORTUNIDAD, { estado: 'Cerrado Ganado' });
  });

  it('rechaza con 400 un estado que no es una de las siete etapas, sin guardar nada', async () => {
    const actualizar = spyOn(crmService, 'actualizarOportunidad');
    for (const cuerpo of [{ estado: 'Ganado' }, { estado: 'negociacion' }, { estado: 'Negociacion' }, { estado: 5 }, {}]) {
      const respuesta = await enviarEstado(OPORTUNIDAD, cuerpo);
      expect(respuesta.status).toBe(400);
      expect((await respuesta.json()).error).toBe(
        'Estado no válido. Usa uno de: Prospecto, Calificado, Propuesta, Negociación, Cerrado Ganado, Cerrado Perdido, Seguimiento.',
      );
    }
    expect(actualizar).not.toHaveBeenCalled();
  });

  it('rechaza con 400 un cuerpo que no es JSON', async () => {
    const actualizar = spyOn(crmService, 'actualizarOportunidad');
    const respuesta = await crmRoutes.handle(
      new Request(`http://localhost/crm/oportunidades/${OPORTUNIDAD}/estado`, { method: 'PATCH', body: 'Propuesta' }),
    );
    expect(respuesta.status).toBe(400);
    expect(actualizar).not.toHaveBeenCalled();
  });

  it('devuelve 404 si la oportunidad no existe', async () => {
    spyOn(crmService, 'actualizarOportunidad').mockResolvedValue(null);
    const respuesta = await enviarEstado(OPORTUNIDAD, { estado: 'Propuesta' });
    expect(respuesta.status).toBe(404);
    expect((await respuesta.json()).error).toBe('Oportunidad no encontrada.');
  });

  it('devuelve 404 si la oportunidad se borra antes de releerla', async () => {
    spyOn(crmService, 'actualizarOportunidad').mockResolvedValue({ _id: OPORTUNIDAD } as any);
    spyOn(crmService, 'obtenerOportunidadPorId').mockResolvedValue(null);
    const respuesta = await enviarEstado(OPORTUNIDAD, { estado: 'Propuesta' });
    expect(respuesta.status).toBe(404);
  });

  it('devuelve 400 si el id no tiene formato válido, sin guardar nada', async () => {
    const actualizar = spyOn(crmService, 'actualizarOportunidad');
    const respuesta = await enviarEstado('123', { estado: 'Propuesta' });
    expect(respuesta.status).toBe(400);
    expect((await respuesta.json()).error).toBe('El id de la oportunidad no tiene un formato válido.');
    expect(actualizar).not.toHaveBeenCalled();
  });

  it('devuelve 500 con un mensaje genérico si falla la base de datos', async () => {
    spyOn(crmService, 'actualizarOportunidad').mockRejectedValue(new Error('MongoServerError: detalle interno'));
    const respuesta = await enviarEstado(OPORTUNIDAD, { estado: 'Propuesta' });
    expect(respuesta.status).toBe(500);
    const cuerpo = await respuesta.json();
    expect(cuerpo.error).toBe('No se pudo actualizar la oportunidad.');
    expect(JSON.stringify(cuerpo)).not.toContain('detalle interno');
  });
});

function marcarGanada(id: string, cuerpo: unknown) {
  return crmRoutes.handle(
    new Request(`http://localhost/crm/oportunidades/${id}/ganada`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    }),
  );
}

describe('POST /crm/oportunidades/:id/ganada', () => {
  afterEach(() => {
    (crmService.marcarOportunidadComoGanada as any).mockRestore?.();
    (crmService.obtenerOportunidadPorId as any).mockRestore?.();
  });

  it('marca la oportunidad como ganada y devuelve el detalle', async () => {
    const marcar = spyOn(crmService, 'marcarOportunidadComoGanada').mockResolvedValue({ venta: {} } as any);
    const detalle = { _id: OPORTUNIDAD, estado: 'Cerrado Ganado', valorCierre: 900 };
    spyOn(crmService, 'obtenerOportunidadPorId').mockResolvedValue(detalle as any);

    const respuesta = await marcarGanada(OPORTUNIDAD, { valorCierre: 900, fechaCierreReal: '2026-10-08', comentario: 'Firmado' });

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get('content-type')).toContain('application/json');
    expect(await respuesta.json()).toEqual(detalle);
    expect(marcar).toHaveBeenCalledWith(OPORTUNIDAD, {
      valor: 900,
      fechaCierreReal: new Date('2026-10-08'),
      comentario: 'Firmado',
    });
  });

  it('sin fecha real deja que el servicio use hoy', async () => {
    const marcar = spyOn(crmService, 'marcarOportunidadComoGanada').mockResolvedValue({ venta: {} } as any);
    spyOn(crmService, 'obtenerOportunidadPorId').mockResolvedValue({ _id: OPORTUNIDAD } as any);
    await marcarGanada(OPORTUNIDAD, { valorCierre: 900 });
    expect(marcar).toHaveBeenCalledWith(OPORTUNIDAD, { valor: 900, fechaCierreReal: undefined, comentario: undefined });
  });

  it('pasa los errores del servicio con su estado y mensaje', async () => {
    for (const [estado, mensaje] of [
      [400, 'El monto final debe ser un número mayor que cero.'],
      [404, 'Oportunidad no encontrada.'],
      [409, 'Esta oportunidad ya está marcada como ganada.'],
    ] as const) {
      spyOn(crmService, 'marcarOportunidadComoGanada').mockRejectedValue(new AppError(mensaje, estado));
      const respuesta = await marcarGanada(OPORTUNIDAD, { valorCierre: 900 });
      expect(respuesta.status).toBe(estado);
      expect((await respuesta.json()).error).toBe(mensaje);
      (crmService.marcarOportunidadComoGanada as any).mockRestore();
    }
  });

  it('rechaza con 400 una fecha que no es texto o no se entiende, sin llamar al servicio', async () => {
    const marcar = spyOn(crmService, 'marcarOportunidadComoGanada');
    for (const fechaCierreReal of [20261008, 'mañana', '']) {
      const respuesta = await marcarGanada(OPORTUNIDAD, { valorCierre: 900, fechaCierreReal });
      expect(respuesta.status).toBe(400);
      expect((await respuesta.json()).error).toBe(
        'La fecha de cierre no puede ser futura ni anterior a la creación de la oportunidad.',
      );
    }
    expect(marcar).not.toHaveBeenCalled();
  });

  it('rechaza con 400 un id mal formado o un cuerpo que no es JSON, sin llamar al servicio', async () => {
    const marcar = spyOn(crmService, 'marcarOportunidadComoGanada');
    expect((await marcarGanada('123', { valorCierre: 900 })).status).toBe(400);
    const sinJson = await crmRoutes.handle(
      new Request(`http://localhost/crm/oportunidades/${OPORTUNIDAD}/ganada`, { method: 'POST', body: '900' }),
    );
    expect(sinJson.status).toBe(400);
    expect(marcar).not.toHaveBeenCalled();
  });

  it('devuelve 500 con un mensaje genérico ante un fallo inesperado', async () => {
    spyOn(crmService, 'marcarOportunidadComoGanada').mockRejectedValue(new Error('MongoServerError: detalle interno'));
    const respuesta = await marcarGanada(OPORTUNIDAD, { valorCierre: 900 });
    expect(respuesta.status).toBe(500);
    const cuerpo = await respuesta.json();
    expect(cuerpo.error).toBe('No se pudo marcar la oportunidad como ganada.');
    expect(JSON.stringify(cuerpo)).not.toContain('detalle interno');
  });
});

describe('PATCH /crm/oportunidades/:id/estado y el estado ganado', () => {
  afterEach(() => {
    (crmService.actualizarOportunidad as any).mockRestore?.();
  });

  it('devuelve el 400 del servicio cuando se intenta poner "Cerrado Ganado"', async () => {
    const mensaje = 'Para marcar la oportunidad como ganada, registra la venta con su monto final.';
    spyOn(crmService, 'actualizarOportunidad').mockRejectedValue(new AppError(mensaje, 400));
    const respuesta = await enviarEstado(OPORTUNIDAD, { estado: 'Cerrado Ganado' });
    expect(respuesta.status).toBe(400);
    expect((await respuesta.json()).error).toBe(mensaje);
  });
});
