import { describe, it, expect, spyOn, afterEach, setSystemTime } from 'bun:test';
import Vendedor from '../models/vendedorModel';
import mongoose from 'mongoose';
import Oportunidad from '../models/oportunidadModel';
import Actividad from '../models/actividadModel';
import VentaGanada from '../models/ventaGanadaModel';
import { AppError } from '../types/index';
import crmService, { campoDuplicadoVendedor, darFormaActividad, darFormaOportunidad, estaAbierta, ESTADOS_ACTIVIDAD, ESTADOS_OPORTUNIDAD } from './crmService';

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
  const llamadas: Record<string, unknown[][]> = { sort: [], limit: [], populate: [], select: [] };
  const consulta: any = {
    sort: (...a: unknown[]) => (llamadas.sort.push(a), consulta),
    select: (...a: unknown[]) => (llamadas.select.push(a), consulta),
    limit: (...a: unknown[]) => (llamadas.limit.push(a), consulta),
    populate: (...a: unknown[]) => (llamadas.populate.push(a), consulta),
    lean: () => Promise.resolve(resultado),
  };
  return { consulta, llamadas };
}

const VENDEDOR = '6ac956a7dfb71b89c6dccc09';

// Consulta falsa de actividades: devuelve las que el filtro deja pasar, como la base.
function actividadesFalsas(existentes: { _id: string; estado?: string }[]) {
  return spyOn(Actividad, 'find').mockImplementation(((filtro: any) => {
    const ids = filtro._id.$in.map(String);
    const encontradas = existentes.filter((a) => ids.includes(a._id) && a.estado !== filtro.estado.$ne);
    const consulta: any = { select: () => consulta, lean: () => Promise.resolve(encontradas) };
    return consulta;
  }) as any);
}

describe('listarOportunidadesDeVendedor', () => {
  afterEach(() => {
    (Oportunidad.find as any).mockRestore?.();
    (Actividad.find as any).mockRestore?.();
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
    actividadesFalsas([{ _id: 'a1', estado: 'Pendiente' }, { _id: 'a2', estado: 'Pendiente' }]);
    const [oportunidad] = await crmService.listarOportunidadesDeVendedor(VENDEDOR);
    expect(oportunidad.cantidadActividades).toBe(2);
  });

  it('cuenta en cada oportunidad solo sus actividades no finalizadas, con una sola consulta', async () => {
    spyOn(Oportunidad, 'find').mockReturnValue(
      consultaFalsa([
        { _id: 'o1', nombre: 'Mixta', actividades: ['a1', 'a2', 'a3'] },
        { _id: 'o2', nombre: 'Terminada', actividades: ['a4'] },
        { _id: 'o3', nombre: 'Sin actividades', actividades: [] },
        { _id: 'o4', nombre: 'Sin lista' },
      ]).consulta,
    );
    const find = actividadesFalsas([
      { _id: 'a1', estado: 'Pendiente' },
      { _id: 'a2', estado: 'Finalizada' },
      { _id: 'a3', estado: 'Bloqueado' },
      { _id: 'a4', estado: 'Finalizada' },
    ]);

    const lista = await crmService.listarOportunidadesDeVendedor(VENDEDOR);

    expect(lista.map((o) => o.actividadesAbiertas)).toEqual([2, 0, 0, 0]);
    expect(lista.map((o) => o.cantidadActividades)).toEqual([3, 1, 0, 0]);
    expect(find).toHaveBeenCalledTimes(1);
    expect(find.mock.calls[0][0]).toEqual({
      _id: { $in: ['a1', 'a2', 'a3', 'a4'] },
      estado: { $ne: 'Finalizada' },
    });
  });

  it('no cuenta una actividad que ya no existe', async () => {
    spyOn(Oportunidad, 'find').mockReturnValue(
      consultaFalsa([{ _id: 'o1', nombre: 'Deal', actividades: ['a1', 'borrada'] }]).consulta,
    );
    actividadesFalsas([{ _id: 'a1', estado: 'En progreso' }]);
    const [oportunidad] = await crmService.listarOportunidadesDeVendedor(VENDEDOR);
    expect(oportunidad.actividadesAbiertas).toBe(1);
    expect(oportunidad.cantidadActividades).toBe(2);
  });

  it('no consulta actividades si ninguna oportunidad tiene', async () => {
    spyOn(Oportunidad, 'find').mockReturnValue(consultaFalsa([{ _id: 'o1', nombre: 'Deal', actividades: [] }]).consulta);
    const find = actividadesFalsas([]);
    const [oportunidad] = await crmService.listarOportunidadesDeVendedor(VENDEDOR);
    expect(oportunidad.actividadesAbiertas).toBe(0);
    expect(find).not.toHaveBeenCalled();
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
    }, 2);

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
      actividadesAbiertas: 2,
      valorCierre: null,
      fechaCierreReal: null,
      empresa: { _id: 'e1', nombre: 'Bancolombia', sector: 'Banca', ubicacion: 'Medellín' },
      contacto: { _id: 'c1', nombre: 'María', cargo: 'CTO', telefono: '+573001112233', email: 'm@b.co' },
      producto: { _id: 'p1', nombre: 'Software CRM' },
    });
  });

  it('usa null para relaciones ausentes o borradas y 0 actividades si no hay', () => {
    const resultado = darFormaOportunidad({ _id: 'o2', nombre: 'Sin datos', empresaId: null }, 0);
    expect(resultado.empresa).toBeNull();
    expect(resultado.contacto).toBeNull();
    expect(resultado.producto).toBeNull();
    expect(resultado.cantidadActividades).toBe(0);
    expect(resultado.notas).toEqual([]);
  });

  it('no expone un id sin poblar como si fuera la relación', () => {
    const resultado = darFormaOportunidad({ _id: 'o3', nombre: 'Id suelto', contactoId: '64b000000000000000000001' }, 0);
    expect(resultado.contacto).toBeNull();
  });
});

