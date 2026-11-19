import { describe, expect, it, vi } from 'vitest'
import { auditRecord, failedDelivery } from '../../test/dispatchFixtures'
import { guestOrder } from '../../test/fixtures'
import { monitorRoute, stopWith } from '../../test/monitorFixtures'
import { dispatchService } from '../dispatch/dispatchService'
import { monitorService } from '../monitor/monitorService'
import { ordersService } from '../orders/ordersService'
import { loadIncidentsBoard } from './incidentsBoard'

const STOP_1 = { ...stopWith(1, 'FAILED', 'RECIPIENT_ABSENT'), id: 'stop-1', orderId: 'f1' }
const STOP_2 = { ...stopWith(2, 'FAILED', 'RECIPIENT_REFUSED'), id: 'stop-2', orderId: 'f1' }
const R1 = monitorRoute({ id: 'r1', status: 'COMPLETED', stops: [STOP_1] })
const R2 = monitorRoute({ id: 'r2', status: 'IN_PROGRESS', stops: [STOP_2] })

describe('loadIncidentsBoard · metadatos del servidor', () => {
  it('usa latestFailedAttemptId del servidor, propaga metadatos e incluye CONFIRM_INCIDENT_READY en el historial', async () => {
    vi.spyOn(dispatchService, 'inbox').mockResolvedValue({
      date: '2030-02-15',
      urgencies: [],
      failedDeliveries: [
        failedDelivery('f1', {
          attempts: [
            {
              id: 'a-legacy-newer-ts',
              stopId: 'stop-1',
              failureReason: 'RECIPIENT_ABSENT',
              recordedAt: '2030-02-15T12:00:00Z',
            },
            {
              id: 'a-canonical',
              stopId: 'stop-2',
              failureReason: 'RECIPIENT_REFUSED',
              recordedAt: '2030-02-15T11:00:00Z',
            },
          ],
          status: 'READY_AT_STORE',
          ownership: 'FAILED_DELIVERY',
          latestFailedAttemptId: 'a-canonical',
          readiness: {
            auditId: 'aud-ready',
            attemptId: 'a-canonical',
            confirmedAt: '2030-02-15T11:30:00Z',
            confirmedById: 'admin-1',
          },
          emergencyId: null,
          emergency: null,
          activeAgreementId: 'agr-1',
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
            PICKUP_CONFIRM: { allowed: false, reasonCode: 'PICKUP_NOT_AGREED', reason: 'None' },
          },
        }),
      ],
    })
    vi.spyOn(monitorService, 'listRoutes').mockResolvedValue([R1, R2])
    vi.spyOn(dispatchService, 'audit').mockResolvedValue([
      auditRecord({
        id: 'aud-ready',
        action: 'CONFIRM_INCIDENT_READY',
        orderId: 'f1',
        reason: 'Pedido devuelto verificado en tienda',
        recordedAt: '2030-02-15T11:30:00Z',
      }),
    ])
    vi.spyOn(ordersService, 'get').mockResolvedValue({ ...guestOrder, id: 'f1' })

    const { incidents } = await loadIncidentsBoard()
    const [incident] = incidents

    expect(incident.latestAttempt?.id).toBe('a-canonical')
    expect(incident.originalRoute?.id).toBe('r2')
    expect(incident.status).toBe('READY_AT_STORE')
    expect(incident.ownership).toBe('FAILED_DELIVERY')
    expect(incident.latestFailedAttemptId).toBe('a-canonical')
    expect(incident.readiness?.attemptId).toBe('a-canonical')
    expect(incident.activeAgreementId).toBe('agr-1')
    expect(incident.emergencyId).toBeNull()
    expect(incident.emergency).toBeNull()
    expect(incident.allowedActions?.RESCHEDULE?.allowed).toBe(true)
    expect(incident.management.map((r) => r.action)).toEqual(['CONFIRM_INCIDENT_READY'])
  })

  it('respeta latestFailedAttemptId null explícito sin caer en attempts[0]', async () => {
    vi.spyOn(dispatchService, 'inbox').mockResolvedValue({
      date: '2030-02-15',
      urgencies: [],
      failedDeliveries: [
        failedDelivery('f1', {
          attempts: [
            {
              id: 'a-legacy',
              stopId: 'stop-1',
              failureReason: 'RECIPIENT_ABSENT',
              recordedAt: '2030-02-15T12:00:00Z',
            },
          ],
          status: 'REVIEW_WITHOUT_FAILED_ATTEMPT',
          ownership: 'ADMINISTRATIVE_REVIEW',
          latestFailedAttemptId: null,
          readiness: null,
          activeAgreementId: null,
        }),
      ],
    })
    vi.spyOn(monitorService, 'listRoutes').mockResolvedValue([R1])
    vi.spyOn(dispatchService, 'audit').mockResolvedValue([])
    vi.spyOn(ordersService, 'get').mockResolvedValue({ ...guestOrder, id: 'f1' })

    const [incident] = (await loadIncidentsBoard()).incidents

    expect(incident.latestFailedAttemptId).toBeNull()
    expect(incident.latestAttempt).toBeUndefined()
    expect(incident.originalRoute).toBeUndefined()
  })
})
