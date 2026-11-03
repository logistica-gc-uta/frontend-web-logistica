import { describe, expect, it, vi } from 'vitest'
import { apiClient } from '../../lib/http/apiClient'
import { auditRecord, failedDelivery } from '../../test/dispatchFixtures'
import { guestOrder } from '../../test/fixtures'
import { createHttpError, createHttpResponse } from '../../test/http'
import { monitorRoute, stopWith } from '../../test/monitorFixtures'
import { dispatchService } from '../dispatch/dispatchService'
import { monitorService } from '../monitor/monitorService'
import { ordersService } from '../orders/ordersService'
import { describeIncidentError } from './incidentError'
import { describeWindow, routeName, visitResult } from './incidentFormat'
import { loadIncidentsBoard } from './incidentsBoard'

const UUID = /^[0-9a-f-]{36}$/
const WINDOW = {
  scheduledDeliveryDate: '2030-02-15T09:00:00-05:00',
  deliveryWindowStart: '2030-02-15T09:00:00-05:00',
  deliveryWindowEnd: '2030-02-15T11:30:00-05:00',
}

describe('dispatchService · gestión de entregas fallidas', () => {
  const mockPost = () =>
    vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue(createHttpResponse(auditRecord({ action: 'CONTACT' })))

  it('un contacto sin acuerdo se registra con el último intento y sin fecha', async () => {
    const post = mockPost()

    await dispatchService.recordContact({
      orderId: 'o1',
      attemptId: 'a1',
      agreement: null,
      reason: 'No contestó',
    })

    expect(post.mock.calls[0][1]).toEqual({
      requestId: expect.stringMatching(UUID),
      action: 'CONTACT',
      orderId: 'o1',
      attemptId: 'a1',
      agreementConfirmed: false,
      reason: 'No contestó',
    })
  })

  it('un contacto con acuerdo envía la fecha y la franja acordadas', async () => {
    const post = mockPost()

    await dispatchService.recordContact({
      orderId: 'o1',
      attemptId: 'a1',
      agreement: WINDOW,
      reason: 'Acordó el sábado',
    })

    expect(post.mock.calls[0][1]).toEqual({
      requestId: expect.stringMatching(UUID),
      action: 'CONTACT',
      orderId: 'o1',
      attemptId: 'a1',
      agreementConfirmed: true,
      reason: 'Acordó el sábado',
      ...WINDOW,
    })
  })

  it('reprogramar usa el id del acuerdo registrado', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue(createHttpResponse(auditRecord({ action: 'RESCHEDULE' })))

    await dispatchService.rescheduleWithAgreement('o1', 'acuerdo-1', 'Acordó el sábado')

    expect(post.mock.calls[0][1]).toEqual({
      requestId: expect.stringMatching(UUID),
      action: 'RESCHEDULE',
      orderId: 'o1',
      agreementId: 'acuerdo-1',
      reason: 'Acordó el sábado',
    })
  })
})

describe('loadIncidentsBoard', () => {
  const r1 = monitorRoute({
    id: 'r1',
    status: 'COMPLETED',
    stops: [
      stopWith(1, 'SUCCESSFUL'),
      { ...stopWith(9, 'FAILED', 'RECIPIENT_ABSENT'), id: 'stop-f1', orderId: 'f1' },
    ],
  })
  const r2 = monitorRoute({
    id: 'r2',
    date: '2030-02-16T15:00:00Z',
    stops: [{ ...stopWith(1, 'PENDING'), id: 'stop-f1-r2', orderId: 'f1' }],
  })

  const mockApi = () => {
    vi.spyOn(dispatchService, 'inbox').mockResolvedValue({
      date: '2030-02-15',
      urgencies: [],
      failedDeliveries: [
        failedDelivery('f1', {
          attempts: [
            {
              id: 'a1',
              stopId: 'stop-f1',
              failureReason: 'RECIPIENT_ABSENT',
              recordedAt: '2030-02-14T16:00:00Z',
            },
          ],
        }),
      ],
    })
    vi.spyOn(monitorService, 'listRoutes').mockResolvedValue([r1, r2])
    vi.spyOn(dispatchService, 'audit').mockResolvedValue([
      auditRecord({
        id: 'c1',
        action: 'CONTACT',
        orderId: 'f1',
        recordedAt: '2030-02-15T10:00:00Z',
      }),
      auditRecord({
        id: 'c2',
        action: 'CONTACT',
        orderId: 'f1',
        recordedAt: '2030-02-15T12:00:00Z',
      }),
      auditRecord({ id: 'p1', action: 'PRIORITIZE', orderId: 'f1' }),
      auditRecord({ id: 'otro', action: 'CONTACT', orderId: 'otro-pedido' }),
    ])
  }

  it('junta el intento, la ruta original, todas las visitas y las gestiones del pedido', async () => {
    mockApi()
    vi.spyOn(ordersService, 'get').mockResolvedValue({ ...guestOrder, id: 'f1' })

    const { incidents, loadedAt } = await loadIncidentsBoard()

    expect(incidents).toHaveLength(1)
    const [incident] = incidents
    expect(incident.order?.id).toBe('f1')
    expect(incident.latestAttempt?.id).toBe('a1')
    expect(incident.originalRoute?.id).toBe('r1')
    expect(incident.visits.map(({ route, stop }) => [route.id, stop.outcome])).toEqual([
      ['r1', 'FAILED'],
      ['r2', 'PENDING'],
    ])
    expect(incident.management.map((record) => record.id)).toEqual(['c2', 'c1'])
    expect(Date.parse(loadedAt)).not.toBeNaN()
  })

  it('si no se puede consultar el pedido, igual lo muestra (sin sus datos)', async () => {
    mockApi()
    vi.spyOn(ordersService, 'get').mockRejectedValue(createHttpError(404))

    const [incident] = (await loadIncidentsBoard()).incidents

    expect(incident.order).toBeUndefined()
    expect(incident.originalRoute?.id).toBe('r1')
  })
})

describe('formatos y errores de entregas fallidas', () => {
  it('nombra rutas, resultados de visitas y franjas en hora de Guayaquil', () => {
    expect(routeName(monitorRoute())).toBe('Ruta FIC-02 · 21/10/2026, 10:00')
    expect(visitResult(stopWith(1, 'SUCCESSFUL'))).toBe('Entregado')
    expect(visitResult(stopWith(1, 'FAILED', 'RECIPIENT_REFUSED'))).toBe(
      'Visita fallida: el destinatario rechazó la entrega',
    )
    expect(visitResult(stopWith(1, 'PENDING'))).toBe('Pendiente')
    expect(visitResult(stopWith(1, null))).toBe('Sin resultado registrado')
    expect(describeWindow(WINDOW)).toBe('15/02/2030, 09:00 a 11:30')
  })

  it('explica permisos y conflictos sin presentarlos como éxito', () => {
    expect(describeIncidentError(createHttpError(403))).toBe(
      'No tienes permisos para gestionar entregas fallidas.',
    )
    expect(
      describeIncidentError(
        createHttpError(409, {
          data: { message: 'Contact must refer to the latest failed attempt' },
        }),
      ),
    ).toMatch(/^Conflicto: Contact must refer to the latest failed attempt\. El intento, la ruta/)
  })
})
