import logger from '../utils/logger.js';
import Vendedor from '../models/vendedorModel.js';
import Oportunidad from '../models/oportunidadModel.js';
import VentaGanada from '../models/ventaGanadaModel.js';
import Contacto from '../models/contactoModel.js';
import Empresa from '../models/empresaModel.js';
import Producto from '../models/productoModel.js';
import Actividad from '../models/actividadModel.js';
import mongoose from 'mongoose';
import * as calendarService from './calendarService.js';
import type {
  Vendedor as VendedorType,
  Empresa as EmpresaType,
  Contacto as ContactoType,
  Oportunidad as OportunidadType,
  Producto as ProductoType,
  Actividad as ActividadType,
  VentaGanada as VentaGanadaType
} from '../types/index.js';

class CRMService {

// --- Métodos de búsqueda de contexto vendedor ---

async buscarVendedorPorTelefono(phoneNumber: string): Promise<VendedorType | null> {
  logger.info(`Buscando vendedor por teléfono: ${phoneNumber}`);
  // Aseguramos explícitamente que se seleccionen los campos necesarios
  const vendedor = await Vendedor.findOne({ telefono: phoneNumber, activo: true }).select('nombre email');
  if (vendedor) {
    logger.info(`Vendedor encontrado: ${vendedor.nombre} (Email: ${vendedor.email})`);
  } else {
    logger.info(`Vendedor no encontrado para el teléfono: ${phoneNumber}`);
  }
  return vendedor;
}
// Metodos de busqueda decontextos

  async buscarProductosPorNombre(nombre: string, vendedorId: string, limit: number = 5): Promise<ProductoType[]> {
    try {
      const productos = await Producto.find({ nombre: new RegExp(nombre, 'i'),
        vendedorId
       }).limit(limit);
      logger.info(`Consulta de productos por nombre "${nombre}": ${productos.length} encontrados.`);
      return productos;
    } catch (error) {
      logger.error(`Error obteniendo productos por nombre ${nombre}: ${(error as Error).message}`);
      throw error;
    }
  }

  async buscarEmpresasPorNombre(nombre: string, vendedorId: string, limit: number = 5): Promise<EmpresaType[]> {
     try {
      const empresas = await Empresa.find({
        nombre: new RegExp(nombre, 'i'),
        vendedorId
      }).limit(limit);
      logger.info(`Consulta de empresas por nombre "${nombre}" para vendedor ${vendedorId}: ${empresas.length} encontradas.`);
      logger.info(`Empresas encontradas: ${empresas.length} items`);
      return empresas;
    } catch (error) {
      logger.error(`Error obteniendo empresas por nombre ${nombre}: ${(error as Error).message}`);
      throw error;
    }
  }
  
 async buscar_oportunidad_por_nombre(nombre: string, vendedorId: string, limit: number = 5): Promise<OportunidadType[]> {
    try {
      const oportunidades = await Oportunidad.find({
        nombre: new RegExp(nombre, 'i'),
        vendedorId
      }).limit(limit).populate('empresaId');
      logger.info(`Consulta de oportunidades por nombre "${nombre}" para vendedor ${vendedorId}: ${oportunidades.length} encontradas.`);
      return oportunidades;
    } catch (error) {
      logger.error(`Error obteniendo oportunidades por nombre ${nombre}: ${(error as Error).message}`);
      throw error;
    }
  }    

 async buscarActividadesPorDescripcion(descripcion: string, vendedorId: string, oportunidadId: string | null = null, limit: number = 5): Promise<any[]> {
   try {
     const query: any = {
       descripcion: new RegExp(descripcion, 'i'),
       vendedorId
     };

     if (oportunidadId) {
       query.oportunidadId = oportunidadId;
     }

      const actividades = await Actividad.find(query).limit(limit);
      logger.info(`Consulta de actividades por descripción "${descripcion}": ${actividades.length} encontradas.`);
      return actividades;
    } catch (error) {
      logger.error(`Error obteniendo actividades por descripción ${descripcion}: ${(error as Error).message}`);
      throw error;
    }
  } 

