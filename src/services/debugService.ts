import logger from '../utils/logger';
import Empresa from '../models/empresaModel.js';

interface EmpresaQuery {
  nombre: string;
  vendedorId: string;
}

const buscarEmpresasPorNombre = async (query: EmpresaQuery, limit: number = 5): Promise<any[]> => {
  const { nombre, vendedorId } = query;

  try {
    const empresas = await Empresa.find({
      nombre: new RegExp(nombre, 'i'),
      vendedorId: vendedorId
    }).limit(limit);
    logger.info(`Consulta de empresas por nombre "${nombre}" para vendedor ${vendedorId}: ${empresas.length} encontradas.`);
    return empresas;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Error obteniendo empresas por nombre ${nombre}: ${message}`);
    throw new Error('Error interno del servidor');
  }
};

export { buscarEmpresasPorNombre };