describe('estaAbierta', () => {
  it('solo una actividad finalizada deja de estar abierta', () => {
    for (const estado of ['Pendiente', 'Backlog', 'En progreso', 'En revisión', 'Bloqueado']) {
      expect(estaAbierta({ estado })).toBe(true);
    }
    expect(estaAbierta({ estado: 'Finalizada' })).toBe(false);
  });

  it('un estado ausente o inesperado cuenta como abierta', () => {
    expect(estaAbierta({})).toBe(true);
    expect(estaAbierta({ estado: 'finalizada' })).toBe(true);
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
    expect(oportunidad?.actividadesAbiertas).toBe(1);
  });

  it('cuenta como abiertas las actividades devueltas que no están finalizadas', async () => {
    const actividad = (id: string, estado: string) => ({ _id: id, nombre: id, estado });
    spyOn(Oportunidad, 'findById').mockReturnValue(
      consultaFalsa({
        _id: OPORTUNIDAD,
        nombre: 'Deal',
        actividades: [actividad('a1', 'Backlog'), actividad('a2', 'Finalizada'), actividad('a3', 'En revisión')],
      }).consulta,
    );

    const oportunidad = await crmService.obtenerOportunidadPorId(OPORTUNIDAD);

    expect(oportunidad?.actividadesAbiertas).toBe(2);
    expect(oportunidad?.actividadesAbiertas).toBe(
      oportunidad?.actividades.filter((a) => a.estado !== 'Finalizada').length,
    );
    expect(oportunidad?.cantidadActividades).toBe(3);
  });

  it('una oportunidad sin actividades tiene 0 abiertas', async () => {
    spyOn(Oportunidad, 'findById').mockReturnValue(consultaFalsa({ _id: OPORTUNIDAD, nombre: 'Deal' }).consulta);
    expect((await crmService.obtenerOportunidadPorId(OPORTUNIDAD))?.actividadesAbiertas).toBe(0);
  });

  it('propaga el error de la base de datos', async () => {
    const { consulta } = consultaFalsa(null);
    consulta.lean = () => Promise.reject(new Error('sin conexión'));
    spyOn(Oportunidad, 'findById').mockReturnValue(consulta);
    await expect(crmService.obtenerOportunidadPorId(OPORTUNIDAD)).rejects.toThrow('sin conexión');
  });
});

// --- 3.1: actividades del tablero Kanban ---