  async buscarContactosPorNombre(nombre: string, vendedorId: string, limit: number = 5): Promise<ContactoType[]> {
    try {
      const contactos = await Contacto.find({
        nombre: new RegExp(nombre, 'i'),
        vendedor: new mongoose.Types.ObjectId(vendedorId)
      }).limit(limit).populate('empresa');
      logger.info(`Consulta de contactos por nombre "${nombre}" para vendedor ${vendedorId}: ${contactos.length} encontrados.`);
      return contactos;
    } catch (error) {
      logger.error(`Error obteniendo contactos por nombre ${nombre}: ${(error as Error).message}`);
      throw error;
    }
  }

  async buscarContactoPorId(id: string) {
    try {
      const contacto = await Contacto.findById(id).populate('empresa');
      if (contacto) {
        logger.info(`Contacto encontrado por ID: ${id}`);
      } else {
        logger.warn(`No se encontró contacto con ID: ${id}`);
      }
      return contacto;
    } catch (error) {
      logger.error(`Error buscando contacto por ID ${id}: ${(error as Error).message}`);
      throw error;
    }
  }


  // 
  // --- Métodos para creacion de entidades ---

  async crearVendedor(vendedorData: Partial<VendedorType>): Promise<VendedorType> {
    try {
      const nuevoVendedor = new Vendedor(vendedorData);
      await nuevoVendedor.save();
      logger.info(`Nuevo vendedor creado: ${nuevoVendedor.nombre}`);
      return nuevoVendedor;
    } catch (error) {
      logger.error(`Error creando vendedor: ${(error as Error).message}`);
      throw error;
    }
  }
  async crearProducto(productoData: Partial<ProductoType>): Promise<ProductoType> {
    try {
      const nuevoProducto = new Producto(productoData);
      await nuevoProducto.save();
      logger.info(`Producto creado: ${nuevoProducto.nombre} (ID: ${nuevoProducto._id})`);
      return nuevoProducto;
    } catch (error) {
      logger.error(`Error creando producto: ${(error as Error).message}`);
      throw error;
    }
  }
  async crearEmpresa(empresaData: Partial<EmpresaType>): Promise<EmpresaType> {
    try {
      const nuevaEmpresa = new Empresa(empresaData);
      await nuevaEmpresa.save();
      logger.info(`Empresa creada: ${nuevaEmpresa.nombre} (ID: ${nuevaEmpresa._id})`);
      return nuevaEmpresa;
    } catch (error) {
      logger.error(`Error creando empresa: ${(error as Error).message}`);
      throw error;
    }
  }
  async crearContacto(contactoData: Partial<ContactoType & { vendedorId: string }>): Promise<ContactoType> {
    try {
      const data = { ...contactoData, vendedor: contactoData.vendedorId };
      delete (data as any).vendedorId;
      const nuevoContacto = new Contacto(data);
      await nuevoContacto.save();
      logger.info(`Contacto creado: ${nuevoContacto.nombre} (ID: ${nuevoContacto._id})`);
      return nuevoContacto;
    } catch (error) {
      logger.error(`Error creando contacto: ${(error as Error).message}`);
      throw error;
    }
  }
  async crearOportunidad(oportunidadData: Partial<OportunidadType>): Promise<OportunidadType | null> {
    try {
      const nuevaOportunidad = new Oportunidad(oportunidadData);
      await nuevaOportunidad.save();
      const oportunidadGuardada = await Oportunidad.findById(nuevaOportunidad._id).populate('empresaId');
      if (oportunidadGuardada) {
        logger.info(`Oportunidad creada: ${oportunidadGuardada.nombre} (ID: ${oportunidadGuardada._id})`);
      }
      return oportunidadGuardada;
    } catch (error) {
      logger.error(`Error creando oportunidad: ${(error as Error).message}`);
      throw error;
    }
  }
  async crear_actividad(actividadData: Partial<ActividadType>): Promise<ActividadType> {
    try {
      // 1. Crear la actividad en el CRM
      const nuevaActividad = new Actividad(actividadData);
      await nuevaActividad.save();
      logger.info(`Actividad registrada en CRM: ${nuevaActividad.descripcion}`);

      // 2. Si hay oportunidad, vincularla
      if (actividadData.oportunidadId) {
        await Oportunidad.findByIdAndUpdate(actividadData.oportunidadId, {
          $push: { actividades: nuevaActividad._id }
        });
      }

      // 3. Intentar agendar en Google Calendar
      try {
        const evento = this.formatEventForCalendar(nuevaActividad as any);
        if (evento && actividadData.vendedorId) {
          await calendarService.createEvent(actividadData.vendedorId.toString(), evento);
          logger.info(`Actividad agendada en Google Calendar: ${nuevaActividad.descripcion}`);
        } else {
          logger.warn(`No se agendó la actividad en calendario por falta de fecha/hora o vendedorId: ${nuevaActividad.descripcion}`);
        }
      } catch (calendarError) {
        logger.error(`Error agendando en Google Calendar: ${(calendarError as Error).message}`);
        // No relanzar el error para no afectar la operación principal
      }

      return nuevaActividad as any;
    } catch (error) {
      logger.error(`Error creando actividad: ${(error as Error).message}`);
      throw error;
    }
  }

