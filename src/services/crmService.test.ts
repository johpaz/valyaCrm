import { describe, it, expect, spyOn, afterEach } from 'bun:test';
import Vendedor from '../models/vendedorModel';
import mongoose from 'mongoose';
import Oportunidad from '../models/oportunidadModel';
import VentaGanada from '../models/ventaGanadaModel';
import { AppError } from '../types/index';
import crmService, { campoDuplicadoVendedor, darFormaOportunidad, ESTADOS_OPORTUNIDAD } from './crmService';

describe('crearVendedor', () => {
  afterEach(() => {
    (Vendedor.prototype.save as any).mockRestore?.();
  });

  it('genera una contraseña temporal cuando no se envía ninguna', async () => {
    spyOn(Vendedor.prototype, 'save').mockResolvedValue(undefined as any);

    const vendedor = await crmService.crearVendedor({
      nombre: 'Prueba',
      email: 'prueba@ejemplo.com',
      telefono: '+573001234567',
      rol: 'vendedor',
    });

    expect(typeof vendedor.contrasena).toBe('string');
    expect(vendedor.contrasena!.length).toBeGreaterThanOrEqual(20);
  });

  it('genera contraseñas distintas para cada vendedor', async () => {
    spyOn(Vendedor.prototype, 'save').mockResolvedValue(undefined as any);
    const datos = { nombre: 'Prueba', email: 'p@e.com', telefono: '+573001234567' };

    const primero = await crmService.crearVendedor({ ...datos });
    const segundo = await crmService.crearVendedor({ ...datos });

    expect(primero.contrasena).not.toBe(segundo.contrasena);
  });

  it('conserva la contraseña cuando se envía una', async () => {
    spyOn(Vendedor.prototype, 'save').mockResolvedValue(undefined as any);

    const vendedor = await crmService.crearVendedor({
      nombre: 'Prueba',
      email: 'prueba@ejemplo.com',
      telefono: '+573001234567',
      contrasena: 'definida-por-quien-llama',
    });

    expect(vendedor.contrasena).toBe('definida-por-quien-llama');
  });

  it('guarda el rol elegido', async () => {
    spyOn(Vendedor.prototype, 'save').mockResolvedValue(undefined as any);

    const vendedor = await crmService.crearVendedor({
      nombre: 'Prueba',
      email: 'prueba@ejemplo.com',
      telefono: '+573001234567',
      rol: 'admin',
    });

    expect(vendedor.rol).toBe('admin');
  });
});

describe('campoDuplicadoVendedor', () => {
  it('identifica un teléfono duplicado', () => {
    const error = Object.assign(new Error('E11000 duplicate key'), {
      code: 11000,
      keyPattern: { telefono: 1 },
    });
    expect(campoDuplicadoVendedor(error)).toBe('telefono');
  });

  it('identifica un correo duplicado', () => {
    const error = Object.assign(new Error('E11000 duplicate key'), {
      code: 11000,
      keyPattern: { email: 1 },
    });
    expect(campoDuplicadoVendedor(error)).toBe('email');
  });

  it('usa keyValue cuando no hay keyPattern', () => {
    const error = Object.assign(new Error('E11000 duplicate key'), {
      code: 11000,
      keyValue: { email: 'p@e.com' },
    });
    expect(campoDuplicadoVendedor(error)).toBe('email');
  });

  it('devuelve null para errores que no son de duplicado', () => {
    expect(campoDuplicadoVendedor(new Error('otro error'))).toBeNull();
    expect(campoDuplicadoVendedor(null)).toBeNull();
  });
});

// Consulta falsa de Mongoose que registra cómo se encadena.
function consultaFalsa(resultado: unknown) {
  const llamadas: Record<string, unknown[][]> = { sort: [], limit: [], populate: [] };
  const consulta: any = {
    sort: (...a: unknown[]) => (llamadas.sort.push(a), consulta),
    limit: (...a: unknown[]) => (llamadas.limit.push(a), consulta),
    populate: (...a: unknown[]) => (llamadas.populate.push(a), consulta),
    lean: () => Promise.resolve(resultado),
  };
  return { consulta, llamadas };
}

