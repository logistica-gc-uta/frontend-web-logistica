import { AppError } from '../../lib/errors/AppError'
import { apiClient } from '../../lib/http/apiClient'
import type {
  DispatchAction,
  DispatchAudit,
  DispatchOutcome,
  ContactInput,
  FailedDelivery,
  MoveOrderInput,
  RescheduleInput,
  ReorderStopsInput,
  UrgencyInbox,
  UrgencyProposal,
} from './types'

/** Las decisiones se validan con bloqueos en el servidor; más de esto se considera una falla. */
const REQUEST_TIMEOUT_MS = 30_000

/** Lo que usamos de `GET /dispatch/inbox` (la respuesta trae algunos campos más). */
interface RawInbox {
  date: string
  urgencies: UrgencyProposal[]
  incidents: {
    orderId: string
    routeId: string | null
    attempts: { id: string; stopId: string; failureReason: string | null; recordedAt: string }[]
  }[]
}

const toFailedDelivery = ({
  orderId,
  routeId,
  attempts,
}: RawInbox['incidents'][number]): FailedDelivery => ({
  orderId,
  routeId,
  attempts: attempts
    .map(({ id, stopId, failureReason, recordedAt }) => ({ id, stopId, failureReason, recordedAt }))
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
})

const toProposal = ({
  orderId,
  kind,
  routeId,
  zoneId,
  orderIds,
  availableDriverIds,
  reasons,
  totalDistanceKm,
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
}