  formatEventForCalendar(actividad: ActividadType) {
    if (!actividad.fecha) {
      return null; // No se puede agendar sin fecha
    }

    const start = new Date(actividad.fecha);
    if (actividad.hora) {
      const [hours, minutes] = actividad.hora.split(':');
      start.setHours(parseInt(hours), parseInt(minutes));
    }

    const end = new Date(start.getTime() + 60 * 60 * 1000); // Duración de 1 hora por defecto

    return {
      summary: actividad.descripcion,
      description: `Actividad del CRM: ${actividad.tipo}. Notas: ${actividad.notas || 'N/A'}`,
      start: {
        dateTime: start.toISOString(),
        timeZone: 'America/Bogota', 
      },
      end: {
        dateTime: end.toISOString(),
        timeZone: 'America/Bogota',
      },
    };
  }





  // metodos de actualizacion de entidades
  async actualizarProducto(id: string, campos_modificados: Partial<ProductoType>): Promise<ProductoType | null> {
    try {
      const productoActualizado = await Producto.findByIdAndUpdate(id, { $set: campos_modificados }, { new: true });
      if (productoActualizado) {
        logger.info(`Producto actualizado: ${productoActualizado.nombre} (ID: ${id})`);
      }
      return productoActualizado;
    } catch (error) {
      logger.error(`Error actualizando producto ${id}: ${(error as Error).message}`);
      throw error;
    }
  }
  async editarEmpresa(id: string, campos_modificados: Partial<EmpresaType>): Promise<EmpresaType | null> {
    try {
      const empresaActualizada = await Empresa.findByIdAndUpdate(id, { $set: campos_modificados }, { new: true });
      if (empresaActualizada) {
        logger.info(`Empresa actualizada: ${empresaActualizada.nombre} (ID: ${id})`);
      }
      return empresaActualizada;
    } catch (error) {
      logger.error(`Error editando empresa ${id}: ${(error as Error).message}`);
      throw error;
    }
  }

  async eliminarEmpresa(id: string): Promise<{ success: boolean, message: string }> {
    try {
      const empresaEliminada = await Empresa.findByIdAndDelete(id);
      if (empresaEliminada) {
        logger.info(`Empresa eliminada: ${empresaEliminada.nombre} (ID: ${id})`);
      } else {
        logger.warn(`Se intentó eliminar la empresa con ID: ${id}, pero no se encontró.`);
      }
      return { success: true, message: `Empresa eliminada exitosamente.` };
    } catch (error) {
      logger.error(`Error eliminando empresa ${id}: ${(error as Error).message}`);
      throw error;
    }
  }
  async editarContacto(id: string, campos_modificados: Partial<ContactoType>): Promise<any> {
    try {
      const contactoActualizado = await Contacto.findByIdAndUpdate(id, { $set: campos_modificados }, { new: true });
      if (contactoActualizado) {
        logger.info(`Contacto actualizado: ${contactoActualizado.nombre} (ID: ${id})`);
      }
      return contactoActualizado;
    } catch (error) {
      logger.error(`Error editando contacto ${id}: ${(error as Error).message}`);
      throw error;
    }
  }
 async actualizarOportunidad(oportunidadId: string, updateData: Partial<OportunidadType>): Promise<any> {
    try {
      const oportunidadActualizada = await Oportunidad.findByIdAndUpdate(oportunidadId, { $set: updateData }, { new: true });
      if (oportunidadActualizada) {
        logger.info(`Oportunidad actualizada: ${oportunidadActualizada.nombre} (ID: ${oportunidadId})`);
      }
      return oportunidadActualizada;
    } catch (error) {
      logger.error(`Error actualizando oportunidad ${oportunidadId}: ${(error as Error).message}`);
      throw error;
    }
  }


