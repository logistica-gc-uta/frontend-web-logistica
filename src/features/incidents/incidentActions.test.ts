import { describe, expect, it } from 'vitest'
import { auditRecord } from '../../test/dispatchFixtures'
import { guestOrder } from '../../test/fixtures'
import { monitorRoute, stopWith } from '../../test/monitorFixtures'
import type { IncidentAllowedActions } from '../dispatch/types'
import { resolveIncidentState } from './incidentActions'
import type { IncidentView } from './incidentsBoard'

const ORDER = { ...guestOrder, id: 'f1', status: 'IN_TRANSIT' as const }
const FAILED_STOP = { ...stopWith(1, 'FAILED', 'RECIPIENT_ABSENT'), id: 'stop-f1', orderId: 'f1' }
const COMPLETED_ROUTE = monitorRoute({ id: 'r1', status: 'COMPLETED', stops: [FAILED_STOP] })
const IN_PROGRESS_ROUTE = monitorRoute({ id: 'r1', status: 'IN_PROGRESS', stops: [FAILED_STOP] })
const INTERRUPTED_ROUTE = monitorRoute({ id: 'r1', status: 'INTERRUPTED', stops: [FAILED_STOP] })
const ATTEMPT = {
  id: 'a1',
  stopId: 'stop-f1',
  failureReason: 'RECIPIENT_ABSENT',
  recordedAt: '2030-02-14T16:00:00Z',
}

const ALL_DENIED: IncidentAllowedActions = {
  CONTACT: { allowed: false, reasonCode: 'EMERGENCY_CUSTODY_SEPARATE', reason: 'Emergency' },
  CONFIRM_INCIDENT_READY: {
    allowed: false,
    reasonCode: 'EMERGENCY_CUSTODY_SEPARATE',
    reason: 'Emergency',
  },
  RESCHEDULE: { allowed: false, reasonCode: 'EMERGENCY_CUSTODY_SEPARATE', reason: 'Emergency' },
  PICKUP_AGREE: { allowed: false, reasonCode: 'EMERGENCY_CUSTODY_SEPARATE', reason: 'Emergency' },
  PICKUP_DECLINE: { allowed: false, reasonCode: 'EMERGENCY_CUSTODY_SEPARATE', reason: 'Emergency' },
  PICKUP_CONFIRM: { allowed: false, reasonCode: 'PICKUP_NOT_AGREED', reason: 'No pickup' },
}

const makeView = (overrides: Partial<IncidentView> = {}): IncidentView => ({
  orderId: 'f1',
  order: ORDER,
  latestAttempt: ATTEMPT,
  originalRoute: COMPLETED_ROUTE,
  visits: [{ route: COMPLETED_ROUTE, stop: FAILED_STOP }],
  management: [],
  pickup: null,
  ...overrides,
})

