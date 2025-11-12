
import mongoose from 'mongoose';
import logger from '../utils/logger';

const connectDB = async (): Promise<void> => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '', {
      dbName: 'crm_vendedor_b2b'
    });
    logger.info('MongoDB conectado exitosamente usando Mongoose.');
  } catch (error: unknown) {
    logger.error(error);
    process.exit(1); // Salir del proceso con error
  }
};

export default connectDB;
