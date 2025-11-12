import mongoose from 'mongoose';
const { Schema } = mongoose;

const ventaGanadaSchema = new Schema({
  oportunidadId: { type: Schema.Types.ObjectId, ref: 'Oportunidad', required: true },
  valor: { type: Number, required: true },
  fecha: { type: Date, default: Date.now },
  mes: { type: Number, default: () => new Date().getMonth() + 1 },
  año: { type: Number, default: () => new Date().getFullYear() },
  vendedorId: { type: Schema.Types.ObjectId, ref: 'Vendedor', required: true }
});

const VentaGanada = mongoose.model('VentaGanada', ventaGanadaSchema);

export default VentaGanada;