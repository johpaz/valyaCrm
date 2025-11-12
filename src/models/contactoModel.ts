import mongoose from 'mongoose';

const contactoSchema = new mongoose.Schema({
  nombre: { type: String, trim: true },
  empresaId: {type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
  email: { type: String, trim: true, lowercase: true },
  telefono: { type: String, trim: true },
  cargo: { type: String, trim: true },
  vendedor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendedor', required: true },
  fechaCreacion: { type: Date, default: Date.now },
  fechaActualizacion: { type: Date, default: Date.now }
});

// Virtual para popular empresa
contactoSchema.virtual('empresa', {
  ref: 'Empresa',
  localField: 'empresaId',
  foreignField: '_id',
  justOne: true
});

// Middleware para actualizar la fecha de modificación antes de guardar
contactoSchema.pre('save', function(next) {
  this.fechaActualizacion = new Date();
  next();
});

const Contacto = mongoose.model('Contacto', contactoSchema);

export default Contacto;