  // Listar entidades por vendedorId
  async obtenerEmpresasPorVendedor(vendedorId: string, limit: number = 50): Promise<EmpresaType[]> {
    try {
      const empresas = await Empresa.find({ vendedorId: new mongoose.Types.ObjectId(vendedorId) }).limit(limit);
      logger.info(`Consulta de empresas para vendedor ${vendedorId}: ${empresas.length} encontradas.`);
      return empresas;
    } catch (error) {
      logger.error(`Error obteniendo empresas por vendedor ${vendedorId}: ${(error as Error).message}`);
      throw error;
    }
  }

  async obtenerContactosPorVendedor(vendedorId: string, limit: number = 50): Promise<ContactoType[]> {
    try {
      const contactos = await Contacto.find({ vendedor: new mongoose.Types.ObjectId(vendedorId) }).limit(limit).populate('empresa');
      logger.info(`Consulta de contactos para vendedor ${vendedorId}: ${contactos.length} encontrados.`);
      return contactos;
    } catch (error) {
      logger.error(`Error obteniendo contactos por vendedor ${vendedorId}: ${(error as Error).message}`);
      throw error;
    }
  }

 async obtenerOportunidadesPorVendedor(vendedorId: string, limit: number = 50): Promise<OportunidadType[]> {
    try {
      const oportunidades = await Oportunidad.find({ vendedorId: new mongoose.Types.ObjectId(vendedorId) }).limit(limit).populate('empresaId');
      logger.info(`Consulta de oportunidades para vendedor ${vendedorId}: ${oportunidades.length} encontradas.`);
      return oportunidades;
    } catch (error) {
      logger.error(`Error obteniendo oportunidades por vendedor ${vendedorId}: ${(error as Error).message}`);
      throw error;
    }
  }

  async buscarOportunidadesPorEmpresa(empresaId: string, limit: number = 10): Promise<OportunidadType[]> {
    try {
      const oportunidades = await Oportunidad.find({ empresaId: new mongoose.Types.ObjectId(empresaId) }).sort({ fechaActualizacion: -1 }).limit(limit);
      logger.info(`Consulta de oportunidades para empresa ${empresaId}: ${oportunidades.length} encontradas.`);
      return oportunidades;
    } catch (error) {
      logger.error(`Error obteniendo oportunidades por empresa ${empresaId}: ${(error as Error).message}`);
      throw error;
    }
  }

  async editarActividad(id: string, campos_modificados: Partial<ActividadType>): Promise<any> {
    try {
      const actividadActualizada = await Actividad.findByIdAndUpdate(id, { $set: campos_modificados }, { new: true });
      if (actividadActualizada) {
        logger.info(`Actividad actualizada: ${actividadActualizada.descripcion} (ID: ${id})`);
      }
      return actividadActualizada;
    } catch (error) {
      logger.error(`Error editando actividad ${id}: ${(error as Error).message}`);
      throw error;
    }
  }
 // --- Métodos para eliminar entidades ---
  async eliminarContacto(id: string): Promise<{ success: boolean, message: string }> {
    try {
      const contactoEliminado = await Contacto.findByIdAndDelete(id);
      if (contactoEliminado) {
        logger.info(`Contacto eliminado: ${contactoEliminado.nombre} (ID: ${id})`);
      } else {
        logger.warn(`Se intentó eliminar el contacto con ID: ${id}, pero no se encontró.`);
      }
      return { success: true, message: `Contacto eliminado exitosamente.` };
    } catch (error) {
      logger.error(`Error eliminando contacto ${id}: ${(error as Error).message}`);
      throw error;
    }
  }

  async eliminarOportunidad(id: string): Promise<{ success: boolean, message: string }> {
    try {
      const oportunidadEliminada = await Oportunidad.findByIdAndDelete(id);
      if (oportunidadEliminada) {
        logger.info(`Oportunidad eliminada: ${oportunidadEliminada.nombre} (ID: ${id})`);
      } else {
        logger.warn(`Se intentó eliminar la oportunidad con ID: ${id}, pero no se encontró.`);
      }
      return { success: true, message: `Oportunidad eliminada exitosamente.` };
    } catch (error) {
      logger.error(`Error eliminando oportunidad ${id}: ${(error as Error).message}`);
      throw error;
    }
  }

 

   



