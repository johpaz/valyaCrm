import mongoose from 'mongoose';
const { Schema } = mongoose;

const conversacionSchema = new Schema({
  userId: { type: String, required: true }, 
  text: { type: String, required: true },
  sender: { type: String, enum: ['user', 'model'], required: true },
  timestamp: { type: Date, default: Date.now },
  metadata: {
    messageLength: { type: Number }
  }
});

conversacionSchema.index({ userId: 1, timestamp: -1 });

const Conversacion = mongoose.model('Conversacion', conversacionSchema);

export default Conversacion;