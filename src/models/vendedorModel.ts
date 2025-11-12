import mongoose from 'mongoose';

const vendedorSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  telefono: { type: String, required: true, unique: true, trim: true },
  cargo: { type: String, trim: true },
  contrasena: { type: String, required: true },
  rol: { type: String, enum: ['vendedor', 'admin'], default: 'vendedor' },
  activo: { type: Boolean, default: true },
  fechaCreacion: { type: Date, default: Date.now },
  fechaActualizacion: { type: Date, default: Date.now }
});

// Middleware para actualizar la fecha de modificación antes de guardar
vendedorSchema.pre('save', function(next) {
  this.fechaActualizacion = new Date();
  next();
});

const Vendedor = mongoose.model('Vendedor', vendedorSchema);

export default Vendedor;