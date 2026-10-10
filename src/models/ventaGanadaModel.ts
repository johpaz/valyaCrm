import mongoose from 'mongoose';
const { Schema } = mongoose;

const ventaGanadaSchema = new Schema({
  // Una sola venta por oportunidad (2.10), garantizado también en la base de datos.
  oportunidadId: { type: Schema.Types.ObjectId, ref: 'Oportunidad', required: true, unique: true },
  valor: { type: Number, required: true },
  fecha: { type: Date, default: Date.now },
  mes: { type: Number, default: () => new Date().getMonth() + 1 },
  año: { type: Number, default: () => new Date().getFullYear() },
  vendedorId: { type: Schema.Types.ObjectId, ref: 'Vendedor', required: true },
  comentario: { type: String, trim: true, maxlength: 500 }
});

const VentaGanada = mongoose.model('VentaGanada', ventaGanadaSchema);

export default VentaGanada;