const VENDEDOR = '6ac956a7dfb71b89c6dccc09';

describe('listarOportunidadesDeVendedor', () => {
  afterEach(() => {
    (Oportunidad.find as any).mockRestore?.();
  });

  it('busca las del vendedor, las más recientes primero, hasta 20, con empresa, contacto y producto', async () => {
    const { consulta, llamadas } = consultaFalsa([]);
    const find = spyOn(Oportunidad, 'find').mockReturnValue(consulta);

    await crmService.listarOportunidadesDeVendedor(VENDEDOR);

    expect(String((find.mock.calls[0][0] as any).vendedorId)).toBe(VENDEDOR);
    expect(llamadas.sort).toEqual([[{ fechaActualizacion: -1 }]]);
    expect(llamadas.limit).toEqual([[20]]);
    expect(llamadas.populate).toEqual([
      ['empresaId', 'nombre sector ubicacion'],
      ['contactoId', 'nombre cargo telefono email'],
      ['productoId', 'nombre'],
    ]);
  });

  it('devuelve una lista vacía si el vendedor no tiene oportunidades', async () => {
    spyOn(Oportunidad, 'find').mockReturnValue(consultaFalsa([]).consulta);
    expect(await crmService.listarOportunidadesDeVendedor(VENDEDOR)).toEqual([]);
  });

  it('da forma a cada oportunidad', async () => {
    spyOn(Oportunidad, 'find').mockReturnValue(
      consultaFalsa([{ _id: 'o1', nombre: 'Deal', estado: 'Propuesta', actividades: ['a1', 'a2'] }]).consulta,
    );
    const [oportunidad] = await crmService.listarOportunidadesDeVendedor(VENDEDOR);
    expect(oportunidad.cantidadActividades).toBe(2);
  });

  it('propaga el error de la base de datos', async () => {
    const { consulta } = consultaFalsa(null);
    consulta.lean = () => Promise.reject(new Error('sin conexión'));
    spyOn(Oportunidad, 'find').mockReturnValue(consulta);
    await expect(crmService.listarOportunidadesDeVendedor(VENDEDOR)).rejects.toThrow('sin conexión');
  });
});

describe('darFormaOportunidad', () => {
  it('expone empresa, contacto y producto con nombres en español y cuenta las actividades', () => {
    const resultado = darFormaOportunidad({
      _id: 'o1',
      vendedorId: 'v1',
      nombre: 'Implementación CRM',
      estado: 'Negociación',
      valorEstimado: 1000,
      comision: 50,
      fechaCierre: '2026-11-01',
      fechaCreacion: '2026-09-01',
      fechaActualizacion: '2026-10-01',
      notas: ['Llamar el lunes'],
      proximosPasos: 'Enviar contrato',
      actividades: ['a1', 'a2', 'a3'],
      empresaId: { _id: 'e1', nombre: 'Bancolombia', sector: 'Banca', ubicacion: 'Medellín' },
      contactoId: { _id: 'c1', nombre: 'María', cargo: 'CTO', telefono: '+573001112233', email: 'm@b.co' },
      productoId: { _id: 'p1', nombre: 'Software CRM' },
      __v: 0,
    });

    expect(resultado).toEqual({
      _id: 'o1',
      nombre: 'Implementación CRM',
      estado: 'Negociación',
      valorEstimado: 1000,
      comision: 50,
      fechaCierre: '2026-11-01',
      fechaCreacion: '2026-09-01',
      fechaActualizacion: '2026-10-01',
      notas: ['Llamar el lunes'],
      proximosPasos: 'Enviar contrato',
      cantidadActividades: 3,
      valorCierre: null,
      fechaCierreReal: null,
      empresa: { _id: 'e1', nombre: 'Bancolombia', sector: 'Banca', ubicacion: 'Medellín' },
      contacto: { _id: 'c1', nombre: 'María', cargo: 'CTO', telefono: '+573001112233', email: 'm@b.co' },
      producto: { _id: 'p1', nombre: 'Software CRM' },
    });
  });

  it('usa null para relaciones ausentes o borradas y 0 actividades si no hay', () => {
    const resultado = darFormaOportunidad({ _id: 'o2', nombre: 'Sin datos', empresaId: null });
    expect(resultado.empresa).toBeNull();
    expect(resultado.contacto).toBeNull();
    expect(resultado.producto).toBeNull();
    expect(resultado.cantidadActividades).toBe(0);
    expect(resultado.notas).toEqual([]);
  });

  it('no expone un id sin poblar como si fuera la relación', () => {
    const resultado = darFormaOportunidad({ _id: 'o3', nombre: 'Id suelto', contactoId: '64b000000000000000000001' });
    expect(resultado.contacto).toBeNull();
  });
});

