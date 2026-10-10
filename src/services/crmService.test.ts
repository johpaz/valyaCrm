import { describe, it, expect, spyOn, afterEach } from 'bun:test';
import Vendedor from '../models/vendedorModel';
import Oportunidad from '../models/oportunidadModel';
import crmService, { campoDuplicadoVendedor, darFormaOportunidad } from './crmService';

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
