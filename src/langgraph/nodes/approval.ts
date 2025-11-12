import logger from '../../utils/logger';

interface WorkflowState {
  userMessage: string;
  vendedor: any;
  history: any;
  intent: 'COMANDO_CRM' | 'CONVERSACION_GENERAL' | null;
  knowledge: any[];
  plan: any[];
  requiresApproval: boolean;
  approvalMessage: string;
  executionResults: any[];
  response: string;
}

export async function approvalNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
  const { requiresApproval, approvalMessage } = state;

  if (!requiresApproval) {
    return { response: '' };
  }

  // Si requiere aprobación, devolver el mensaje de aprobación
  logger.info('Approval required, returning approval message');
  return {
    response: approvalMessage || 'Se requiere tu aprobación para continuar con esta acción. ¿Confirmas?'
  };
}