const OPORTUNIDAD = '6ac97e3a5b2d4338d4498740';

describe('obtenerOportunidadPorId', () => {
  afterEach(() => {
    (Oportunidad.findById as any).mockRestore?.();
  });

  it('busca por id y trae empresa, contacto, producto y actividades con sus campos', async () => {
    const { consulta, llamadas } = consultaFalsa({ _id: OPORTUNIDAD, nombre: 'Deal', actividades: [] });
    const findById = spyOn(Oportunidad, 'findById').mockReturnValue(consulta);

    await crmService.obtenerOportunidadPorId(OPORTUNIDAD);

    expect(String(findById.mock.calls[0][0])).toBe(OPORTUNIDAD);
    expect(llamadas.populate).toEqual([
      ['empresaId', 'nombre sector ubicacion'],
      ['contactoId', 'nombre cargo telefono email'],
      ['productoId', 'nombre'],
      [
        {
          path: 'actividades',
          select: 'nombre tipo descripcion estado prioridad fechaProgramada fechaLimite',
          options: { sort: { fechaProgramada: 1 } },
        },
      ],
    ]);
  });

  it('devuelve null si la oportunidad no existe', async () => {
    spyOn(Oportunidad, 'findById').mockReturnValue(consultaFalsa(null).consulta);
    expect(await crmService.obtenerOportunidadPorId(OPORTUNIDAD)).toBeNull();
  });

  it('da forma a la oportunidad e incluye solo las actividades pobladas', async () => {
    const actividad = {
      _id: 'a1',
      nombre: 'Llamada',
      tipo: 'Llamada de seguimiento',
      descripcion: 'Definir cronograma',
      estado: 'Pendiente',
      prioridad: 'Alta',
      fechaProgramada: '2026-10-20',
      fechaLimite: null,
    };
    spyOn(Oportunidad, 'findById').mockReturnValue(
      consultaFalsa({
        _id: OPORTUNIDAD,
        nombre: 'Deal',
        estado: 'Negociación',
        empresaId: { _id: 'e1', nombre: 'Bancolombia', sector: 'Banca', ubicacion: 'Medellín' },
        actividades: [actividad, '64b000000000000000000002', null],
      }).consulta,
    );

    const oportunidad = await crmService.obtenerOportunidadPorId(OPORTUNIDAD);

    expect(oportunidad?.empresa).toEqual({ _id: 'e1', nombre: 'Bancolombia', sector: 'Banca', ubicacion: 'Medellín' });
    expect(oportunidad?.contacto).toBeNull();
    expect(oportunidad?.actividades).toEqual([actividad]);
  });

  it('propaga el error de la base de datos', async () => {
    const { consulta } = consultaFalsa(null);
    consulta.lean = () => Promise.reject(new Error('sin conexión'));
    spyOn(Oportunidad, 'findById').mockReturnValue(consulta);
    await expect(crmService.obtenerOportunidadPorId(OPORTUNIDAD)).rejects.toThrow('sin conexión');
  });
});

