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
  PRIORITIZE: 'Priorizar',
  CONTACT: 'Acuerdo de nueva entrega',
  RESCHEDULE: 'Reprogramar',
}

export const DISPATCH_OUTCOME_LABELS: Record<DispatchOutcome, string> = {
  APPLIED: 'Aplicada',
  REJECTED: 'Rechazada',
  FAILED: 'Fallida',
}
