import { describe, it, expect } from 'bun:test';
import mongoose from 'mongoose';
import Oportunidad from './oportunidadModel';

// Ejecuta los ganchos "pre findOneAndUpdate" del modelo sobre una consulta sin
// enviarla a la base de datos, y devuelve la actualización resultante.
async function actualizacionTrasGanchos(actualizacion: Record<string, unknown>) {
  const consulta = Oportunidad.findOneAndUpdate({ _id: new mongoose.Types.ObjectId() }, actualizacion);
  const ganchos = (Oportunidad.schema as any).s.hooks;
  await new Promise<void>((resolver, rechazar) =>
    ganchos.execPre('findOneAndUpdate', consulta, [], (error?: Error) => (error ? rechazar(error) : resolver())),
  );
  return consulta.getUpdate() as Record<string, any>;
}

describe('fechaActualizacion de las oportunidades', () => {
  it('se actualiza al cambiar el estado con $set', async () => {
    const antes = Date.now();
    const actualizacion = await actualizacionTrasGanchos({ $set: { estado: 'Propuesta' } });
    expect(actualizacion.$set.estado).toBe('Propuesta');
    expect(actualizacion.$set.fechaActualizacion).toBeInstanceOf(Date);
    expect(actualizacion.$set.fechaActualizacion.getTime()).toBeGreaterThanOrEqual(antes);
  });

  it('se actualiza al agregar una actividad con $push', async () => {
    const actualizacion = await actualizacionTrasGanchos({ $push: { actividades: new mongoose.Types.ObjectId() } });
    expect(actualizacion.$set.fechaActualizacion).toBeInstanceOf(Date);
    expect(actualizacion.$push.actividades).toBeDefined();
  });

  it('respeta una fecha que el llamante fije a propósito', async () => {
    const fija = new Date('2026-01-01');
    const actualizacion = await actualizacionTrasGanchos({ $set: { fechaActualizacion: fija } });
    expect(actualizacion.$set.fechaActualizacion).toEqual(fija);
  });
});