describe('ESTADOS_OPORTUNIDAD', () => {
  it('son exactamente las siete etapas del modelo', () => {
    expect(ESTADOS_OPORTUNIDAD).toEqual([
      'Prospecto',
      'Calificado',
      'Propuesta',
      'Negociación',
      'Cerrado Ganado',
      'Cerrado Perdido',
      'Seguimiento',
    ]);
  });
});

// --- 2.10: una sola forma de marcar una oportunidad como ganada ---

const OP_ID = '6ac97e3a5b2d4338d4498742';
const VENDEDOR_ID = new mongoose.Types.ObjectId('6ac956a7dfb71b89c6dccc09');
const CREADA = new Date('2026-10-01T10:00:00Z');

function oportunidadEn(estado: string, extra: Record<string, unknown> = {}) {
  return { _id: OP_ID, nombre: 'Deal', estado, vendedorId: VENDEDOR_ID, fechaCreacion: CREADA, fechaCierre: new Date('2026-12-15'), ...extra };
}

const conLean = (valor: unknown) => ({ lean: () => Promise.resolve(valor) });

function espias({ oportunidad, ventaExistente = null }: { oportunidad: unknown; ventaExistente?: unknown }) {
  return {
    findById: spyOn(Oportunidad, 'findById').mockReturnValue(conLean(oportunidad) as any),
    actualizarOp: spyOn(Oportunidad, 'findByIdAndUpdate').mockResolvedValue({ _id: OP_ID } as any),
    findOneVenta: spyOn(VentaGanada, 'findOne').mockReturnValue(conLean(ventaExistente) as any),
    crearVenta: spyOn(VentaGanada, 'create').mockImplementation(async (datos: any) => ({ _id: 'v1', ...datos }) as any),
    actualizarVenta: spyOn(VentaGanada, 'findOneAndUpdate').mockImplementation(async (_f: any, act: any) => ({ _id: 'v0', ...act.$set }) as any),
    borrarVenta: spyOn(VentaGanada, 'deleteOne').mockResolvedValue({ deletedCount: 1 } as any),
  };
}

function restaurar() {
  for (const objeto of [Oportunidad, VentaGanada] as any[]) {
    for (const metodo of ['findById', 'findByIdAndUpdate', 'findOne', 'create', 'findOneAndUpdate', 'deleteOne']) {
      objeto[metodo]?.mockRestore?.();
    }
  }
}

async function errorDe(promesa: Promise<unknown>): Promise<AppError> {
  try {
    await promesa;
  } catch (error) {
    return error as AppError;
  }
  throw new Error('Se esperaba un error');
}

