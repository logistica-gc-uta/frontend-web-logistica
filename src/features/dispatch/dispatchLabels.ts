import type { DispatchAction, DispatchOutcome, UrgencyKind } from './types'

export const URGENCY_KIND_LABELS: Record<UrgencyKind, string> = {
  INSERT: 'Insertar en una ruta',
  NEW_ROUTE: 'Salida nueva',
  BLOCKED: 'Bloqueado',
}

export const DISPATCH_ACTION_LABELS: Record<DispatchAction, string> = {
  CONFIRM: 'Confirmar propuesta',
  REJECT: 'Rechazar propuesta',
  REORDER: 'Reordenar paradas',
  MOVE: 'Mover pedido de ruta',
  REASSIGN_DRIVER: 'Cambiar chofer',
  RELEASE_DRAFT: 'Liberar borrador vencido',
  PICKUP_AGREE: 'Acuerdo de retiro en tienda',
  PICKUP_DECLINE: 'El cliente no aceptó retirar',
  PICKUP_CONFIRM: 'Retiro en tienda confirmado',
  LOSS_DECLARE: 'Pérdida declarada',
  REPLACEMENT_PREPARE: 'Reemplazo preparado',
  ORIGINAL_RECOVER: 'Original recuperado',
  PRIORITIZE: 'Priorizar',
  CONTACT: 'Contacto con el destinatario',
  RESCHEDULE: 'Reprogramar',
}

export const DISPATCH_OUTCOME_LABELS: Record<DispatchOutcome, string> = {
  APPLIED: 'Aplicada',
  REJECTED: 'Rechazada',
  FAILED: 'Fallida',
}
