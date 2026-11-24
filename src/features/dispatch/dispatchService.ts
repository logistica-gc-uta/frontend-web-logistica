import { AppError } from '../../lib/errors/AppError'
import { apiClient } from '../../lib/http/apiClient'
import type {
  ConfirmIncidentReadyInput,
  DispatchAction,
  DispatchAudit,
  DispatchOutcome,
  ContactInput,
  FailedDelivery,
  IncidentActionKey,
  IncidentAllowedActions,
  IncidentEmergencyContext,
  IncidentOwnership,
  IncidentReadiness,
  IncidentStatus,
  MoveOrderInput,
  OrderPickup,
  RescheduleInput,
  ReorderStopsInput,
  UrgencyInbox,
  UrgencyProposal,
} from './types'
import type { DeclareLossInput, OrderItemLoss, RecoveryCondition } from '../losses/types'
import type { RouteEmergency, RouteEmergencyDetail } from '../emergencies/types'

/** Las decisiones se validan con bloqueos en el servidor; más de esto se considera una falla. */
const REQUEST_TIMEOUT_MS = 30_000

const INCIDENT_ACTION_KEYS: readonly IncidentActionKey[] = [
  'CONTACT',
  'CONFIRM_INCIDENT_READY',
  'RESCHEDULE',
  'PICKUP_AGREE',
  'PICKUP_DECLINE',
  'PICKUP_CONFIRM',
]

const INCIDENT_STATUSES: ReadonlySet<IncidentStatus> = new Set([
  'WAITING_STORE_READINESS',
  'CONTACTED',
  'READY_AT_STORE',
  'PENDING_PICKUP',
  'PICKED_UP',
  'EMERGENCY_CUSTODY',
  'REVIEW_WITHOUT_FAILED_ATTEMPT',
])

const INCIDENT_OWNERSHIPS: ReadonlySet<IncidentOwnership> = new Set([
  'FAILED_DELIVERY',
  'EMERGENCY_CUSTODY',
  'ADMINISTRATIVE_REVIEW',
])

