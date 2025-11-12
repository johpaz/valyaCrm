// controllers/dashboardController.js
import mongoose from 'mongoose';
import Actividad from '../models/actividadModel.js';
import Empresa from '../models/empresaModel.js';
import Oportunidad from '../models/oportunidadModel.js';
import VentaGanada from '../models/ventaGanadaModel.js';
import Vendedor from '../models/vendedorModel.js';
import Conversacion from '../models/conversacionModel.js';
import Producto from '../models/productoModel.js';
import Contacto from '../models/contactoModel.js';

interface DashboardParams {
  vendedorId: string;
  userId: string;
}

const getVendedorDashboard = async (params: DashboardParams): Promise<any> => {
    const { vendedorId, userId } = params;

  try {
    // 1. Datos básico: aquí no hace falta convertir, Mongoose acepta string
    const vendedor = await Vendedor.findById(vendedorId)
      .select('nombre email telefono cargo activo')
      .lean();

    if (!vendedor) {
      throw new Error('Vendedor no encontrado');
    }

    const objVendedorId = new mongoose.Types.ObjectId(vendedorId);

    // 2. Actividades
    const actividades = await Actividad.find({
      vendedorId: objVendedorId,
      estado: { $in: ['Pendiente', 'Backlog', 'En progreso'] }
    })
      .sort('fechaProgramada')
      .limit(10)
      .lean();

    // 3. Oportunidades por estado
    const oportunidadesPorEstado = await Oportunidad.aggregate([
      { $match: { vendedorId: objVendedorId } },
      { $group: { _id: '$estado', count: { $sum: 1 } } }
    ]);

    // 4. Empresas
    const empresas = await Empresa.find({ vendedorId: objVendedorId })
      .select('nombre telefono email')
      .lean();

    // 5. Ventas por mes
    const ventasPorMes = await VentaGanada.aggregate([
      { $match: { vendedorId: objVendedorId } },
      {
        $group: {
          _id: { mes: '$mes', año: '$año' },
          totalMes: { $sum: '$valor' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.año': -1, '_id.mes': -1 } },
      { $limit: 6 }
    ]);

    // 6. Conversaciones (aquí Mongoose también acepta string)
    const conversaciones = await Conversacion.find({ userId: userId })
      .sort('-timestamp')
      .limit(10)
      .lean();

    // 7. Top productos
    const productosTop = await Producto.find({  vendedorId })
    
  
        .sort('-timestamp')
        .limit(10)
        .lean();
        
     // 8. Top contactos
    const contactos = await Contacto.find({ vendedor: vendedorId })
      .sort('-timestamp')
          .limit(10)
          .lean();
          
  


    return {
      vendedor,
      actividades,
      oportunidadesPorEstado,
      empresas,
      ventasPorMes,
      conversaciones,
      productosTop,
      contactos
    };

  } catch (err) {
    console.error('Error al obtener dashboard:', err);
    throw new Error('Error interno del servidor');
  }
};

export {
  getVendedorDashboard
};