describe('listarActividadesDeVendedor', () => {
  afterEach(() => {
    (Actividad.find as any).mockRestore?.();
    setSystemTime();
  });

  it('pide las del vendedor: abiertas siempre, finalizadas solo de los últimos 30 días', async () => {
    setSystemTime(new Date('2026-10-31T12:00:00Z'));
    const { consulta } = consultaFalsa([]);
    const find = spyOn(Actividad, 'find').mockReturnValue(consulta);

    await crmService.listarActividadesDeVendedor(VENDEDOR);

    const filtro = find.mock.calls[0][0] as any;
    expect(String(filtro.vendedorId)).toBe(VENDEDOR);
    const desde = new Date('2026-10-01T12:00:00Z');
    expect(filtro.$or).toEqual([
      { estado: { $ne: 'Finalizada' } },
      { fechaFinReal: { $gte: desde } },
      { fechaFinReal: null, fechaActualizacion: { $gte: desde } },
    ]);
  });

  it('las ordena la más próxima primero, hasta 200, con su oportunidad y su contacto', async () => {
    const { consulta, llamadas } = consultaFalsa([]);
    spyOn(Actividad, 'find').mockReturnValue(consulta);

    await crmService.listarActividadesDeVendedor(VENDEDOR);

    expect(llamadas.sort).toEqual([[{ fechaProgramada: 1, _id: 1 }]]);
    expect(llamadas.limit).toEqual([[200]]);
    expect(llamadas.select).toEqual([
      ['tipo nombre descripcion estado prioridad fechaProgramada fechaLimite fechaCreacion fechaActualizacion oportunidadId contactoId'],
    ]);
    expect(llamadas.populate).toEqual([
      [
        {
          path: 'oportunidadId',
          select: 'nombre estado empresaId productoId contactoId',
          populate: [
            { path: 'empresaId', select: 'nombre sector' },
            { path: 'productoId', select: 'nombre' },
            { path: 'contactoId', select: 'nombre cargo telefono email' },
          ],
        },
      ],
      ['contactoId', 'nombre cargo telefono email'],
    ]);
  });

  it('devuelve una lista vacía si el vendedor no tiene actividades', async () => {
    spyOn(Actividad, 'find').mockReturnValue(consultaFalsa([]).consulta);
    expect(await crmService.listarActividadesDeVendedor(VENDEDOR)).toEqual([]);
  });

  it('da forma a cada actividad', async () => {
    spyOn(Actividad, 'find').mockReturnValue(
      consultaFalsa([{ _id: 'a1', estado: 'Pendiente', oportunidadId: null }]).consulta,
    );
    const [actividad] = await crmService.listarActividadesDeVendedor(VENDEDOR);
    expect(actividad).toMatchObject({ _id: 'a1', estado: 'Pendiente', oportunidad: null });
  });

  it('propaga el error de la base de datos', async () => {
    const { consulta } = consultaFalsa(null);
    consulta.lean = () => Promise.reject(new Error('sin conexión'));
    spyOn(Actividad, 'find').mockReturnValue(consulta);
    await expect(crmService.listarActividadesDeVendedor(VENDEDOR)).rejects.toThrow('sin conexión');
  });
});

