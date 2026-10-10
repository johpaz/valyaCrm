import { describe, it, expect } from 'bun:test';
import mongoose from 'mongoose';
import VentaGanada from './ventaGanadaModel';
import Oportunidad from './oportunidadModel';

const base = () => ({
  oportunidadId: new mongoose.Types.ObjectId(),
  vendedorId: new mongoose.Types.ObjectId(),
  valor: 1000,
});

describe('VentaGanada', () => {
  it('guarda un comentario opcional sin espacios sobrantes', () => {
    const venta = new VentaGanada({ ...base(), comentario: '  Firmado el contrato  ' });
    expect(venta.validateSync()).toBeUndefined();
    expect(venta.comentario).toBe('Firmado el contrato');
    expect(new VentaGanada(base()).validateSync()).toBeUndefined();
  });

  it('rechaza un comentario de más de 500 caracteres', () => {
    const venta = new VentaGanada({ ...base(), comentario: 'a'.repeat(501) });
    expect(venta.validateSync()?.errors.comentario).toBeDefined();
    expect(new VentaGanada({ ...base(), comentario: 'a'.repeat(500) }).validateSync()).toBeUndefined();
  });

  it('permite una sola venta por oportunidad (índice único)', () => {
    const indice = VentaGanada.schema.indexes().find(([campos]) => 'oportunidadId' in campos);
    expect(indice?.[1]?.unique).toBe(true);
  });
});

describe('Oportunidad: fechas de cierre', () => {
  it('distingue la fecha de cierre esperada de la real', () => {
    expect(Oportunidad.schema.path('fechaCierre')).toBeDefined();
    expect(Oportunidad.schema.path('fechaCierreReal')?.instance).toBe('Date');
  });
});
