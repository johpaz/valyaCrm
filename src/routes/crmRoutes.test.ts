import { describe, it, expect, spyOn, afterEach } from 'bun:test';
import crmService from '../services/crmService';
import crmRoutes from './crmRoutes';

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
