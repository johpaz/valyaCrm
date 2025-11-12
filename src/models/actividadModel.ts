import mongoose from 'mongoose';
const { Schema } = mongoose;

const actividadSchema = new Schema({
  oportunidadId: { type: Schema.Types.ObjectId, ref: 'Oportunidad', required: true },
  vendedorId: { type: Schema.Types.ObjectId, ref: 'Vendedor', required: true },
  contactoId: { type: Schema.Types.ObjectId, ref: 'Contacto' },
  tipo: { type: String,  },
  nombre: { type: String,  },
  descripcion: { type: String,  },
  fecha: { type: Date, default: Date.now },
  estado: {
    type: String,
    enum: ['Pendiente', 'Backlog',  'En progreso', 'En revisión', 'Bloqueado', 'Finalizada'],
    default: 'Backlog'
  },
  fechaCreacion: { type: Date, default: Date.now },
  fechaActualizacion: { type: Date, default: Date.now },
  fechaProgramada: { type: Date, default: Date.now },
  fechaLimite: { type: Date },
  fechainicioReal: { type: Date },
  fechaFinReal: { type: Date },
  fechaReprogramacion: { type: Date },
  fechaRecordatorio: { type: Date },
  notas: [{ type: String }],
  prioridad: {
    type: String,
    enum: ['Baja', 'Media', 'Alta'],
    default: 'Media'
  },
  
});

// Middleware para actualizar la fecha de modificación antes de guardar
actividadSchema.pre('save', function(next) {
  this.fechaActualizacion = new Date();
  next();
});

const Actividad = mongoose.model('Actividad', actividadSchema);

export default Actividad;