/** Lo que usamos de `GET /dispatch/inbox` (la respuesta trae algunos campos más). */
interface RawInbox {
  date: string
  urgencies: UrgencyProposal[]
  incidents: {
    orderId: string
    routeId: string | null
    /** Backend #50; un backend anterior no lo envía. */
    pickup?: OrderPickup | null
    attempts: { id: string; stopId: string; failureReason: string | null; recordedAt: string }[]
    status?: unknown
    ownership?: unknown
    latestFailedAttemptId?: unknown
    readiness?: unknown
    emergencyId?: unknown
    emergency?: unknown
    activeAgreementId?: unknown
    allowedActions?: unknown
  }[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const sanitizeNullableId = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null

const sanitizeStatus = (value: unknown): IncidentStatus | undefined =>
  typeof value === 'string' && INCIDENT_STATUSES.has(value as IncidentStatus)
    ? (value as IncidentStatus)
    : undefined

const sanitizeOwnership = (value: unknown): IncidentOwnership | undefined =>
  typeof value === 'string' && INCIDENT_OWNERSHIPS.has(value as IncidentOwnership)
    ? (value as IncidentOwnership)
    : undefined

const sanitizeReadiness = (readiness: unknown): IncidentReadiness | null => {
  if (!isRecord(readiness)) return null
  const { auditId, attemptId, confirmedAt, confirmedById } = readiness
  if (
    typeof auditId !== 'string' ||
    auditId.trim() === '' ||
    typeof attemptId !== 'string' ||
    attemptId.trim() === '' ||
    typeof confirmedAt !== 'string' ||
    confirmedAt.trim() === '' ||
    typeof confirmedById !== 'string' ||
    confirmedById.trim() === ''
  ) {
    return null
  }
  return { auditId, attemptId, confirmedAt, confirmedById }
}

const sanitizeEmergency = (emergency: unknown): IncidentEmergencyContext | null => {
  if (!isRecord(emergency)) return null
  const { emergencyId, routeId, recoveryResolved, pendingUnitsCount, totalUnitsCount } = emergency
  if (
    typeof emergencyId !== 'string' ||
    emergencyId.trim() === '' ||
    typeof routeId !== 'string' ||
    routeId.trim() === ''
  ) {
    return null
  }
  return {
    emergencyId,
    routeId,
    recoveryResolved: recoveryResolved === true,
    pendingUnitsCount:
      typeof pendingUnitsCount === 'number' && Number.isFinite(pendingUnitsCount)
        ? pendingUnitsCount
        : 0,
    totalUnitsCount:
      typeof totalUnitsCount === 'number' && Number.isFinite(totalUnitsCount) ? totalUnitsCount : 0,
  }
}

const sanitizeAllowedActions = (raw: unknown): IncidentAllowedActions => {
  if (!isRecord(raw)) return {}
  const sanitized: IncidentAllowedActions = {}
  for (const key of INCIDENT_ACTION_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue
    const gate = raw[key]
    if (!isRecord(gate)) continue
    sanitized[key] = {
      allowed: gate.allowed === true,
      reasonCode: typeof gate.reasonCode === 'string' ? gate.reasonCode : null,
      reason: typeof gate.reason === 'string' ? gate.reason : null,
    }
  }
  return sanitized
}

const sanitizePickup = (pickup: unknown): OrderPickup | null => {
  if (!isRecord(pickup)) return null
  if (
    (pickup.state !== 'PENDING_PICKUP' && pickup.state !== 'PICKED_UP') ||
    typeof pickup.agreedAt !== 'string'
  ) {
    return null
  }
  return {
    state: pickup.state,
    agreedAt: pickup.agreedAt,
    pickedUpAt: typeof pickup.pickedUpAt === 'string' ? pickup.pickedUpAt : null,
  }
}

const toFailedDelivery = ({
  orderId,
  routeId,
  pickup,
  attempts,
  status,
  ownership,
  latestFailedAttemptId,
  readiness,
  emergencyId,
  emergency,
  activeAgreementId,
  allowedActions,
}: RawInbox['incidents'][number]): FailedDelivery => {
  const hasRawModernMetadata =
    status !== undefined ||
    ownership !== undefined ||
    latestFailedAttemptId !== undefined ||
    readiness !== undefined ||
    emergencyId !== undefined ||
    emergency !== undefined ||
    activeAgreementId !== undefined ||
    allowedActions !== undefined

  const sanitizedStatus = sanitizeStatus(status)
  const sanitizedOwnership = sanitizeOwnership(ownership)
  const hasSurvivingModernField =
    sanitizedStatus !== undefined ||
    sanitizedOwnership !== undefined ||
    latestFailedAttemptId !== undefined ||
    readiness !== undefined ||
    emergencyId !== undefined ||
    emergency !== undefined ||
    activeAgreementId !== undefined ||
    allowedActions !== undefined

  return {
    orderId,
    routeId,
    pickup: sanitizePickup(pickup),
    attempts: (Array.isArray(attempts) ? attempts : [])
      .map(({ id, stopId, failureReason, recordedAt }) => ({
        id,
        stopId,
        failureReason,
        recordedAt,
      }))
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
    ...(sanitizedStatus !== undefined ? { status: sanitizedStatus } : {}),
    ...(sanitizedOwnership !== undefined ? { ownership: sanitizedOwnership } : {}),
    ...(latestFailedAttemptId !== undefined
      ? { latestFailedAttemptId: sanitizeNullableId(latestFailedAttemptId) }
      : {}),
    ...(readiness !== undefined ? { readiness: sanitizeReadiness(readiness) } : {}),
    ...(emergencyId !== undefined ? { emergencyId: sanitizeNullableId(emergencyId) } : {}),
    ...(emergency !== undefined ? { emergency: sanitizeEmergency(emergency) } : {}),
    ...(activeAgreementId !== undefined
      ? { activeAgreementId: sanitizeNullableId(activeAgreementId) }
      : {}),
    ...(allowedActions !== undefined
      ? { allowedActions: sanitizeAllowedActions(allowedActions) }
      : hasRawModernMetadata && !hasSurvivingModernField
        ? { allowedActions: {} }
        : {}),
  }
}

const toProposal = ({
  orderId,
  kind,
  routeId,
  zoneId,
  orderIds,
  availableDriverIds,
  reasons,
  totalDistanceKm,
  distanceMethod,
  fingerprint,
}: UrgencyProposal): UrgencyProposal => ({
  orderId,
  kind,
  routeId,
  zoneId,
  orderIds,
  availableDriverIds,
  reasons,
  totalDistanceKm,
  ...(distanceMethod && { distanceMethod }),
  fingerprint,
})

/**
 * Decisión administrativa auditada. Cada intento lleva un `requestId` nuevo: el backend lo usa
 * para no aplicar dos veces la misma petición. Si el resultado no es el esperado para la acción
 * (`REJECTED` para un rechazo, `APPLIED` para lo demás), no se toma como éxito.
 */
async function intervene(
  action: DispatchAction,
  fields: Record<string, unknown>,
): Promise<DispatchAudit> {
  const expected: DispatchOutcome = action === 'REJECT' ? 'REJECTED' : 'APPLIED'
  const { data } = await apiClient.post<DispatchAudit>(
    '/dispatch/interventions',
    { requestId: crypto.randomUUID(), action, ...fields },
    { timeout: REQUEST_TIMEOUT_MS },
  )
  if (data.outcome !== expected) {
    throw new AppError('El servidor no aplicó la decisión. Revisa la lista actualizada.')
  }
  return data
}

export const dispatchService = {
  /** Urgencias de hoy por despachar, cada una con su propuesta temporal (solo lectura). */
  async inbox(): Promise<UrgencyInbox> {
    const { data } = await apiClient.get<RawInbox>('/dispatch/inbox', {
      timeout: REQUEST_TIMEOUT_MS,
    })
    return {
      date: data.date,
      urgencies: data.urgencies.map(toProposal),
      failedDeliveries: data.incidents.map(toFailedDelivery),
    }
  },

  /** Decisiones registradas, la más reciente primero. */
  async audit(): Promise<DispatchAudit[]> {
    const { data } = await apiClient.get<DispatchAudit[]>('/dispatch/audit')
    return data.map(({ id, action, outcome, actorId, orderId, routeId, reason, recordedAt }) => ({
      id,
      action,
      outcome,
      actorId,
      orderId,
      routeId,
      reason,
      recordedAt,
    }))
  },

  /** Acepta la propuesta: inserta en la ruta o crea una salida nueva con `driverId` (`CONFIRM`). */
  confirm: (proposal: UrgencyProposal, reason: string, driverId?: string) =>
    intervene('CONFIRM', {
      orderId: proposal.orderId,
      fingerprint: proposal.fingerprint,
      reason,
      ...(proposal.kind === 'NEW_ROUTE' ? { driverId } : {}),
    }),

  /** Rechaza la propuesta: el pedido sigue PENDING y la ruta no cambia (`REJECT`). */
  reject: (proposal: UrgencyProposal, reason: string) =>
    intervene('REJECT', { orderId: proposal.orderId, fingerprint: proposal.fingerprint, reason }),

  /** Sube el pedido al principio de la bandeja sin cambiar su estado comercial (`PRIORITIZE`). */
  prioritize: (orderId: string, reason: string) => intervene('PRIORITIZE', { orderId, reason }),

  /**
   * Registra la gestión de contacto con el destinatario (`CONTACT`). Con acuerdo exige fecha y franja
   * futuras; sin acuerdo solo deja constancia. El id del registro es el acuerdo para reprogramar.
   */
  recordContact: ({ orderId, attemptId, agreement, reason }: ContactInput) =>
    intervene('CONTACT', {
      orderId,
      ...(attemptId ? { attemptId } : {}),
      agreementConfirmed: agreement !== null,
      reason,
      ...(agreement ?? {}),
    }),

  /** Reprograma el pedido con un acuerdo ya registrado (`RESCHEDULE`); vuelve a quedar PENDING. */
  rescheduleWithAgreement: (orderId: string, agreementId: string, reason: string) =>
    intervene('RESCHEDULE', { orderId, agreementId, reason }),

  /**
   * Reprograma un pedido urgente: primero registra el acuerdo de fecha y franja (`CONTACT`) y
   * luego reprograma con ese acuerdo (`RESCHEDULE`). Ambos pasos quedan auditados.
   */
  async reschedule({ orderId, reason, ...agreement }: RescheduleInput): Promise<DispatchAudit> {
    const contact = await dispatchService.recordContact({ orderId, agreement, reason })
    return dispatchService.rescheduleWithAgreement(orderId, contact.id, reason)
  },

  /** Cambia el chofer de una ruta ASSIGNED todavía no iniciada (`REASSIGN_DRIVER`). */
  reassignDriver: (routeId: string, driverId: string, reason: string) =>
    intervene('REASSIGN_DRIVER', { routeId, driverId, reason }),

  /** Cambia el orden de visita de una ruta DRAFT o ASSIGNED (`REORDER`). */
  reorderStops: ({ routeId, orderIds, reason }: ReorderStopsInput) =>
    intervene('REORDER', { routeId, orderIds, reason }),

  /** Pasa un pedido a otra ruta no iniciada del mismo día y zona (`MOVE`). */
  moveOrder: ({ routeId, orderId, targetRouteId, reason }: MoveOrderInput) =>
    intervene('MOVE', { routeId, orderId, targetRouteId, reason }),

  /**
   * Libera un borrador sin chofer (`RELEASE_DRAFT`, backend #49): quita sus paradas y devuelve sus
   * pedidos a pendientes para replanificarlos hoy. Queda auditado.
   */
  releaseDraft: (routeId: string, reason: string) =>
    intervene('RELEASE_DRAFT', { routeId, reason }),

  /**
   * Cancela una ruta asignada antes de iniciar (`CANCEL_ROUTE`): la ruta pasa a CANCELLED, sus
   * pedidos vuelven a pendientes sin cancelarse comercialmente y el chofer queda libre.
   */
  cancelRoute: (routeId: string, reason: string) =>
    intervene('CANCEL_ROUTE', { routeId, reason: reason.trim() }),

  /**
   * Confirma explícitamente que el pedido devuelto o un reemplazo está disponible físicamente en
   * tienda para el último intento fallido (`CONFIRM_INCIDENT_READY`). No replanifica automáticamente.
   */
  confirmIncidentReady: ({ orderId, attemptId, reason }: ConfirmIncidentReadyInput) =>
    intervene('CONFIRM_INCIDENT_READY', {
      orderId,
      attemptId,
      reason: reason.trim(),
    }),

  /**
   * Retiro en tienda (backend #50). El acuerdo deja el pedido pendiente de retiro sin crear ruta y no
   * es una entrega; tras una entrega fallida debe referirse al último intento (`attemptId`).
   */
  agreePickup: ({ orderId, attemptId, reason }: PickupInput) =>
    intervene('PICKUP_AGREE', { orderId, ...(attemptId ? { attemptId } : {}), reason }),

  /** El cliente no acepta retirar: solo se audita y el pedido sigue pendiente de gestión. */
  declinePickup: ({ orderId, attemptId, reason }: PickupInput) =>
    intervene('PICKUP_DECLINE', { orderId, ...(attemptId ? { attemptId } : {}), reason }),

  /** Retiro físico confirmado: es lo único que entrega el pedido (pasa a DELIVERED). */
  confirmPickup: (orderId: string, reason: string) =>
    intervene('PICKUP_CONFIRM', { orderId, reason }),

  /** Pérdidas del pedido con su reemplazo, el original y los movimientos de stock (backend #52). */
  async losses(orderId: string): Promise<OrderItemLoss[]> {
    const { data } = await apiClient.get<OrderItemLoss[]>(
      `/dispatch/orders/${encodeURIComponent(orderId)}/losses`,
    )
    return data
  },

  /**
   * Declara la pérdida de una unidad. Con stock libre el servidor descuenta una unidad y deja el
   * reemplazo preparado; sin stock queda pendiente. No crea otra compra ni otro comprobante.
   */
  declareLoss: ({ orderId, orderItemId, unitNumber, attemptId, emergencyId, reason }: DeclareLossInput) =>
    intervene('LOSS_DECLARE', {
      orderId,
      orderItemId,
      ...(unitNumber !== undefined ? { unitNumber } : {}),
      ...(attemptId ? { attemptId } : {}),
      ...(emergencyId ? { emergencyId } : {}),
      reason,
    }),

  /** Prepara el reemplazo de una pérdida pendiente cuando ya hay stock (si no, 409 `NO_FREE_STOCK`). */
  prepareReplacement: (lossId: string, reason: string) =>
    intervene('REPLACEMENT_PREPARE', { lossId, reason }),

  /** El original apareció: vendible vuelve al stock una sola vez; dañado no suma. */
  recoverOriginal: (lossId: string, recoveryCondition: RecoveryCondition, reason: string) =>
    intervene('ORIGINAL_RECOVER', { lossId, recoveryCondition, reason }),

  /**
   * Anula una pérdida declarada por error (backend #51). Si su reemplazo estaba preparado, el
   * servidor devuelve esa unidad al stock (`REPLACEMENT_CANCEL_IN`).
   */
  cancelLoss: (lossId: string, reason: string) => intervene('LOSS_CANCEL', { lossId, reason }),

  /** Emergencias declaradas, con sus conteos y las unidades pendientes (backend #51). */
  async emergencies(): Promise<RouteEmergency[]> {
    const { data } = await apiClient.get<RouteEmergency[]>('/dispatch/emergencies')
    return data
  },

  /** Emergencia de una ruta con todas sus unidades. */
  async routeEmergency(routeId: string): Promise<RouteEmergencyDetail> {
    const { data } = await apiClient.get<RouteEmergencyDetail>(
      `/dispatch/routes/${encodeURIComponent(routeId)}/emergency`,
    )
    return data
  },

  /**
   * Interrumpe una ruta en curso: lo entregado y lo fallido se conservan; los pedidos pendientes
   * salen de la ruta y sus unidades quedan en custodia hasta confirmar su retorno.
   */
  declareEmergency: (routeId: string, reason: string) =>
    intervene('EMERGENCY_DECLARE', { routeId, reason }),

  /** Confirma el retorno físico de UNA unidad. No toca el stock ni otros pedidos. */
  confirmUnitRecovery: (recoveryId: string, reason: string) =>
    intervene('UNIT_RECOVERY_CONFIRM', { recoveryId, reason }),

  /** Cierra el incidente. Las unidades pendientes siguen visibles y sus pedidos, bloqueados. */
  closeEmergency: (routeId: string, reason: string) =>
    intervene('EMERGENCY_CLOSE', { routeId, reason }),

  /** Confirma el retorno del repartidor: independiente de recuperar productos y de cerrar. */
  releaseEmergencyDriver: (routeId: string, reason: string) =>
    intervene('EMERGENCY_DRIVER_RELEASE', { routeId, reason }),

  /** Habilita un pedido de una emergencia para planificar cuando todas sus unidades están resueltas. */
  requeueOrder: (orderId: string, emergencyId: string, reason: string) =>
    intervene('EMERGENCY_REQUEUE', { orderId, emergencyId, reason }),
}

export interface PickupInput {
  orderId: string
  /** Último intento fallido, si el pedido viene de una entrega fallida. */
  attemptId?: string
  reason: string
}