describe('marcarOportunidadComoGanada', () => {
  afterEach(restaurar);

  it('registra una venta con monto, fecha real, comentario y el vendedor de la oportunidad, y la marca ganada', async () => {
    const e = espias({ oportunidad: oportunidadEn('Negociación') });

    await crmService.marcarOportunidadComoGanada(OP_ID, {
      valor: 125000000,
      fechaCierreReal: new Date('2026-10-08T00:00:00Z'),
      comentario: 'Firmado',
    });

    const venta = e.crearVenta.mock.calls[0][0] as any;
    expect(String(venta.oportunidadId)).toBe(OP_ID);
    expect(String(venta.vendedorId)).toBe(String(VENDEDOR_ID));
    expect(venta.valor).toBe(125000000);
    expect(venta.fecha).toEqual(new Date('2026-10-08T00:00:00Z'));
    expect(venta.mes).toBe(10);
    expect(venta.año).toBe(2026);
    expect(venta.comentario).toBe('Firmado');
    const [idActualizado, cambios] = e.actualizarOp.mock.calls[0] as any;
    expect(String(idActualizado)).toBe(OP_ID);
    expect(cambios.$set).toEqual({
      estado: 'Cerrado Ganado',
      valorCierre: 125000000,
      fechaCierreReal: new Date('2026-10-08T00:00:00Z'),
    });
    expect(cambios.$set.fechaCierre).toBeUndefined();
  });

  it('usa la fecha de hoy si no se indica la fecha real', async () => {
    const e = espias({ oportunidad: oportunidadEn('Propuesta') });
    const antes = Date.now();
    await crmService.marcarOportunidadComoGanada(OP_ID, { valor: 10 });
    const fecha = (e.crearVenta.mock.calls[0][0] as any).fecha as Date;
    expect(fecha.getTime()).toBeGreaterThanOrEqual(antes);
  });

  it('cuenta la venta en el mes de la fecha real de cierre', async () => {
    const e = espias({ oportunidad: oportunidadEn('Propuesta') });
    await crmService.marcarOportunidadComoGanada(OP_ID, { valor: 10, fechaCierreReal: new Date('2026-10-02T00:00:00Z') });
    const venta = e.crearVenta.mock.calls[0][0] as any;
    expect([venta.mes, venta.año]).toEqual([10, 2026]);
  });

  it('rechaza montos que no son un número mayor que cero, sin guardar nada', async () => {
    for (const valor of [0, -5, Number.NaN, '100' as any, undefined as any]) {
      const e = espias({ oportunidad: oportunidadEn('Propuesta') });
      const error = await errorDe(crmService.marcarOportunidadComoGanada(OP_ID, { valor }));
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('El monto final debe ser un número mayor que cero.');
      expect(e.crearVenta).not.toHaveBeenCalled();
      restaurar();
    }
  });

  it('rechaza una fecha futura o anterior a la creación de la oportunidad', async () => {
    for (const fecha of [new Date(Date.now() + 3 * 24 * 3600 * 1000), new Date('2026-09-30T00:00:00Z'), new Date('no es fecha')]) {
      const e = espias({ oportunidad: oportunidadEn('Propuesta') });
      const error = await errorDe(crmService.marcarOportunidadComoGanada(OP_ID, { valor: 10, fechaCierreReal: fecha }));
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('La fecha de cierre no puede ser futura ni anterior a la creación de la oportunidad.');
      expect(e.crearVenta).not.toHaveBeenCalled();
      restaurar();
    }
  });

  it('acepta como fecha real el mismo día en que se creó la oportunidad', async () => {
    const e = espias({ oportunidad: oportunidadEn('Propuesta') });
    await crmService.marcarOportunidadComoGanada(OP_ID, { valor: 10, fechaCierreReal: new Date('2026-10-01T00:00:00Z') });
    expect(e.crearVenta).toHaveBeenCalled();
  });

  it('rechaza un comentario de más de 500 caracteres', async () => {
    const e = espias({ oportunidad: oportunidadEn('Propuesta') });
    const error = await errorDe(crmService.marcarOportunidadComoGanada(OP_ID, { valor: 10, comentario: 'a'.repeat(501) }));
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('El comentario no puede superar los 500 caracteres.');
    expect(e.crearVenta).not.toHaveBeenCalled();
  });

  it('devuelve 404 si la oportunidad no existe', async () => {
    espias({ oportunidad: null });
    const error = await errorDe(crmService.marcarOportunidadComoGanada(OP_ID, { valor: 10 }));
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('Oportunidad no encontrada.');
  });

  it('rechaza con 409 una oportunidad que ya está ganada, sin registrar otra venta', async () => {
    const e = espias({ oportunidad: oportunidadEn('Cerrado Ganado'), ventaExistente: { _id: 'v0' } });
    const error = await errorDe(crmService.marcarOportunidadComoGanada(OP_ID, { valor: 10 }));
    expect(error.statusCode).toBe(409);
    expect(error.message).toBe('Esta oportunidad ya está marcada como ganada.');
    expect(e.crearVenta).not.toHaveBeenCalled();
    expect(e.actualizarVenta).not.toHaveBeenCalled();
  });

  it('repara un intento interrumpido: actualiza la venta existente y marca la oportunidad ganada', async () => {
    const e = espias({ oportunidad: oportunidadEn('Negociación'), ventaExistente: { _id: 'v0', valor: 1 } });

    await crmService.marcarOportunidadComoGanada(OP_ID, { valor: 500, fechaCierreReal: new Date('2026-10-05T00:00:00Z'), comentario: 'Reintento' });

    expect(e.crearVenta).not.toHaveBeenCalled();
    const [, cambiosVenta] = e.actualizarVenta.mock.calls[0] as any;
    expect(cambiosVenta.$set).toMatchObject({ valor: 500, mes: 10, año: 2026, comentario: 'Reintento' });
    expect((e.actualizarOp.mock.calls[0] as any)[1].$set.estado).toBe('Cerrado Ganado');
  });

  it('convierte una venta duplicada por una carrera en un 409', async () => {
    const e = espias({ oportunidad: oportunidadEn('Propuesta') });
    e.crearVenta.mockRejectedValue(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }));
    const error = await errorDe(crmService.marcarOportunidadComoGanada(OP_ID, { valor: 10 }));
    expect(error.statusCode).toBe(409);
    expect(e.actualizarOp).not.toHaveBeenCalled();
  });

  it('si falla marcar la oportunidad, borra la venta recién creada', async () => {
    const e = espias({ oportunidad: oportunidadEn('Propuesta') });
    e.actualizarOp.mockRejectedValue(new Error('sin conexión'));
    await expect(crmService.marcarOportunidadComoGanada(OP_ID, { valor: 10 })).rejects.toThrow('sin conexión');
    expect(e.borrarVenta).toHaveBeenCalled();
  });
});

