import mongoose from 'mongoose';

const empresaSchema = new mongoose.Schema({
  nombre: { type: String },
  telefono: { type: String, sparse: true },
  email: { type: String },
  direccion: { type: String },
  notas: { type: String, trim: true },
  vendedorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendedor' },
  fechaActualizacion: { type: Date, default: Date.now },
  sector: { type: String },
  tamano: { type: String },
  ubicacion: { type: String },
  sitioWeb: { type: String },
  descripcion: { type: String },
  embedding: { type: [Number] }
}, { timestamps: true });

// Middleware para actualizar la fecha de modificación antes de guardar
empresaSchema.pre('save', function(next) {
  this.fechaActualizacion = new Date();
  next();
});

const Empresa = mongoose.model('Empresa', empresaSchema);

export default Empresa;
