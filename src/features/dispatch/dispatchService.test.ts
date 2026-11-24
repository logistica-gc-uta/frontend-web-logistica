import { AxiosError } from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { apiClient } from '../../lib/http/apiClient'
import { auditRecord, failedDelivery, urgencyProposal } from '../../test/dispatchFixtures'
import { orders } from '../../test/fixtures'
import { createHttpError, createHttpResponse } from '../../test/http'
import { ordersService } from '../orders/ordersService'
import { describeDispatchError } from './dispatchError'
import { dispatchService } from './dispatchService'
import { loadUrgencyBoard } from './urgencyBoard'

const UUID = /^[0-9a-f-]{36}$/

const lastBody = (post: ReturnType<typeof vi.spyOn>) =>
  post.mock.calls.at(-1)?.[1] as Record<string, unknown>

describe('dispatchService.inbox', () => {
  it('trae las urgencias y las entregas fallidas, sin el texto libre de los intentos', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(
      createHttpResponse({
        date: '2026-10-21',
        timeZone: 'America/Guayaquil',
        urgencies: [{ ...urgencyProposal('o1'), date: '2026-10-21', stops: [], extra: 'x' }],
        incidents: [
          {
            orderId: 'f1',
            routeId: 'route-1',
            attempts: [
              {
                id: 'viejo',
                stopId: 's1',
                outcome: 'FAILED',
                failureReason: 'RECIPIENT_REFUSED',
                context: 'No estaba',
                recordedAt: '2026-10-20T15:00:00Z',
              },
              {
                id: 'nuevo',
                stopId: 's2',
                outcome: 'FAILED',
                failureReason: 'RECIPIENT_ABSENT',
                context: 'No estaba',
                recordedAt: '2026-10-21T15:00:00Z',
              },
            ],
          },
        ],
      }),
    )

    const inbox = await dispatchService.inbox()

    expect(get).toHaveBeenCalledWith('/dispatch/inbox', { timeout: 30_000 })
    expect(inbox).toEqual({
      date: '2026-10-21',
      urgencies: [urgencyProposal('o1')],
      failedDeliveries: [
        {
          orderId: 'f1',
          routeId: 'route-1',
          pickup: null,
          attempts: [
            {
              id: 'nuevo',
              stopId: 's2',
              failureReason: 'RECIPIENT_ABSENT',
              recordedAt: '2026-10-21T15:00:00Z',
            },
            {
              id: 'viejo',
              stopId: 's1',
              failureReason: 'RECIPIENT_REFUSED',
              recordedAt: '2026-10-20T15:00:00Z',
            },
          ],
        },
      ],
    })
    expect(JSON.stringify(inbox)).not.toContain('No estaba')
  })

  it('conserva los metadatos del incidente del servidor (incluido null explícito) y descarta campos extra/PII', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(
      createHttpResponse({
        date: '2026-11-19',
        timeZone: 'America/Guayaquil',
        urgencies: [],
        incidents: [
          {
            orderId: 'f1',
            routeId: 'r1',
            pickup: null,
            attempts: [
              {
                id: 'a1',
                stopId: 's1',
                outcome: 'FAILED',
                failureReason: 'RECIPIENT_ABSENT',
                recordedAt: '2026-11-19T17:10:00Z',
              },
            ],
            status: 'WAITING_STORE_READINESS',
            ownership: 'FAILED_DELIVERY',
            latestFailedAttemptId: 'a1',
            readiness: null,
            emergencyId: null,
            emergency: null,
            activeAgreementId: null,
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
              PICKUP_CONFIRM: {
                allowed: false,
                reasonCode: 'PICKUP_NOT_AGREED',
                reason: 'No pickup',
              },
              UNEXPECTED_ACTION: { allowed: true, reasonCode: null, reason: null },
            },
            recipientPhone: '0999999999',
            rawAuditPayload: { secret: 'internal' },
          },
          {
            orderId: 'f2',
            routeId: 'r2',
            pickup: null,
            attempts: [],
            status: 'EMERGENCY_CUSTODY',
            ownership: 'EMERGENCY_CUSTODY',
            latestFailedAttemptId: null,
            readiness: null,
            emergencyId: 'em-1',
            emergency: {
              emergencyId: 'em-1',
              routeId: 'r2',
              recoveryResolved: false,
              pendingUnitsCount: 2,
              totalUnitsCount: 3,
              internalNotes: 'no exponer',
            },
            activeAgreementId: null,
            allowedActions: {
              CONTACT: {
                allowed: false,
                reasonCode: 'EMERGENCY_CUSTODY_SEPARATE',
                reason: 'Managed in emergencies',
              },
            },
          },
        ],
      }),
    )

    const inbox = await dispatchService.inbox()

    expect(inbox.failedDeliveries[0]).toEqual({
      orderId: 'f1',
      routeId: 'r1',
      pickup: null,
      attempts: [
        {
          id: 'a1',
          stopId: 's1',
          failureReason: 'RECIPIENT_ABSENT',
          recordedAt: '2026-11-19T17:10:00Z',
        },
      ],
      status: 'WAITING_STORE_READINESS',
      ownership: 'FAILED_DELIVERY',
      latestFailedAttemptId: 'a1',
      readiness: null,
      emergencyId: null,
      emergency: null,
      activeAgreementId: null,
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
        PICKUP_CONFIRM: {
          allowed: false,
          reasonCode: 'PICKUP_NOT_AGREED',
          reason: 'No pickup',
        },
      },
    })
    expect(inbox.failedDeliveries[1]).toEqual({
      orderId: 'f2',
      routeId: 'r2',
      pickup: null,
      attempts: [],
      status: 'EMERGENCY_CUSTODY',
      ownership: 'EMERGENCY_CUSTODY',
      latestFailedAttemptId: null,
      readiness: null,
      emergencyId: 'em-1',
      emergency: {
        emergencyId: 'em-1',
        routeId: 'r2',
        recoveryResolved: false,
        pendingUnitsCount: 2,
        totalUnitsCount: 3,
      },
      activeAgreementId: null,
      allowedActions: {
        CONTACT: {
          allowed: false,
          reasonCode: 'EMERGENCY_CUSTODY_SEPARATE',
          reason: 'Managed in emergencies',
        },
      },
    })
    const serialized = JSON.stringify(inbox)
    expect(serialized).not.toContain('0999999999')
    expect(serialized).not.toContain('internal')
    expect(serialized).not.toContain('no exponer')
    expect(serialized).not.toContain('UNEXPECTED_ACTION')
  })

  it('tolera metadatos modernos malformados/nulos, exige booleano true literal y nunca propaga extras', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(
      createHttpResponse({
        date: '2026-11-19',
        timeZone: 'America/Guayaquil',
        urgencies: [],
        incidents: [
          {
            orderId: 'f-null-gates',
            routeId: 'r1',
            pickup: null,
            attempts: [],
            allowedActions: null,
            readiness: 'bad-readiness',
            emergency: ['bad-emergency'],
            latestFailedAttemptId: 123,
            activeAgreementId: '',
          },
          {
            orderId: 'f-truthy-gates',
            routeId: 'r2',
            pickup: null,
            attempts: [],
            status: 'WAITING_STORE_READINESS',
            ownership: 'FAILED_DELIVERY',
            allowedActions: {
              CONTACT: { allowed: 'true', reasonCode: 42, reason: ['raw'], extra: 'drop' },
              CONFIRM_INCIDENT_READY: { allowed: 1, reasonCode: null, reason: null },
              RESCHEDULE: null,
              PICKUP_AGREE: 'yes',
              PICKUP_DECLINE: { allowed: true, reasonCode: null, reason: null, leaked: 'nope' },
              ARBITRARY_EXTRA: { allowed: true, reasonCode: null, reason: null },
            },
          },
          {
            orderId: 'f-bad-status-only',
            routeId: 'r3',
            pickup: null,
            attempts: [],
            status: 999,
          },
        ],
      }),
    )

    const inbox = await dispatchService.inbox()

    expect(inbox.failedDeliveries[0]).toEqual({
      orderId: 'f-null-gates',
      routeId: 'r1',
      pickup: null,
      attempts: [],
      latestFailedAttemptId: null,
      readiness: null,
      emergency: null,
      activeAgreementId: null,
      allowedActions: {},
    })
    expect(inbox.failedDeliveries[1]).toEqual({
      orderId: 'f-truthy-gates',
      routeId: 'r2',
      pickup: null,
      attempts: [],
      status: 'WAITING_STORE_READINESS',
      ownership: 'FAILED_DELIVERY',
      allowedActions: {
        CONTACT: { allowed: false, reasonCode: null, reason: null },
        CONFIRM_INCIDENT_READY: { allowed: false, reasonCode: null, reason: null },
        PICKUP_DECLINE: { allowed: true, reasonCode: null, reason: null },
      },
    })
    // Aunque solo llegue un campo moderno inválido, preserva el modo moderno con compuertas cerradas.
    expect(inbox.failedDeliveries[2]).toEqual({
      orderId: 'f-bad-status-only',
      routeId: 'r3',
      pickup: null,
      attempts: [],
      allowedActions: {},
    })
    const serialized = JSON.stringify(inbox)
    expect(serialized).not.toContain('ARBITRARY_EXTRA')
    expect(serialized).not.toContain('leaked')
    expect(serialized).not.toContain('drop')
  })
})

