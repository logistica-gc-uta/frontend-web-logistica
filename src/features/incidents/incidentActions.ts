import type { DeliveryAgreement, IncidentActionGate, IncidentActionKey } from '../dispatch/types'
import type { IncidentView } from './incidentsBoard'

/** Sin acuerdo no se pide motivo: el registro lleva este texto fijo. */
export const NO_AGREEMENT_REASON = 'No se logró acordar con el destinatario'

/** Acuerdo registrado en esta sesión o reconocido por el servidor: su id permite reprogramar. */
export interface RegisteredAgreement {
  id: string
  /** La franja solo se conoce si el acuerdo se registró en esta sesión; después queda el motivo. */
  window?: DeliveryAgreement
  reason: string
  /** Cuándo se registró (solo en los acuerdos leídos de las gestiones guardadas). */
  recordedAt?: string
}

export interface ResolvedIncidentAction extends IncidentActionGate {
  fromServer: boolean
}

export interface ResolvedIncidentState {
  usesServerContract: boolean
  isEmergencyCustody: boolean
  awaitingPickup: boolean
  isPickedUp: boolean
  canonicalAttemptId: string | undefined
  agreement: RegisteredAgreement | undefined
  hasContact: boolean
  routeCompleted: boolean
  actions: Record<IncidentActionKey, ResolvedIncidentAction>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const nonEmptyId = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined

const DENIED_SERVER_GATE: ResolvedIncidentAction = {
  allowed: false,
  reasonCode: null,
  reason: null,
  fromServer: true,
}

const serverGate = (allowedActions: unknown, action: IncidentActionKey): ResolvedIncidentAction => {
  if (!isRecord(allowedActions) || !Object.prototype.hasOwnProperty.call(allowedActions, action)) {
    return { ...DENIED_SERVER_GATE }
  }
  const gate = allowedActions[action]
  if (!isRecord(gate)) {
    return { ...DENIED_SERVER_GATE }
  }
  return {
    allowed: gate.allowed === true,
    reasonCode: typeof gate.reasonCode === 'string' ? gate.reasonCode : null,
    reason: typeof gate.reason === 'string' ? gate.reason : null,
    fromServer: true,
  }
}

const requireAuthoritativeId = (
  gate: ResolvedIncidentAction,
  id: string | undefined,
): ResolvedIncidentAction => (gate.allowed && !id ? { ...DENIED_SERVER_GATE } : gate)

const legacyGate = (allowed: boolean): ResolvedIncidentAction => ({
  allowed,
  reasonCode: null,
  reason: null,
  fromServer: false,
})

const hasServerMetadata = (incident: IncidentView): boolean =>
  incident.status !== undefined ||
  incident.ownership !== undefined ||
  incident.latestFailedAttemptId !== undefined ||
  incident.readiness !== undefined ||
  incident.emergencyId !== undefined ||
  incident.emergency !== undefined ||
  incident.activeAgreementId !== undefined ||
  incident.allowedActions !== undefined

/**
 * Resuelve el estado operativo y las compuertas de acción de un incidente.
 * Prioriza los valores provistos por el servidor (incluido `null` explícito) y conserva el
 * comportamiento heredado solo cuando toda la metadata nueva del servidor está ausente.
 */
export function resolveIncidentState(
  incident: IncidentView,
  sessionAgreement: RegisteredAgreement | undefined,
): ResolvedIncidentState {
  const usesServerContract = hasServerMetadata(incident)
  const isEmergencyCustody =
    incident.ownership !== undefined
      ? incident.ownership === 'EMERGENCY_CUSTODY'
      : incident.status !== undefined
        ? incident.status === 'EMERGENCY_CUSTODY'
        : Boolean(nonEmptyId(incident.emergencyId) ?? nonEmptyId(incident.emergency?.emergencyId))

  const awaitingPickup =
    incident.status === 'PENDING_PICKUP' || incident.pickup?.state === 'PENDING_PICKUP'
  const isPickedUp = incident.status === 'PICKED_UP' || incident.pickup?.state === 'PICKED_UP'

  const canonicalAttemptId = usesServerContract
    ? nonEmptyId(incident.latestFailedAttemptId)
    : incident.latestAttempt?.id

  const lastContact = incident.management.find((record) => record.action === 'CONTACT')
  const hasContact = lastContact !== undefined
  const routeCompleted =
    incident.originalRoute?.status === 'COMPLETED' ||
    incident.originalRoute?.status === 'INTERRUPTED'

  let agreement: RegisteredAgreement | undefined
  if (usesServerContract) {
    const serverAgreementId = nonEmptyId(incident.activeAgreementId)
    if (!serverAgreementId) {
      agreement = undefined
    } else if (sessionAgreement?.id === serverAgreementId) {
      agreement = sessionAgreement
    } else {
      const matched = incident.management.find((record) => record.id === serverAgreementId)
      agreement = matched
        ? { id: matched.id, reason: matched.reason, recordedAt: matched.recordedAt }
        : { id: serverAgreementId, reason: 'Reprogramación según acuerdo vigente' }
    }
  } else {
    const storedAgreement: RegisteredAgreement | undefined =
      lastContact && lastContact.reason !== NO_AGREEMENT_REASON
        ? { id: lastContact.id, reason: lastContact.reason, recordedAt: lastContact.recordedAt }
        : undefined
    agreement = sessionAgreement ?? storedAgreement
  }

  const actions: Record<IncidentActionKey, ResolvedIncidentAction> = usesServerContract
    ? {
        CONTACT: requireAuthoritativeId(
          serverGate(incident.allowedActions, 'CONTACT'),
          canonicalAttemptId,
        ),
        CONFIRM_INCIDENT_READY: requireAuthoritativeId(
          serverGate(incident.allowedActions, 'CONFIRM_INCIDENT_READY'),
          canonicalAttemptId,
        ),
        RESCHEDULE: requireAuthoritativeId(
          serverGate(incident.allowedActions, 'RESCHEDULE'),
          agreement?.id,
        ),
        PICKUP_AGREE: requireAuthoritativeId(
          serverGate(incident.allowedActions, 'PICKUP_AGREE'),
          canonicalAttemptId,
        ),
        PICKUP_DECLINE: requireAuthoritativeId(
          serverGate(incident.allowedActions, 'PICKUP_DECLINE'),
          canonicalAttemptId,
        ),
        PICKUP_CONFIRM: serverGate(incident.allowedActions, 'PICKUP_CONFIRM'),
      }
    : {
        CONTACT: legacyGate(!isEmergencyCustody && !awaitingPickup && !isPickedUp),
        CONFIRM_INCIDENT_READY: legacyGate(false),
        RESCHEDULE: legacyGate(
          !isEmergencyCustody && !awaitingPickup && !isPickedUp && Boolean(agreement) && routeCompleted,
        ),
        PICKUP_AGREE: legacyGate(
          !isEmergencyCustody && !awaitingPickup && !isPickedUp && hasContact && routeCompleted,
        ),
        PICKUP_DECLINE: legacyGate(
          !isEmergencyCustody && !awaitingPickup && !isPickedUp && hasContact && routeCompleted,
        ),
        PICKUP_CONFIRM: legacyGate(!isEmergencyCustody && awaitingPickup),
      }

  return {
    usesServerContract,
    isEmergencyCustody,
    awaitingPickup,
    isPickedUp,
    canonicalAttemptId,
    agreement,
    hasContact,
    routeCompleted,
    actions,
  }
}
