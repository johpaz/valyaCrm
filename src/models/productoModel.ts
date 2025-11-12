import mongoose from 'mongoose';

const productoSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  tipo: { type: String },
  proveedor: [{ type: String, trim: true }],
  marca: [{ type: String,  trim: true }],
  clasificacion: { type: String,  trim: true }, 
  precio: { type: Number,  min: 0 },
  descripcion: { type: String, trim: true },
  fechaActualizacion: { type: Date, default: Date.now },
  vendedorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendedor', required: true }
});

// Middleware para actualizar la fecha de modificación antes de guardar
productoSchema.pre('save', function(next) {
  this.fechaActualizacion = new Date();
  next();
});

const Producto = mongoose.model('Producto', productoSchema);

export default Producto;