describe('crearVentaGanada (herramienta del agente)', () => {
  afterEach(restaurar);

  it('usa la acción compartida: monto, fecha real y una sola venta', async () => {
    const e = espias({ oportunidad: oportunidadEn('Negociación') });
    await crmService.crearVentaGanada({ oportunidadId: OP_ID, valor: 900, vendedorId: 'otro' } as any);
    const venta = e.crearVenta.mock.calls[0][0] as any;
    expect(venta.valor).toBe(900);
    expect(String(venta.vendedorId)).toBe(String(VENDEDOR_ID));
    expect((e.actualizarOp.mock.calls[0] as any)[1].$set).toMatchObject({ estado: 'Cerrado Ganado', valorCierre: 900 });
  });
});

describe('actualizarOportunidad y el estado ganado', () => {
  afterEach(restaurar);

  it('no permite poner "Cerrado Ganado" (la venta se registra aparte)', async () => {
    const e = espias({ oportunidad: oportunidadEn('Negociación') });
    const error = await errorDe(crmService.actualizarOportunidad(OP_ID, { estado: 'Cerrado Ganado' } as any));
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('Para marcar la oportunidad como ganada, registra la venta con su monto final.');
    expect(e.actualizarOp).not.toHaveBeenCalled();
  });

  it('al reabrir una ganada borra su venta y limpia monto y fecha real, sin tocar la fecha esperada', async () => {
    const e = espias({ oportunidad: oportunidadEn('Cerrado Ganado') });
    await crmService.actualizarOportunidad(OP_ID, { estado: 'Negociación' } as any);
    const cambios = (e.actualizarOp.mock.calls[0] as any)[1];
    expect(cambios.$set).toEqual({ estado: 'Negociación' });
    expect(cambios.$unset).toEqual({ valorCierre: '', fechaCierreReal: '' });
    expect(String((e.borrarVenta.mock.calls[0] as any)[0].oportunidadId)).toBe(OP_ID);
  });

  it('cambiar entre etapas no ganadas no toca ventas', async () => {
    const e = espias({ oportunidad: oportunidadEn('Propuesta') });
    await crmService.actualizarOportunidad(OP_ID, { estado: 'Negociación' } as any);
    expect((e.actualizarOp.mock.calls[0] as any)[1].$unset).toBeUndefined();
    expect(e.borrarVenta).not.toHaveBeenCalled();
  });
});
