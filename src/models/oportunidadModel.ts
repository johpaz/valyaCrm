import mongoose from 'mongoose';
const { Schema } = mongoose;

const oportunidadSchema = new Schema({
  empresaId: { type: Schema.Types.ObjectId, ref: 'Empresa' },
  productoId: { type: Schema.Types.ObjectId, ref: 'Producto'  },
  vendedorId: { type: Schema.Types.ObjectId, ref: 'Vendedor', required: true },
  contactoId: { type: Schema.Types.ObjectId, ref: 'Contacto' },
  estado: {
    type: String,
    enum: ['Prospecto', 'Calificado', 'Propuesta', 'Negociación', 'Cerrado Ganado', 'Cerrado Perdido', 'Seguimiento'],
    default: 'Prospecto'
  },
  nombre: { type: String, required: true },
  valorEstimado: { type: Number, default: 0 },
  fechaCreacion: { type: Date, default: Date.now },
  fechaActualizacion: { type: Date, default: Date.now },
  // Fecha de cierre esperada; la real (al ganarse) va en fechaCierreReal (2.10).
  fechaCierre: { type: Date },
  fechaCierreReal: { type: Date },
  valorCierre: { type: Number },
  comision:{type:Number},
  proximosPasos: { type: String },
  actividades: [{ type: Schema.Types.ObjectId, ref: 'Actividad' }],
  notas: [{ type: String }]
});

oportunidadSchema.pre('save', function(next) {
  this.fechaActualizacion = new Date();
  next();
});

// Las actualizaciones usan findByIdAndUpdate, que no ejecuta el pre('save'):
// este gancho mantiene fechaActualizacion al día en todas ellas (estado,
// actividades nuevas, cierre ganado), salvo que el llamante la fije a propósito.
oportunidadSchema.pre('findOneAndUpdate', function(next) {
  const actualizacion = this.getUpdate() as Record<string, any> | null;
  const fijada = actualizacion?.fechaActualizacion ?? actualizacion?.$set?.fechaActualizacion;
  if (!fijada) {
    this.set({ fechaActualizacion: new Date() });
  }
  next();
});

const Oportunidad = mongoose.model('Oportunidad', oportunidadSchema);

export default Oportunidad;