  async eliminarActividad(id: string): Promise<{ success: boolean, message: string }> {
    try {
      const actividadEliminada = await Actividad.findByIdAndDelete(id);
      if (actividadEliminada) {
        logger.info(`Actividad eliminada: ${actividadEliminada.descripcion} (ID: ${id})`);
      } else {
        logger.warn(`Se intentó eliminar la actividad con ID: ${id}, pero no se encontró.`);
      }
      return { success: true, message: `Actividad eliminada exitosamente.` };
    } catch (error) {
      logger.error(`Error eliminando actividad ${id}: ${(error as Error).message}`);
      throw error;
    }
  }

  async obtenerActividadesPorVendedor(vendedorId: string, limit: number = 50): Promise<any[]> {
    try {
      const actividades = await Actividad.find({ vendedorId: new mongoose.Types.ObjectId(vendedorId) }).sort({ fecha: -1 }).limit(limit).populate('oportunidadId');
      logger.info(`Consulta de actividades para vendedor ${vendedorId}: ${actividades.length} encontradas.`);
      return actividades;
    } catch (error) {
      logger.error(`Error obteniendo actividades por vendedor ${vendedorId}: ${(error as Error).message}`);
      throw error;
    }
  }


  // --- Métodos para Ventas Ganadas ---
  async crearVentaGanada(ventaData: Partial<VentaGanadaType>): Promise<VentaGanadaType> {
    try {
      const nuevaVenta = new VentaGanada(ventaData);
      await nuevaVenta.save();
      logger.info(`Venta ganada registrada para la oportunidad: ${nuevaVenta.oportunidadId}`);

      // Actualizar el estado de la oportunidad a 'Cerrado Ganado'
      await Oportunidad.findByIdAndUpdate(nuevaVenta.oportunidadId, {
        $set: { estado: 'Cerrado Ganado' }
      });
      logger.info(`Oportunidad ${nuevaVenta.oportunidadId} actualizada a 'Cerrado Ganado'`);

      return nuevaVenta;
    } catch (error) {
      logger.error(`Error registrando venta ganada: ${(error as Error).message}`);
      throw error;
    }
  }

  async obtenerVentasGanadasPorVendedor(vendedorId: string, limit: number = 50): Promise<VentaGanadaType[]> {
    try {
      const ventas = await VentaGanada.find({ vendedorId: new mongoose.Types.ObjectId(vendedorId) })
        .sort({ fecha: -1 })
        .limit(limit)
        .populate('oportunidadId');
      logger.info(`Consulta de ventas ganadas para vendedor ${vendedorId}: ${ventas.length} encontradas.`);
      return ventas;
    } catch (error) {
      logger.error(`Error obteniendo ventas ganadas por vendedor ${vendedorId}: ${(error as Error).message}`);
      throw error;
    }
  }

  // Report methods
  async getSalesOverTime(startDate: string, endDate: string, vendedorId?: string): Promise<any> {
    // TODO: Implement sales over time report
    logger.info(`Getting sales over time from ${startDate} to ${endDate} for vendedor ${vendedorId || 'all'}`);
    return { message: 'Not implemented yet' };
  }

  async getPipelineByStage(vendedorId?: string): Promise<any> {
    // TODO: Implement pipeline by stage report
    logger.info(`Getting pipeline by stage for vendedor ${vendedorId || 'all'}`);
    return { message: 'Not implemented yet' };
  }

  async getSalesByVendor(startDate: string, endDate: string): Promise<any> {
    // TODO: Implement sales by vendor report
    logger.info(`Getting sales by vendor from ${startDate} to ${endDate}`);
    return { message: 'Not implemented yet' };
  }

  async getRecentActivity(vendedorId?: string, limit?: string): Promise<any> {
    // TODO: Implement recent activity report
    logger.info(`Getting recent activity for vendedor ${vendedorId || 'all'} with limit ${limit || 'default'}`);
    return { message: 'Not implemented yet' };
  }

  async getEntityOverview(): Promise<any> {
    // TODO: Implement entity overview report
    logger.info('Getting entity overview');
    return { message: 'Not implemented yet' };
  }
}

const crmServiceInstance = new CRMService();
export default crmServiceInstance;