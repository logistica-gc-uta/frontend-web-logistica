import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { dispatchService } from '../features/dispatch/dispatchService'
import { describeLossError } from '../features/losses/lossErrors'
import { productsService } from '../features/products/productsService'
import { apiClient } from '../lib/http/apiClient'
import { BUSINESS_TIME_ZONE } from '../lib/time/guayaquil'
import type { GeoPoint } from '../types/geo'
import { expectHttpError } from './support/assertions'
import { coveragePoints, createGuestSale } from './support/purchases'
import { loginAsAdmin, loginAsClient, uniqueSuffix } from './support/session'

/**
 * #39 · Pérdida, reemplazo y recuperación tardía contra la API real (backend #52). Usa un producto
 * propio con 2 unidades y dos ventas de 1 unidad: al empezar el stock libre es 0, así que se puede
 * probar el reemplazo pendiente, la reposición y la recuperación sin depender de otros datos.
 */
const TOMORROW = new Intl.DateTimeFormat('sv-SE', { timeZone: BUSINESS_TIME_ZONE }).format(
  new Date(Date.now() + 24 * 60 * 60 * 1000),
)

let inside: GeoPoint
let productId: string
let orderA: { id: string; itemId: string }
let orderB: { id: string; itemId: string }

const lossesOf = (orderId: string) => dispatchService.losses(orderId)
/** `GET /products` solo lista productos con stock mayor que 0: si no aparece, su stock es 0. */
const stockOf = async () =>
  (await productsService.list()).find((product) => product.id === productId)?.stock ?? 0

/** El pedido con su ítem (para declarar la pérdida de su única unidad). */
const sale = async () => {
  const created = await createGuestSale({
    productId,
    scheduledDeliveryDate: `${TOMORROW}T10:00:00-05:00`,
    location: inside,
  })
  const { data } = await apiClient.get<{ items: { id: string }[] }>(`/orders/${created.id}`)
  return { id: created.id, itemId: data.items[0].id }
}

describe('Integración real · pérdida, reemplazo y recuperación (#39, backend #52)', () => {
  beforeAll(async () => {
    await loginAsAdmin()
    inside = (await coveragePoints()).inside
    productId = (
      await productsService.create({
        name: `IT Producto pérdidas ${uniqueSuffix()}`,
        price: 7,
        stock: 2,
      })
    ).id
    orderA = await sale()
    orderB = await sale()
  })

  beforeEach(loginAsAdmin)

  it('sin stock libre la pérdida queda con reemplazo pendiente y no toca el stock', async () => {
    expect(await stockOf()).toBe(0)

    await dispatchService.declareLoss({
      orderId: orderA.id,
      orderItemId: orderA.itemId,
      reason: 'IT: se perdió en ruta',
    })

    const [loss] = await lossesOf(orderA.id)
    expect(loss).toEqual(
      expect.objectContaining({
        unitNumber: 1,
        replacement: expect.objectContaining({ state: 'PENDING' }),
        original: expect.objectContaining({ state: 'LOST' }),
        movements: [],
      }),
    )
    expect(await stockOf()).toBe(0)

    const error = await dispatchService
      .prepareReplacement(loss.id, 'IT: sin stock')
      .catch((reason: unknown) => reason)
    expect(describeLossError(error, 'f')).toMatch(/sigue pendiente y no se descontó nada/)
    expect(await stockOf()).toBe(0)
  })

  it('al reponer stock se prepara el reemplazo descontando una sola unidad', async () => {
    await apiClient.patch(`/products/${productId}/stock`, { stock: 1 })
    const [loss] = await lossesOf(orderA.id)

    await dispatchService.prepareReplacement(loss.id, 'IT: llegó mercadería')

    const [after] = await lossesOf(orderA.id)
    expect(after.replacement.state).toBe('PREPARED')
    expect(after.movements).toEqual([
      expect.objectContaining({ kind: 'REPLACEMENT_OUT', delta: -1, stockAfter: 0 }),
    ])
    expect(await stockOf()).toBe(0)

    const again = await dispatchService
      .prepareReplacement(loss.id, 'IT: otra vez')
      .catch((reason: unknown) => reason)
    expect(describeLossError(again, 'f')).toMatch(/ya estaba preparado/)
    const repeated = await dispatchService
      .declareLoss({ orderId: orderA.id, orderItemId: orderA.itemId, reason: 'IT: otra vez' })
      .catch((reason: unknown) => reason)
    expect(describeLossError(repeated, 'f')).toMatch(/ya tiene una pérdida/)
    expect(await stockOf()).toBe(0)
  })

  it('el original vendible vuelve al stock una sola vez', async () => {
    const [loss] = await lossesOf(orderA.id)

    await dispatchService.recoverOriginal(loss.id, 'SELLABLE', 'IT: apareció intacto')

    const [after] = await lossesOf(orderA.id)
    expect(after.original).toEqual(
      expect.objectContaining({ state: 'RECOVERED', condition: 'SELLABLE' }),
    )
    expect(after.movements.map((movement) => [movement.kind, movement.stockAfter])).toEqual([
      ['REPLACEMENT_OUT', 0],
      ['RECOVERY_IN', 1],
    ])
    expect(await stockOf()).toBe(1)

    const again = await dispatchService
      .recoverOriginal(loss.id, 'SELLABLE', 'IT: otra vez')
      .catch((reason: unknown) => reason)
    expect(describeLossError(again, 'f')).toMatch(/no se volvió a sumar/)
    expect(await stockOf()).toBe(1)
  })

  it('con stock libre el reemplazo se prepara al declarar; un original dañado no suma', async () => {
    await dispatchService.declareLoss({
      orderId: orderB.id,
      orderItemId: orderB.itemId,
      reason: 'IT: llegó roto',
    })
    const [loss] = await lossesOf(orderB.id)
    expect(loss.replacement.state).toBe('PREPARED')
    expect(await stockOf()).toBe(0)

    await dispatchService.recoverOriginal(loss.id, 'DAMAGED', 'IT: no se puede vender')

    const [after] = await lossesOf(orderB.id)
    expect(after.original.condition).toBe('DAMAGED')
    expect(after.movements.map((movement) => movement.kind)).toEqual(['REPLACEMENT_OUT'])
    expect(await stockOf()).toBe(0)
  })

  it('un CLIENT no puede ver ni declarar pérdidas (403)', async () => {
    await loginAsClient()

    await expectHttpError(dispatchService.losses(orderA.id), 403)
    await expectHttpError(
      dispatchService.declareLoss({ orderId: orderA.id, orderItemId: orderA.itemId, reason: 'IT' }),
      403,
    )
  })
})
