import { describe, it, expect, spyOn, afterEach } from 'bun:test';
import mongoose from 'mongoose';
import Oportunidad from './oportunidadModel';

// Envía una actualización real por la cadena de Mongoose y captura lo que
// llegaría a MongoDB, sin conectarse: se reemplaza solo la llamada final al driver.
async function actualizacionEnviada(actualizacion: Record<string, unknown>) {
  const driver = spyOn(Oportunidad.collection, 'findOneAndUpdate').mockResolvedValue(null as any);
  await Oportunidad.findByIdAndUpdate(new mongoose.Types.ObjectId(), actualizacion, { new: true });
  return driver.mock.calls[0][1] as Record<string, any>;
}

describe('fechaActualizacion de las oportunidades', () => {
  afterEach(() => {
    (Oportunidad.collection.findOneAndUpdate as any).mockRestore?.();
  });

  it('se actualiza al cambiar el estado con $set', async () => {
    const antes = Date.now();
    const enviada = await actualizacionEnviada({ $set: { estado: 'Propuesta' } });
    expect(enviada.$set.estado).toBe('Propuesta');
    expect(enviada.$set.fechaActualizacion).toBeInstanceOf(Date);
    expect(enviada.$set.fechaActualizacion.getTime()).toBeGreaterThanOrEqual(antes);
  });

  it('se actualiza al agregar una actividad con $push, sin perder el $push', async () => {
    const actividad = new mongoose.Types.ObjectId();
    const enviada = await actualizacionEnviada({ $push: { actividades: actividad } });
    expect(enviada.$set.fechaActualizacion).toBeInstanceOf(Date);
    expect(String(enviada.$push.actividades)).toBe(String(actividad));
  });

  it('respeta una fecha que el llamante fije a propósito', async () => {
    const fija = new Date('2026-01-01');
    const enviada = await actualizacionEnviada({ $set: { fechaActualizacion: fija } });
    expect(enviada.$set.fechaActualizacion).toEqual(fija);
  });
});
