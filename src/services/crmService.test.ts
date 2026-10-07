import { describe, it, expect, spyOn, afterEach } from 'bun:test';
import Vendedor from '../models/vendedorModel';
import crmService, { campoDuplicadoVendedor } from './crmService';

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
