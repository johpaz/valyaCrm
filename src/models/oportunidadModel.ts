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
  fechaCierre: { type: Date },
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

const Oportunidad = mongoose.model('Oportunidad', oportunidadSchema);

export default Oportunidad;