describe('darFormaActividad', () => {
  const contacto = { _id: 'c1', nombre: 'María', cargo: 'CTO', telefono: '+573001112233', email: 'm@b.co' };

  it('expone sus campos y su oportunidad con empresa, producto y contacto', () => {
    const resultado = darFormaActividad({
      _id: 'a1',
      vendedorId: 'v1',
      tipo: 'Llamada de seguimiento',
      nombre: 'Llamada',
      descripcion: 'Definir cronograma',
      estado: 'En revisión',
      prioridad: 'Alta',
      fechaProgramada: '2026-10-20',
      fechaLimite: '2026-10-25',
      fechaCreacion: '2026-10-01',
      fechaActualizacion: '2026-10-02',
      contactoId: contacto,
      oportunidadId: {
        _id: 'o1',
        nombre: 'Implementación CRM',
        estado: 'Negociación',
        empresaId: { _id: 'e1', nombre: 'Bancolombia', sector: 'Banca' },
        productoId: { _id: 'p1', nombre: 'Software CRM' },
        contactoId: { ...contacto, _id: 'c2', nombre: 'Juan' },
      },
      __v: 0,
    });

    expect(resultado).toEqual({
      _id: 'a1',
      tipo: 'Llamada de seguimiento',
      nombre: 'Llamada',
      descripcion: 'Definir cronograma',
      estado: 'En revisión',
      prioridad: 'Alta',
      fechaProgramada: '2026-10-20',
      fechaLimite: '2026-10-25',
      fechaCreacion: '2026-10-01',
      fechaActualizacion: '2026-10-02',
      contacto,
      oportunidad: {
        _id: 'o1',
        nombre: 'Implementación CRM',
        estado: 'Negociación',
        empresa: { _id: 'e1', nombre: 'Bancolombia', sector: 'Banca' },
        producto: { _id: 'p1', nombre: 'Software CRM' },
        contacto: { ...contacto, _id: 'c2', nombre: 'Juan' },
      },
    });
  });

  it('usa null para lo que falta o está borrado, nunca un id suelto', () => {
    const sinNada = darFormaActividad({ _id: 'a2', estado: 'Backlog' });
    expect(sinNada).toMatchObject({
      tipo: null,
      nombre: null,
      descripcion: null,
      prioridad: null,
      fechaProgramada: null,
      fechaLimite: null,
      contacto: null,
      oportunidad: null,
    });

    const idsSueltos = darFormaActividad({
      _id: 'a3',
      estado: 'Backlog',
      contactoId: '64b000000000000000000001',
      oportunidadId: '64b000000000000000000002',
    });
    expect(idsSueltos.contacto).toBeNull();
    expect(idsSueltos.oportunidad).toBeNull();

    const objectIds = darFormaActividad({
      _id: 'a5',
      estado: 'Backlog',
      contactoId: new mongoose.Types.ObjectId(),
      oportunidadId: new mongoose.Types.ObjectId(),
    });
    expect(objectIds.contacto).toBeNull();
    expect(objectIds.oportunidad).toBeNull();

    const oportunidadSinRelaciones = darFormaActividad({
      _id: 'a4',
      estado: 'Backlog',
      oportunidadId: { _id: 'o1', nombre: 'Deal', estado: 'Prospecto', empresaId: null, productoId: '64b000000000000000000003' },
    });
    expect(oportunidadSinRelaciones.oportunidad).toEqual({
      _id: 'o1',
      nombre: 'Deal',
      estado: 'Prospecto',
      empresa: null,
      producto: null,
      contacto: null,
    });
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

  it('usa la fecha de hoy (día de Bogotá) si no se indica la fecha real', async () => {
    const e = espias({ oportunidad: oportunidadEn('Propuesta') });
    const hoyEnBogota = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
    await crmService.marcarOportunidadComoGanada(OP_ID, { valor: 10 });
    const fecha = (e.crearVenta.mock.calls[0][0] as any).fecha as Date;
    expect(fecha).toEqual(new Date(`${hoyEnBogota}T00:00:00Z`));
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

// --- 2.10 tras la revisión: la fecha real es un día de calendario en Bogotá ---

describe('marcarOportunidadComoGanada: fechas en hora de Bogotá', () => {
  afterEach(() => {
    restaurar();
    setSystemTime();
  });

  const dia = (texto: string) => new Date(`${texto}T00:00:00Z`);

  it('rechaza mañana, aunque falten menos de 24 horas', async () => {
    setSystemTime(new Date('2026-10-10T19:40:00Z')); // 14:40 en Bogotá, 10 oct
    const e = espias({ oportunidad: oportunidadEn('Propuesta') });
    const error = await errorDe(crmService.marcarOportunidadComoGanada(OP_ID, { valor: 10, fechaCierreReal: dia('2026-10-11') }));
    expect(error.statusCode).toBe(400);
    expect(e.crearVenta).not.toHaveBeenCalled();
  });

  it('de noche en Bogotá, "hoy" sigue siendo el día de Bogotá', async () => {
    setSystemTime(new Date('2026-10-11T01:00:00Z')); // 20:00 en Bogotá, 10 oct
    let e = espias({ oportunidad: oportunidadEn('Propuesta') });
    const error = await errorDe(crmService.marcarOportunidadComoGanada(OP_ID, { valor: 10, fechaCierreReal: dia('2026-10-11') }));
    expect(error.statusCode).toBe(400);
    restaurar();
    e = espias({ oportunidad: oportunidadEn('Propuesta') });
    await crmService.marcarOportunidadComoGanada(OP_ID, { valor: 10, fechaCierreReal: dia('2026-10-10') });
    expect(e.crearVenta).toHaveBeenCalled();
  });

  it('sin fecha, usa el día de hoy en Bogotá y lo cuenta en ese mes', async () => {
    setSystemTime(new Date('2026-11-01T01:00:00Z')); // 31 oct, 20:00 en Bogotá
    const e = espias({ oportunidad: oportunidadEn('Propuesta') });
    await crmService.marcarOportunidadComoGanada(OP_ID, { valor: 10 });
    const venta = e.crearVenta.mock.calls[0][0] as any;
    expect(venta.fecha).toEqual(dia('2026-10-31'));
    expect([venta.mes, venta.año]).toEqual([10, 2026]);
    expect((e.actualizarOp.mock.calls[0] as any)[1].$set.fechaCierreReal).toEqual(dia('2026-10-31'));
  });

  it('una oportunidad creada de noche se puede cerrar el mismo día', async () => {
    setSystemTime(new Date('2026-10-10T15:00:00Z'));
    const creadaDeNoche = new Date('2026-10-02T02:00:00Z'); // 1 oct, 21:00 en Bogotá
    let e = espias({ oportunidad: oportunidadEn('Propuesta', { fechaCreacion: creadaDeNoche }) });
    await crmService.marcarOportunidadComoGanada(OP_ID, { valor: 10, fechaCierreReal: dia('2026-10-01') });
    expect(e.crearVenta).toHaveBeenCalled();
    restaurar();
    e = espias({ oportunidad: oportunidadEn('Propuesta', { fechaCreacion: creadaDeNoche }) });
    const error = await errorDe(crmService.marcarOportunidadComoGanada(OP_ID, { valor: 10, fechaCierreReal: dia('2026-09-30') }));
    expect(error.statusCode).toBe(400);
  });

  it('una hora exacta (del agente) se guarda como su día en Bogotá', async () => {
    setSystemTime(new Date('2026-11-02T15:00:00Z'));
    const e = espias({ oportunidad: oportunidadEn('Propuesta') });
    await crmService.marcarOportunidadComoGanada(OP_ID, { valor: 10, fechaCierreReal: new Date('2026-11-01T01:00:00Z') });
    const venta = e.crearVenta.mock.calls[0][0] as any;
    expect(venta.fecha).toEqual(dia('2026-10-31'));
    expect(venta.mes).toBe(10);
  });
});

describe('marcarOportunidadComoGanada: casos límite de la revisión', () => {
  afterEach(restaurar);

  it('al reparar sin comentario nuevo, quita el comentario anterior', async () => {
    const e = espias({ oportunidad: oportunidadEn('Negociación'), ventaExistente: { _id: 'v0', comentario: 'viejo' } });
    await crmService.marcarOportunidadComoGanada(OP_ID, { valor: 500 });
    const [, cambiosVenta] = e.actualizarVenta.mock.calls[0] as any;
    expect(cambiosVenta.$unset).toEqual({ comentario: '' });
    expect(cambiosVenta.$set.comentario).toBeUndefined();
  });

  it('si la oportunidad desaparece a mitad de camino, borra la venta nueva y responde 404', async () => {
    const e = espias({ oportunidad: oportunidadEn('Propuesta') });
    e.actualizarOp.mockResolvedValue(null as any);
    const error = await errorDe(crmService.marcarOportunidadComoGanada(OP_ID, { valor: 10 }));
    expect(error.statusCode).toBe(404);
    expect(e.borrarVenta).toHaveBeenCalled();
  });

  it('si falla marcar la oportunidad al reparar, no borra la venta que ya existía', async () => {
    const e = espias({ oportunidad: oportunidadEn('Propuesta'), ventaExistente: { _id: 'v0' } });
    e.actualizarOp.mockRejectedValue(new Error('sin conexión'));
    await expect(crmService.marcarOportunidadComoGanada(OP_ID, { valor: 10 })).rejects.toThrow('sin conexión');
    expect(e.borrarVenta).not.toHaveBeenCalled();
  });
});

describe('crearVentaGanada: datos del agente', () => {
  afterEach(() => {
    restaurar();
    setSystemTime();
  });

  it('usa la fecha y el comentario que manda el agente', async () => {
    setSystemTime(new Date('2026-10-10T15:00:00Z'));
    const e = espias({ oportunidad: oportunidadEn('Negociación') });
    await crmService.crearVentaGanada({ oportunidadId: OP_ID, valor: 900, fecha: '2026-10-05', comentario: 'Por WhatsApp' } as any);
    const venta = e.crearVenta.mock.calls[0][0] as any;
    expect(venta.fecha).toEqual(new Date('2026-10-05T00:00:00Z'));
    expect(venta.comentario).toBe('Por WhatsApp');
  });
});

describe('actualizarOportunidad al reabrir: casos límite', () => {
  afterEach(restaurar);

  it('no envía monto ni fecha real junto con su borrado (evita el conflicto en MongoDB)', async () => {
    const e = espias({ oportunidad: oportunidadEn('Cerrado Ganado') });
    await crmService.actualizarOportunidad(OP_ID, { estado: 'Propuesta', valorCierre: 5, fechaCierreReal: new Date(), nombre: 'X' } as any);
    const cambios = (e.actualizarOp.mock.calls[0] as any)[1];
    expect(cambios.$set).toEqual({ estado: 'Propuesta', nombre: 'X' });
    expect(cambios.$unset).toEqual({ valorCierre: '', fechaCierreReal: '' });
  });

  it('si la oportunidad ya no existe al reabrir, borra igualmente su venta', async () => {
    const e = espias({ oportunidad: oportunidadEn('Cerrado Ganado') });
    e.actualizarOp.mockResolvedValue(null as any);
    expect(await crmService.actualizarOportunidad(OP_ID, { estado: 'Propuesta' } as any)).toBeNull();
    expect(e.borrarVenta).toHaveBeenCalled();
  });
});

// --- 3.2: el modelo de actividad refresca fechaActualizacion en cada actualización ---

// Envía una actualización real por la cadena de Mongoose y captura lo que
// llegaría a MongoDB, sin conectarse: se reemplaza solo la llamada final al driver.
async function actualizacionDeActividadEnviada(actualizacion: Record<string, unknown>) {
  const driver = spyOn(Actividad.collection, 'findOneAndUpdate').mockResolvedValue(null as any);
  await Actividad.findByIdAndUpdate(new mongoose.Types.ObjectId(), actualizacion, { new: true });
  return driver.mock.calls[0][1] as Record<string, any>;
}

describe('fechaActualizacion de las actividades', () => {
  afterEach(() => {
    (Actividad.collection.findOneAndUpdate as any).mockRestore?.();
  });

  it('se actualiza al cambiar el estado con $set', async () => {
    const antes = Date.now();
    const enviada = await actualizacionDeActividadEnviada({ $set: { estado: 'En progreso' } });
    expect(enviada.$set.estado).toBe('En progreso');
    expect(enviada.$set.fechaActualizacion).toBeInstanceOf(Date);
    expect(enviada.$set.fechaActualizacion.getTime()).toBeGreaterThanOrEqual(antes);
  });

  it('se actualiza también al quitar un campo con $unset, sin perder el $unset', async () => {
    const enviada = await actualizacionDeActividadEnviada({ $set: { estado: 'Pendiente' }, $unset: { fechaFinReal: 1 } });
    expect(enviada.$set.fechaActualizacion).toBeInstanceOf(Date);
    expect(enviada.$unset).toEqual({ fechaFinReal: 1 });
  });

  it('respeta una fecha que el llamante fije a propósito', async () => {
    const fija = new Date('2026-01-01');
    const enviada = await actualizacionDeActividadEnviada({ $set: { fechaActualizacion: fija } });
    expect(enviada.$set.fechaActualizacion).toEqual(fija);
  });
});

// --- 3.2: cambio de estado de una actividad desde el tablero ---

const ACTIVIDAD = '6acc6ad38aef26f258702622';

describe('ESTADOS_ACTIVIDAD', () => {
  it('son exactamente los seis estados del modelo', () => {
    expect(ESTADOS_ACTIVIDAD).toEqual(['Pendiente', 'Backlog', 'En progreso', 'En revisión', 'Bloqueado', 'Finalizada']);
  });
});

describe('cambiarEstadoActividad', () => {
  afterEach(() => {
    (Actividad.findById as any).mockRestore?.();
    (Actividad.findByIdAndUpdate as any).mockRestore?.();
    setSystemTime();
  });

  // La actividad tal como está antes del cambio, y la actualización que se envía.
  function conEstadoActual(estado: string | null) {
    spyOn(Actividad, 'findById').mockReturnValue(consultaFalsa(estado === null ? null : { _id: ACTIVIDAD, estado }).consulta);
    return spyOn(Actividad, 'findByIdAndUpdate').mockResolvedValue({ _id: ACTIVIDAD } as any);
  }

  it('entre estados abiertos solo cambia el estado', async () => {
    const actualizar = conEstadoActual('Backlog');
    expect(await crmService.cambiarEstadoActividad(ACTIVIDAD, 'En progreso')).toBe(true);
    expect(actualizar.mock.calls[0][0]).toBe(ACTIVIDAD);
    expect(actualizar.mock.calls[0][1]).toEqual({ $set: { estado: 'En progreso' } });
  });

  it('al pasar a Finalizada guarda el momento en que se terminó', async () => {
    setSystemTime(new Date('2026-10-12T15:30:00Z'));
    const actualizar = conEstadoActual('En revisión');
    await crmService.cambiarEstadoActividad(ACTIVIDAD, 'Finalizada');
    expect(actualizar.mock.calls[0][1]).toEqual({
      $set: { estado: 'Finalizada', fechaFinReal: new Date('2026-10-12T15:30:00Z') },
    });
  });

  it('al salir de Finalizada quita la fecha de fin', async () => {
    const actualizar = conEstadoActual('Finalizada');
    await crmService.cambiarEstadoActividad(ACTIVIDAD, 'Pendiente');
    expect(actualizar.mock.calls[0][1]).toEqual({ $set: { estado: 'Pendiente' }, $unset: { fechaFinReal: 1 } });
  });

  it('Finalizada otra vez conserva la fecha de fin original', async () => {
    const actualizar = conEstadoActual('Finalizada');
    await crmService.cambiarEstadoActividad(ACTIVIDAD, 'Finalizada');
    expect(actualizar.mock.calls[0][1]).toEqual({ $set: { estado: 'Finalizada' } });
  });

  it('devuelve false sin actualizar nada si la actividad no existe', async () => {
    const actualizar = conEstadoActual(null);
    expect(await crmService.cambiarEstadoActividad(ACTIVIDAD, 'Pendiente')).toBe(false);
    expect(actualizar).not.toHaveBeenCalled();
  });

  it('devuelve false si la actividad se borra entre la lectura y la actualización', async () => {
    conEstadoActual('Backlog').mockResolvedValue(null as any);
    expect(await crmService.cambiarEstadoActividad(ACTIVIDAD, 'Pendiente')).toBe(false);
  });

  it('propaga el error de la base de datos', async () => {
    conEstadoActual('Backlog').mockRejectedValue(new Error('sin conexión'));
    await expect(crmService.cambiarEstadoActividad(ACTIVIDAD, 'Pendiente')).rejects.toThrow('sin conexión');
  });
});

describe('obtenerActividadParaTablero', () => {
  afterEach(() => {
    (Actividad.findById as any).mockRestore?.();
  });

  it('trae la actividad con los mismos campos y relaciones que la lista del tablero', async () => {
    const { consulta, llamadas } = consultaFalsa({ _id: ACTIVIDAD, estado: 'Finalizada', oportunidadId: null });
    const findById = spyOn(Actividad, 'findById').mockReturnValue(consulta);

    const actividad = await crmService.obtenerActividadParaTablero(ACTIVIDAD);

    expect(findById.mock.calls[0][0]).toBe(ACTIVIDAD);
    expect(llamadas.select).toEqual([
      ['tipo nombre descripcion estado prioridad fechaProgramada fechaLimite fechaCreacion fechaActualizacion oportunidadId contactoId'],
    ]);
    expect(llamadas.populate).toEqual([
      [
        {
          path: 'oportunidadId',
          select: 'nombre estado empresaId productoId contactoId',
          populate: [
            { path: 'empresaId', select: 'nombre sector' },
            { path: 'productoId', select: 'nombre' },
            { path: 'contactoId', select: 'nombre cargo telefono email' },
          ],
        },
      ],
      ['contactoId', 'nombre cargo telefono email'],
    ]);
    expect(actividad).toMatchObject({ _id: ACTIVIDAD, estado: 'Finalizada', oportunidad: null, contacto: null });
  });

  it('devuelve null si la actividad no existe', async () => {
    spyOn(Actividad, 'findById').mockReturnValue(consultaFalsa(null).consulta);
    expect(await crmService.obtenerActividadParaTablero(ACTIVIDAD)).toBeNull();
  });
});