describe('resolveIncidentState', () => {
  it('conserva el comportamiento heredado cuando no hay metadatos nuevos del servidor', () => {
    const state = resolveIncidentState(
      makeView({
        originalRoute: IN_PROGRESS_ROUTE,
        management: [auditRecord({ id: 'c1', action: 'CONTACT', orderId: 'f1', reason: 'Acordó' })],
      }),
      undefined,
    )

    expect(state.usesServerContract).toBe(false)
    expect(state.isEmergencyCustody).toBe(false)
    expect(state.canonicalAttemptId).toBe('a1')
    expect(state.agreement?.id).toBe('c1')
    expect(state.actions.CONTACT.allowed).toBe(true)
    expect(state.actions.RESCHEDULE.allowed).toBe(false)
    expect(state.actions.PICKUP_AGREE.allowed).toBe(false)
  })

  it('obedece allowedActions del servidor sobre la inferencia local (ruta en curso habilitada)', () => {
    const state = resolveIncidentState(
      makeView({
        originalRoute: IN_PROGRESS_ROUTE,
        status: 'READY_AT_STORE',
        ownership: 'FAILED_DELIVERY',
        latestFailedAttemptId: 'a1',
        readiness: {
          auditId: 'aud-1',
          attemptId: 'a1',
          confirmedAt: '2030-02-14T16:15:00Z',
          confirmedById: 'admin-1',
        },
        activeAgreementId: 'agr-1',
        emergencyId: null,
        emergency: null,
        allowedActions: {
          CONTACT: { allowed: true, reasonCode: null, reason: null },
          CONFIRM_INCIDENT_READY: {
            allowed: false,
            reasonCode: 'INCIDENT_ALREADY_READY',
            reason: 'Already ready',
          },
          RESCHEDULE: { allowed: true, reasonCode: null, reason: null },
          PICKUP_AGREE: { allowed: true, reasonCode: null, reason: null },
          PICKUP_DECLINE: { allowed: true, reasonCode: null, reason: null },
          PICKUP_CONFIRM: { allowed: false, reasonCode: 'PICKUP_NOT_AGREED', reason: 'No pickup' },
        },
      }),
      undefined,
    )

    expect(state.usesServerContract).toBe(true)
    expect(state.actions.RESCHEDULE.allowed).toBe(true)
    expect(state.actions.PICKUP_AGREE.allowed).toBe(true)
    expect(state.actions.CONFIRM_INCIDENT_READY.allowed).toBe(false)
    expect(state.agreement?.id).toBe('agr-1')
  })

  it('nunca trata una denegación explícita del servidor como permiso aunque la ruta esté completada', () => {
    const state = resolveIncidentState(
      makeView({
        originalRoute: COMPLETED_ROUTE,
        status: 'WAITING_STORE_READINESS',
        ownership: 'FAILED_DELIVERY',
        latestFailedAttemptId: 'a1',
        readiness: null,
        activeAgreementId: null,
        management: [
          auditRecord({ id: 'old-contact', action: 'CONTACT', orderId: 'f1', reason: 'Acordó' }),
        ],
        allowedActions: {
          CONTACT: { allowed: true, reasonCode: null, reason: null },
          CONFIRM_INCIDENT_READY: { allowed: true, reasonCode: null, reason: null },
          RESCHEDULE: {
            allowed: false,
            reasonCode: 'INCIDENT_NOT_READY_AT_STORE',
            reason: 'Not ready',
          },
          PICKUP_AGREE: {
            allowed: false,
            reasonCode: 'INCIDENT_NOT_READY_AT_STORE',
            reason: 'Not ready',
          },
          PICKUP_DECLINE: { allowed: true, reasonCode: null, reason: null },
          PICKUP_CONFIRM: { allowed: false, reasonCode: 'PICKUP_NOT_AGREED', reason: 'No pickup' },
        },
      }),
      undefined,
    )

    // activeAgreementId: null explícito del servidor no cae a inferir management
    expect(state.agreement).toBeUndefined()
    expect(state.actions.RESCHEDULE.allowed).toBe(false)
    expect(state.actions.RESCHEDULE.reasonCode).toBe('INCIDENT_NOT_READY_AT_STORE')
    expect(state.actions.PICKUP_AGREE.allowed).toBe(false)
    expect(state.actions.PICKUP_DECLINE.allowed).toBe(true)
    expect(state.actions.CONFIRM_INCIDENT_READY.allowed).toBe(true)
  })

  it('respeta latestFailedAttemptId null explícito y falla cerrado ante claves omitidas en allowedActions', () => {
    const state = resolveIncidentState(
      makeView({
        status: 'REVIEW_WITHOUT_FAILED_ATTEMPT',
        ownership: 'ADMINISTRATIVE_REVIEW',
        latestFailedAttemptId: null,
        readiness: null,
        activeAgreementId: null,
        allowedActions: {
          CONTACT: { allowed: false, reasonCode: 'FAILED_ATTEMPT_NOT_FOUND', reason: 'Missing' },
        },
      }),
      undefined,
    )

    expect(state.canonicalAttemptId).toBeUndefined()
    expect(state.actions.CONTACT.allowed).toBe(false)
    expect(state.actions.RESCHEDULE.allowed).toBe(false)
    expect(state.actions.PICKUP_AGREE.allowed).toBe(false)
    expect(state.actions.CONFIRM_INCIDENT_READY.allowed).toBe(false)
  })

  it('distingue custodia de emergencia real frente a ruta interrumpida ordinaria', () => {
    const emergencyState = resolveIncidentState(
      makeView({
        originalRoute: INTERRUPTED_ROUTE,
        status: 'EMERGENCY_CUSTODY',
        ownership: 'EMERGENCY_CUSTODY',
        emergencyId: 'em-1',
        emergency: {
          emergencyId: 'em-1',
          routeId: 'r1',
          recoveryResolved: false,
          pendingUnitsCount: 2,
          totalUnitsCount: 3,
        },
        allowedActions: ALL_DENIED,
      }),
      undefined,
    )
    expect(emergencyState.isEmergencyCustody).toBe(true)

    const ordinaryInterrupted = resolveIncidentState(
      makeView({
        originalRoute: INTERRUPTED_ROUTE,
        status: 'WAITING_STORE_READINESS',
        ownership: 'FAILED_DELIVERY',
        emergencyId: null,
        emergency: null,
        allowedActions: {
          CONTACT: { allowed: true, reasonCode: null, reason: null },
          CONFIRM_INCIDENT_READY: { allowed: true, reasonCode: null, reason: null },
          RESCHEDULE: {
            allowed: false,
            reasonCode: 'INCIDENT_NOT_READY_AT_STORE',
            reason: 'Not ready',
          },
          PICKUP_AGREE: {
            allowed: false,
            reasonCode: 'INCIDENT_NOT_READY_AT_STORE',
            reason: 'Not ready',
          },
          PICKUP_DECLINE: { allowed: true, reasonCode: null, reason: null },
          PICKUP_CONFIRM: { allowed: false, reasonCode: 'PICKUP_NOT_AGREED', reason: 'No pickup' },
        },
      }),
      undefined,
    )
    expect(ordinaryInterrupted.isEmergencyCustody).toBe(false)
  })

  it('con metadata moderna parcial y sin allowedActions niega todo en lugar de heredar reglas legadas', () => {
    const state = resolveIncidentState(
      makeView({
        originalRoute: COMPLETED_ROUTE,
        status: 'WAITING_STORE_READINESS',
        ownership: 'FAILED_DELIVERY',
        management: [
          auditRecord({ id: 'old-contact', action: 'CONTACT', orderId: 'f1', reason: 'Acordó' }),
        ],
      }),
      { id: 'session-agr', reason: 'Acordó en sesión' },
    )

    expect(state.usesServerContract).toBe(true)
    expect(state.canonicalAttemptId).toBeUndefined()
    expect(state.agreement).toBeUndefined()
    for (const action of Object.values(state.actions)) {
      expect(action.fromServer).toBe(true)
      expect(action.allowed).toBe(false)
    }
  })

  it('con allowedActions nulo o malformado niega todo y solo booleano true literal habilita una acción', () => {
    const nullMap = resolveIncidentState(
      makeView({
        status: 'READY_AT_STORE',
        latestFailedAttemptId: 'a1',
        activeAgreementId: 'agr-1',
        allowedActions: null as unknown as IncidentAllowedActions,
      }),
      undefined,
    )
    expect(nullMap.usesServerContract).toBe(true)
    for (const action of Object.values(nullMap.actions)) {
      expect(action.allowed).toBe(false)
    }

    const truthyNonBoolean = resolveIncidentState(
      makeView({
        status: 'READY_AT_STORE',
        latestFailedAttemptId: 'a1',
        activeAgreementId: 'agr-1',
        allowedActions: {
          CONTACT: { allowed: 'true' as unknown as boolean, reasonCode: null, reason: null },
          CONFIRM_INCIDENT_READY: { allowed: 1 as unknown as boolean, reasonCode: null, reason: null },
          RESCHEDULE: null as unknown as { allowed: boolean; reasonCode: null; reason: null },
          PICKUP_AGREE: { allowed: true, reasonCode: null, reason: null },
        },
      }),
      undefined,
    )
    expect(truthyNonBoolean.actions.CONTACT.allowed).toBe(false)
    expect(truthyNonBoolean.actions.CONFIRM_INCIDENT_READY.allowed).toBe(false)
    expect(truthyNonBoolean.actions.RESCHEDULE.allowed).toBe(false)
    expect(truthyNonBoolean.actions.PICKUP_AGREE.allowed).toBe(true)
  })

  it('en modo moderno nunca sustituye attemptId ni agreementId localmente si faltan o son null', () => {
    const missingIds = resolveIncidentState(
      makeView({
        originalRoute: COMPLETED_ROUTE,
        pickup: { state: 'PENDING_PICKUP', agreedAt: '2030-02-15T10:00:00Z', pickedUpAt: null },
        status: 'READY_AT_STORE',
        ownership: 'FAILED_DELIVERY',
        management: [
          auditRecord({ id: 'old-contact', action: 'CONTACT', orderId: 'f1', reason: 'Acordó' }),
        ],
        allowedActions: {
          CONTACT: { allowed: true, reasonCode: null, reason: null },
          CONFIRM_INCIDENT_READY: { allowed: true, reasonCode: null, reason: null },
          RESCHEDULE: { allowed: true, reasonCode: null, reason: null },
          PICKUP_AGREE: { allowed: true, reasonCode: null, reason: null },
          PICKUP_DECLINE: { allowed: true, reasonCode: null, reason: null },
          PICKUP_CONFIRM: { allowed: true, reasonCode: null, reason: null },
        },
      }),
      { id: 'session-agr', reason: 'Acordó en sesión' },
    )

    expect(missingIds.canonicalAttemptId).toBeUndefined()
    expect(missingIds.agreement).toBeUndefined()
    expect(missingIds.actions.CONTACT.allowed).toBe(false)
    expect(missingIds.actions.CONFIRM_INCIDENT_READY.allowed).toBe(false)
    expect(missingIds.actions.PICKUP_AGREE.allowed).toBe(false)
    expect(missingIds.actions.PICKUP_DECLINE.allowed).toBe(false)
    expect(missingIds.actions.RESCHEDULE.allowed).toBe(false)
    // PICKUP_CONFIRM no depende de attemptId ni agreementId
    expect(missingIds.actions.PICKUP_CONFIRM.allowed).toBe(true)
  })
})