describe('dispatchService · decisiones (POST /dispatch/interventions)', () => {
  const mockPost = (outcome: 'APPLIED' | 'REJECTED' | 'FAILED' = 'APPLIED') =>
    vi.spyOn(apiClient, 'post').mockResolvedValue(createHttpResponse(auditRecord({ outcome })))

  it('confirmar una inserción envía la huella de la propuesta, sin chofer', async () => {
    const post = mockPost()

    await dispatchService.confirm(urgencyProposal('o1'), 'Cabe en la ruta', 'driver-1')

    expect(post).toHaveBeenCalledWith('/dispatch/interventions', expect.any(Object), {
      timeout: 30_000,
    })
    expect(lastBody(post)).toEqual({
      requestId: expect.stringMatching(UUID),
      action: 'CONFIRM',
      orderId: 'o1',
      fingerprint: 'a'.repeat(64),
      reason: 'Cabe en la ruta',
    })
  })

  it('confirmar una salida nueva envía el chofer elegido', async () => {
    const post = mockPost()

    await dispatchService.confirm(
      urgencyProposal('o1', { kind: 'NEW_ROUTE', routeId: null }),
      'Sin lugar',
      'driver-1',
    )

    expect(lastBody(post)).toEqual(
      expect.objectContaining({ action: 'CONFIRM', driverId: 'driver-1' }),
    )
  })

  it('rechazar se da por hecho cuando el backend lo registra como REJECTED', async () => {
    const post = mockPost('REJECTED')

    await expect(dispatchService.reject(urgencyProposal('o1'), 'Esperar')).resolves.toEqual(
      expect.objectContaining({ outcome: 'REJECTED' }),
    )
    expect(lastBody(post)).toEqual(
      expect.objectContaining({ action: 'REJECT', orderId: 'o1', fingerprint: 'a'.repeat(64) }),
    )
  })

  it.each([
    ['confirmar', () => dispatchService.confirm(urgencyProposal('o1'), 'x'), 'REJECTED'],
    ['rechazar', () => dispatchService.reject(urgencyProposal('o1'), 'x'), 'APPLIED'],
    ['priorizar', () => dispatchService.prioritize('o1', 'x'), 'FAILED'],
  ] as const)(
    'un resultado inesperado al %s no se toma como éxito',
    async (_caso, decide, outcome) => {
      mockPost(outcome)

      await expect(decide()).rejects.toThrow(
        'El servidor no aplicó la decisión. Revisa la lista actualizada.',
      )
    },
  )

  it('priorizar y cambiar el chofer envían solo sus campos', async () => {
    const post = mockPost()

    await dispatchService.prioritize('o1', 'Cliente importante')
    expect(lastBody(post)).toEqual({
      requestId: expect.stringMatching(UUID),
      action: 'PRIORITIZE',
      orderId: 'o1',
      reason: 'Cliente importante',
    })

    await dispatchService.reassignDriver('route-1', 'driver-2', 'Chofer enfermo')
    expect(lastBody(post)).toEqual({
      requestId: expect.stringMatching(UUID),
      action: 'REASSIGN_DRIVER',
      routeId: 'route-1',
      driverId: 'driver-2',
      reason: 'Chofer enfermo',
    })
  })

  it('cancelar una ruta envía CANCEL_ROUTE con requestId, routeId y motivo recortado', async () => {
    const post = mockPost()

    await dispatchService.cancelRoute('route-1', '  Vehículo averiado antes de salir  ')

    expect(post).toHaveBeenCalledWith('/dispatch/interventions', expect.any(Object), {
      timeout: 30_000,
    })
    expect(lastBody(post)).toEqual({
      requestId: expect.stringMatching(UUID),
      action: 'CANCEL_ROUTE',
      routeId: 'route-1',
      reason: 'Vehículo averiado antes de salir',
    })
  })

  it('cancelar una ruta rechaza si el servidor no responde APPLIED', async () => {
    mockPost('FAILED')

    await expect(dispatchService.cancelRoute('route-1', 'Sin unidad')).rejects.toThrow(
      'El servidor no aplicó la decisión. Revisa la lista actualizada.',
    )
  })

  it('confirmar disponibilidad en tienda envía CONFIRM_INCIDENT_READY con attemptId, requestId y motivo recortado', async () => {
    const post = mockPost('APPLIED')

    await dispatchService.confirmIncidentReady({
      orderId: 'f1',
      attemptId: 'a1',
      reason: '  Pedido devuelto verificado en bodega  ',
    })

    expect(post).toHaveBeenCalledOnce()
    expect(post).toHaveBeenCalledWith('/dispatch/interventions', expect.any(Object), {
      timeout: 30_000,
    })
    expect(lastBody(post)).toEqual({
      requestId: expect.stringMatching(UUID),
      action: 'CONFIRM_INCIDENT_READY',
      orderId: 'f1',
      attemptId: 'a1',
      reason: 'Pedido devuelto verificado en bodega',
    })
  })

  it('confirmar disponibilidad en tienda rechaza sin reintentar si el servidor no responde APPLIED o devuelve conflicto', async () => {
    const post = mockPost('FAILED')

    await expect(
      dispatchService.confirmIncidentReady({ orderId: 'f1', attemptId: 'a1', reason: 'En tienda' }),
    ).rejects.toThrow('El servidor no aplicó la decisión. Revisa la lista actualizada.')
    expect(post).toHaveBeenCalledOnce()

    post.mockReset()
    post.mockRejectedValue(
      createHttpError(409, { data: { code: 'INCIDENT_ALREADY_READY', message: 'Already ready' } }),
    )
    await expect(
      dispatchService.confirmIncidentReady({ orderId: 'f1', attemptId: 'a1', reason: 'En tienda' }),
    ).rejects.toBeTruthy()
    expect(post).toHaveBeenCalledOnce()
  })

  it('reprogramar registra primero el acuerdo y luego reprograma con ese acuerdo', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValueOnce(
        createHttpResponse(auditRecord({ id: 'acuerdo-1', action: 'CONTACT' })),
      )
      .mockResolvedValueOnce(createHttpResponse(auditRecord({ action: 'RESCHEDULE' })))
    const timing = {
      scheduledDeliveryDate: '2026-10-22T09:00:00-05:00',
      deliveryWindowStart: '2026-10-22T09:00:00-05:00',
      deliveryWindowEnd: '2026-10-22T11:00:00-05:00',
    }

    await dispatchService.reschedule({ orderId: 'o1', reason: 'Sin cupo hoy', ...timing })

    expect(post.mock.calls[0][1]).toEqual({
      requestId: expect.stringMatching(UUID),
      action: 'CONTACT',
      orderId: 'o1',
      agreementConfirmed: true,
      reason: 'Sin cupo hoy',
      ...timing,
    })
    expect(post.mock.calls[1][1]).toEqual({
      requestId: expect.stringMatching(UUID),
      action: 'RESCHEDULE',
      orderId: 'o1',
      agreementId: 'acuerdo-1',
      reason: 'Sin cupo hoy',
    })
  })

  it('si el acuerdo falla, no intenta reprogramar', async () => {
    const post = vi.spyOn(apiClient, 'post').mockRejectedValue(createHttpError(400))

    await expect(
      dispatchService.reschedule({
        orderId: 'o1',
        reason: 'x',
        scheduledDeliveryDate: 'a',
        deliveryWindowStart: 'a',
        deliveryWindowEnd: 'b',
      }),
    ).rejects.toBeTruthy()
    expect(post).toHaveBeenCalledOnce()
  })
})

