import { DynamicTool } from "@langchain/core/tools";
import crmService from "./crmService.js";
import * as calendarService from "./calendarService.js";

const tools = [
  new DynamicTool({
    name: "crear_empresa",
    description: "Crea una nueva entidad de empresa en el CRM. Útil cuando un usuario quiere registrar un nuevo cliente o compañía. Necesita el nombre de la empresa.",
    func: async (input: string) => {
      const args = JSON.parse(input);
      const result = await crmService.crearEmpresa(args);
      return JSON.stringify(result);
    },
  }),
  new DynamicTool({
    name: "buscar_empresa_por_nombre",
    description: "Busca una empresa por su nombre.",
    func: async (input: string) => {
      const args = JSON.parse(input);
      const result = await crmService.buscarEmpresasPorNombre(args.nombre, args.vendedorId);
      return JSON.stringify(result);
    },
  }),
  new DynamicTool({
    name: "actualizar_empresa",
    description: "Actualiza los datos de una empresa existente.",
    func: async (input: string) => {
      const args = JSON.parse(input);
      const result = await crmService.editarEmpresa(args.id, args.campos_modificados);
      return JSON.stringify(result);
    },
  }),
    new DynamicTool({
    name: "listar_empresas",
    description: "Lista todas las empresas de un vendedor.",
    func: async (input: string) => {
      const args = JSON.parse(input);
      const result = await crmService.obtenerEmpresasPorVendedor(args.vendedorId);
      return JSON.stringify(result);
    },
  }),
  new DynamicTool({
    name: "crear_contacto",
    description: "Crea un nuevo contacto en el CRM.",
    func: async (input: string) => {
      const args = JSON.parse(input);
      const result = await crmService.crearContacto(args);
      return JSON.stringify(result);
    },
  }),
  new DynamicTool({
    name: "buscar_contacto_por_nombre",
    description: "Busca un contacto por su nombre.",
    func: async (input: string) => {
      const args = JSON.parse(input);
      const result = await crmService.buscarContactosPorNombre(args.nombre, args.vendedorId);
      return JSON.stringify(result);
    },
  }),
  new DynamicTool({
    name: "buscar_contacto_por_id",
    description: "Busca un contacto por su ID.",
    func: async (input: string) => {
      const args = JSON.parse(input);
      const result = await crmService.buscarContactoPorId(args.id);
      return JSON.stringify(result);
    },
  }),
  new DynamicTool({
    name: "actualizar_contacto",
    description: "Actualiza los datos de un contacto existente.",
    func: async (input: string) => {
      const args = JSON.parse(input);
      const result = await crmService.editarContacto(args.id, args.campos_modificados);
      return JSON.stringify(result);
    },
  }),
  new DynamicTool({
    name: "listar_contactos",
    description: "Lista todos los contactos de un vendedor.",
    func: async (input: string) => {
      const args = JSON.parse(input);
      const result = await crmService.obtenerContactosPorVendedor(args.vendedorId);
      return JSON.stringify(result);
    },
  }),
  new DynamicTool({
    name: "crear_oportunidad",
    description: "Crea una nueva oportunidad de venta en el CRM.",
    func: async (input: string) => {
      const args = JSON.parse(input);
      const result = await crmService.crearOportunidad(args);
      return JSON.stringify(result);
    },
  }),
  new DynamicTool({
    name: "buscar_oportunidad_por_nombre",
    description: "Busca una oportunidad por su nombre.",
    func: async (input: string) => {
      const args = JSON.parse(input);
      const result = await crmService.buscar_oportunidad_por_nombre(args.nombre, args.vendedorId);
      return JSON.stringify(result);
    },
  }),
  new DynamicTool({
    name: "buscar_oportunidades_por_empresa",
    description: "Busca todas las oportunidades activas para una empresa específica.",
    func: async (input: string) => {
      const args = JSON.parse(input);
      const result = await crmService.buscarOportunidadesPorEmpresa(args.empresaId);
      return JSON.stringify(result);
    },
  }),
  new DynamicTool({
    name: "actualizar_oportunidad",
    description: "Actualiza los datos de una oportunidad existente.",
    func: async (input: string) => {
      const args = JSON.parse(input);
      const result = await crmService.actualizarOportunidad(args.id, args.campos_modificados);
      return JSON.stringify(result);
    },
  }),
    new DynamicTool({
    name: "listar_oportunidades",
    description: "Lista todas las oportunidades de un vendedor.",
    func: async (input: string) => {
      const args = JSON.parse(input);
      const result = await crmService.obtenerOportunidadesPorVendedor(args.vendedorId);
      return JSON.stringify(result);
    },
  }),
  new DynamicTool({
    name: "crear_actividad",
    description: "Crea una nueva actividad en el CRM.",
    func: async (input: string) => {
      const args = JSON.parse(input);
      const result = await crmService.crear_actividad(args);
      return JSON.stringify(result);
    },
  }),
  new DynamicTool({
    name: "buscar_actividad_por_descripcion",
    description: "Busca una actividad por su descripción. Opcionalmente puede filtrar por el ID de la oportunidad.",
    func: async (input: string) => {
      const args = JSON.parse(input);
      const result = await crmService.buscarActividadesPorDescripcion(args.descripcion, args.vendedorId, args.oportunidadId);
      return JSON.stringify(result);
    },
  }),
  new DynamicTool({
    name: "crear_producto",
    description: "Crea un nuevo producto en el sistema.",
    func: async (input: string) => {
      const args = JSON.parse(input);
      const result = await crmService.crearProducto(args);
      return JSON.stringify(result);
    },
  }),
  new DynamicTool({
    name: "buscar_producto_por_nombre",
    description: "Busca un producto por su nombre.",
    func: async (input: string) => {
      const args = JSON.parse(input);
      const result = await crmService.buscarProductosPorNombre(args.nombre, args.vendedorId);
      return JSON.stringify(result);
    },
  }),
  new DynamicTool({
    name: "actualizar_producto",
    description: "Actualiza los datos de un producto existente.",
    func: async (input: string) => {
      const args = JSON.parse(input);
      const result = await crmService.actualizarProducto(args.id, args.campos_modificados);
      return JSON.stringify(result);
    },
  }),
  new DynamicTool({
    name: "crear_venta_ganada",
    description: "Registra una nueva venta ganada en el CRM. Necesita el ID de la oportunidad, el valor y el ID del vendedor.",
    func: async (input: string) => {
      const args = JSON.parse(input);
      const result = await crmService.crearVentaGanada(args);
      return JSON.stringify(result);
    },
  }),
  new DynamicTool({
    name: "listar_ventas_ganadas",
    description: "Lista todas las ventas ganadas de un vendedor.",
    func: async (input: string) => {
      const args = JSON.parse(input);
      const result = await crmService.obtenerVentasGanadasPorVendedor(args.vendedorId);
      return JSON.stringify(result);
    },
  }),
  new DynamicTool({
    name: "consultar_calendario",
    description: "Consulta los eventos del calendario de un vendedor para un rango de fechas. Por defecto, consulta los eventos de hoy.",
    func: async (input: string) => {
      const args = JSON.parse(input);
      const timeMin = args.timeMin || new Date().toISOString();
      const timeMax = args.timeMax || new Date(new Date().setDate(new Date().getDate() + 1)).toISOString();
      const result = await calendarService.listEvents(args.vendedorId, timeMin, timeMax);
      return JSON.stringify(result);
    },
  }),
];

export { tools };

export function executeTool(toolName: string, args: any) {
  const tool = tools.find(t => t.name === toolName);
  if (!tool) {
    throw new Error(`Tool ${toolName} not found`);
  }
  return tool.func(JSON.stringify(args));
}