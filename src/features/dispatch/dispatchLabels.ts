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
  LOSS_CANCEL: 'Pérdida anulada',
  EMERGENCY_DECLARE: 'Emergencia declarada',
  UNIT_RECOVERY_CONFIRM: 'Retorno de unidad confirmado',
  EMERGENCY_CLOSE: 'Emergencia cerrada',
  EMERGENCY_DRIVER_RELEASE: 'Repartidor liberado',
  EMERGENCY_REQUEUE: 'Pedido habilitado para planificar',
  PRIORITIZE: 'Priorizar',
  CONTACT: 'Contacto con el destinatario',
  RESCHEDULE: 'Reprogramar',
}

export const DISPATCH_OUTCOME_LABELS: Record<DispatchOutcome, string> = {
  APPLIED: 'Aplicada',
  REJECTED: 'Rechazada',
  FAILED: 'Fallida',
}