describe('dispatchService.audit', () => {
  it('conserva solo los campos que muestra la interfaz', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(
      createHttpResponse([{ ...auditRecord(), requestId: 'r1', result: { secret: 'x' } }]),
    )

    expect(await dispatchService.audit()).toEqual([auditRecord()])
  })
})

describe('describeDispatchError', () => {
  it('explica permisos, conflictos y la falta de conexión sin presentarlos como éxito', () => {
    expect(describeDispatchError(createHttpError(403))).toBe(
      'No tienes permisos para despachar urgencias.',
    )
    expect(
      describeDispatchError(createHttpError(409, { data: { message: 'Stale proposal' } })),
    ).toBe(
      'Conflicto: Stale proposal. La propuesta, la ruta o el chofer cambiaron: actualiza las propuestas y vuelve a intentarlo.',
    )
    expect(describeDispatchError(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe(
      'No se pudo conectar con el servidor',
    )
  })
})

describe('loadUrgencyBoard', () => {
  it('cruza cada urgencia con los pedidos pendientes del día', async () => {
    vi.spyOn(dispatchService, 'inbox').mockResolvedValue({
      date: '2026-10-21',
      urgencies: [urgencyProposal(orders[0].id)],
      failedDeliveries: [],
    })
    const listAll = vi.spyOn(ordersService, 'listAll').mockResolvedValue([orders[0]])

    const board = await loadUrgencyBoard()

    expect(listAll).toHaveBeenCalledWith({ date: '2026-10-21' })
    expect(board.orders[orders[0].id]).toBe(orders[0])
  })

  it('separa los pedidos que ya están en una ruta: no son urgencias por despachar', async () => {
    vi.spyOn(dispatchService, 'inbox').mockResolvedValue({
      date: '2026-10-21',
      urgencies: [
        urgencyProposal('ya-en-ruta', { kind: 'BLOCKED', reasons: ['ACTIVE_ROUTE_CLAIM'] }),
        urgencyProposal('sin-deposito', {
          kind: 'BLOCKED',
          reasons: ['MISSING_ZONE_DEPOT_COORDINATES'],
        }),
      ],
      failedDeliveries: [failedDelivery('f1'), failedDelivery('f2'), failedDelivery('f3')],
    })
    vi.spyOn(ordersService, 'listAll').mockResolvedValue([])

    const board = await loadUrgencyBoard()

    expect(board.urgencies.map((urgency) => urgency.orderId)).toEqual(['sin-deposito'])
    expect(board.alreadyRouted).toBe(1)
    expect(board.failedDeliveries).toBe(3)
  })
})

describe('ordersService.listAll', () => {
  it('recorre todas las páginas de 100 pedidos', async () => {
    const list = vi.spyOn(ordersService, 'list').mockImplementation(async ({ page }) => ({
      items: [{ ...orders[0], id: `p${page}` }],
      total: 250,
      page,
      pageSize: 100,
    }))

    const all = await ordersService.listAll({ date: '2026-10-21', status: 'PENDING' })

    expect(all.map((order) => order.id)).toEqual(['p1', 'p2', 'p3'])
    expect(list).toHaveBeenCalledWith({
      date: '2026-10-21',
      status: 'PENDING',
      page: 3,
      pageSize: 100,
    })
  })
})
