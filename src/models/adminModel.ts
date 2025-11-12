import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  rol: { type: String, default: 'admin', enum: ['admin'] },
  activo: { type: Boolean, default: true },
  fechaCreacion: { type: Date, default: Date.now },
  fechaActualizacion: { type: Date, default: Date.now }
});

adminSchema.pre('save', function(next) {
  this.fechaActualizacion = new Date();
  next();
});

const Admin = mongoose.model('Admin', adminSchema);

export default Admin;
