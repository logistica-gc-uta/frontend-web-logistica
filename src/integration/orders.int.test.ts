import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ordersService } from '../features/orders/ordersService'
import type { CreateAdminPurchaseInput } from '../features/orders/types'
import { productsService } from '../features/products/productsService'
import type { Product } from '../features/products/types'
import { shopErrorInfo } from '../features/shop/shopError'
import { shopService } from '../features/shop/shopService'
import { localDateTimeToIso, BUSINESS_TIME_ZONE } from '../lib/time/guayaquil'
import type { GeoPoint } from '../types/geo'
import { coveragePoints, guestSaleInput } from './support/purchases'
import { loginAsAdmin, loginAsClient, uniqueSuffix } from './support/session'

/** Día lejano y fijo para las ventas "futuras": no se mezcla con los pedidos de demo. */
const FUTURE_DAY = '2031-03-15'
const FUTURE_LOCAL = `${FUTURE_DAY}T10:00`
const PAST_INSTANT = '2001-01-01T10:00:00-05:00'
/** Lejos de Ambato: fuera de la cobertura. */
const OUTSIDE: GeoPoint = { lat: -2.9, lng: -79.0 }

const localFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** Fecha y hora de Guayaquil dentro de `minutes` minutos, como las escribiría el operador. */
const guayaquilLocalIn = (minutes: number): string =>
  localFormatter.format(new Date(Date.now() + minutes * 60_000)).replace(' ', 'T')

const toIso = (local: string): string => localDateTimeToIso(local) ?? ''

let inside: GeoPoint
let product: Product

const buildInput = (patch: Partial<CreateAdminPurchaseInput> = {}): CreateAdminPurchaseInput => ({
  ...guestSaleInput({
    productId: product.id,
    scheduledDeliveryDate: toIso(FUTURE_LOCAL),
    location: inside,
  }),
  ...patch,
})

/** Espera que la promesa falle y devuelve estado, código y mensaje del backend. */
async function rejection(promise: Promise<unknown>) {
  const error = await promise.then(
    () => {
      throw new Error('Se esperaba un rechazo del backend')
    },
    (reason: unknown) => reason,
  )
  const { status, code } = shopErrorInfo(error)
  const body = (error as { response?: { data?: { message?: string | string[] } } }).response?.data
  const message = Array.isArray(body?.message) ? body.message.join('. ') : (body?.message ?? '')
  return { status, code, message }
}

/** El listado de productos solo incluye los que tienen stock; sin stock se considera 0. */
const stockOf = async (productId: string): Promise<number> =>
  (await productsService.list()).find((candidate) => candidate.id === productId)?.stock ?? 0

const stockOfTestProduct = (): Promise<number> => stockOf(product.id)

/** IVA simulado vigente en centavos sobre un subtotal (redondeo HALF_UP, como el backend). */
const taxOf = async (subtotalCents: number): Promise<number> => {
  const { tax } = await shopService.settings()
  return tax.enabled ? Math.round((subtotalCents * tax.rateBps) / 10000) : 0
}

describe('Integración real · ventas ADMIN (/orders/admin, #34)', () => {
  beforeAll(async () => {
    await loginAsAdmin()
    inside = (await coveragePoints()).inside
    // Producto propio de la ejecución: las ventas de prueba no consumen el stock del seed.
    product = await productsService.create({
      name: `IT Producto ventas ${uniqueSuffix()}`,
      price: 10,
      stock: 10,
    })
  })

  beforeEach(loginAsAdmin)

  it('lista los pedidos paginados con el formato que usa la interfaz', async () => {
    const page = await ordersService.list({ page: 1, pageSize: 5 })

    expect(page.page).toBe(1)
    expect(page.pageSize).toBe(5)
    expect(page.items.length).toBeGreaterThan(0)
    expect(page.items[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        deliveryAddress: expect.any(String),
        status: expect.any(String),
        total: expect.any(Number),
        planningEligibility: expect.objectContaining({ eligible: expect.any(Boolean) }),
        items: expect.any(Array),
      }),
    )
  })

  it('venta de invitado en efectivo: totales del servidor, pago declarado, comprobante y stock', async () => {
    const stockBefore = await stockOfTestProduct()
    const input = buildInput({ items: [{ productId: product.id, quantity: 2 }] })
    const key = crypto.randomUUID()

    const created = await ordersService.createPurchase(input, key)

    const tax = await taxOf(2000)
    expect(created).toEqual(
      expect.objectContaining({
        status: 'PENDING',
        recipientType: 'GUEST',
        zoneId: null,
        buyerName: input.buyer.type === 'GUEST' ? input.buyer.name : '',
        buyerPhone: '0990000000',
        // Sin destinatario aparte, recibe el comprador.
        recipientName: input.buyer.type === 'GUEST' ? input.buyer.name : '',
        subtotalCents: 2000,
        taxAmountCents: tax,
        shippingAmountCents: 0,
        totalCents: 2000 + tax,
        payment: expect.objectContaining({
          kind: 'ADMIN_DECLARED_EXTERNAL',
          status: 'DECLARED',
          method: 'CASH',
        }),
        receipt: expect.objectContaining({ number: expect.any(String) }),
      }),
    )
    expect(await stockOfTestProduct()).toBe(stockBefore - 2)

    const receipt = await ordersService.receipt(created.id)
    expect(receipt).toEqual(
      expect.objectContaining({
        number: created.receipt.number,
        totalCents: 2000 + tax,
        buyer: expect.objectContaining({ phone: '0990000000' }),
        payment: expect.objectContaining({ kind: 'ADMIN_DECLARED_EXTERNAL', method: 'CASH' }),
      }),
    )
    expect(JSON.stringify(receipt)).not.toMatch(/cardLast4/)

    // El intento queda consultable con su clave (recuperar una respuesta perdida).
    const attempt = await ordersService.purchaseAttempt(key)
    expect(attempt).toEqual(expect.objectContaining({ status: 'SUCCEEDED', orderId: created.id }))
  })

  it('repetir la misma venta con la misma clave no la duplica ni descuenta stock dos veces', async () => {
    const input = buildInput()
    const key = crypto.randomUUID()
    const first = await ordersService.createPurchase(input, key)
    const stockAfterFirst = await stockOfTestProduct()

    const replay = await ordersService.createPurchase(input, key)

    expect(replay.id).toBe(first.id)
    expect(await stockOfTestProduct()).toBe(stockAfterFirst)

    const reused = await rejection(
      ordersService.createPurchase(
        { ...input, deliveryAddress: `${input.deliveryAddress} B` },
        key,
      ),
    )
    expect(reused).toEqual(expect.objectContaining({ status: 409, code: 'IDEMPOTENCY_KEY_REUSED' }))
  })

  it('CP-PED-006 · dos productos, transferencia con nota y regalo para otra persona', async () => {
    const second = await productsService.create({
      name: `IT Producto ventas B ${uniqueSuffix()}`,
      price: 25.5,
      stock: 5,
    })
    const input = buildInput({
      items: [
        { productId: product.id, quantity: 3 },
        { productId: second.id, quantity: 2 },
      ],
      giftRecipient: { name: 'IT Destinataria', contactPhone: '0987654321' },
      payment: { method: 'TRANSFER', note: 'Transferencia declarada por el cliente' },
    })

    const created = await ordersService.createPurchase(input, crypto.randomUUID())

    // 3 × 10,00 + 2 × 25,50 = 81,00
    expect(created.subtotalCents).toBe(8100)
    expect(created.payment.method).toBe('TRANSFER')
    expect(created).toEqual(
      expect.objectContaining({ recipientName: 'IT Destinataria', recipientPhone: '0987654321' }),
    )
    // Comprador y destinatario quedan separados.
    expect(created.buyerPhone).toBe('0990000000')
    const receipt = await ordersService.receipt(created.id)
    expect(receipt.recipient).toEqual({ name: 'IT Destinataria', phone: '0987654321' })
    expect(receipt.items).toHaveLength(2)
  })

  it('una hora de hoy se acepta dentro del horario y se rechaza fuera de él', async () => {
    const local = guayaquilLocalIn(10)
    const { deliverySchedule } = await shopService.settings()
    const time = local.slice(11, 16)
    const withinHours = time >= deliverySchedule.startTime && time <= deliverySchedule.endTime
    const input = buildInput({ scheduledDeliveryDate: toIso(local) })

    if (withinHours) {
      const created = await ordersService.createPurchase(input, crypto.randomUUID())
      expect(created.status).toBe('PENDING')
    } else {
      const result = await rejection(ordersService.createPurchase(input, crypto.randomUUID()))
      expect(result).toEqual(
        expect.objectContaining({ status: 422, code: 'DELIVERY_OUTSIDE_HOURS' }),
      )
    }
  })

  it('una fecha pasada se rechaza y no descuenta stock', async () => {
    const stockBefore = await stockOfTestProduct()

    const result = await rejection(
      ordersService.createPurchase(
        buildInput({ scheduledDeliveryDate: PAST_INSTANT }),
        crypto.randomUUID(),
      ),
    )

    expect([400, 422]).toContain(result.status)
    expect(await stockOfTestProduct()).toBe(stockBefore)
  })

  it('el stock insuficiente se rechaza con 400 sin pedido ni comprobante a medias', async () => {
    const stockBefore = await stockOfTestProduct()

    const result = await rejection(
      ordersService.createPurchase(
        buildInput({ items: [{ productId: product.id, quantity: 1000 }] }),
        crypto.randomUUID(),
      ),
    )

    expect(result.status).toBe(400)
    expect(result.message).toContain('Stock insuficiente')
    expect(await stockOfTestProduct()).toBe(stockBefore)
  })

  it('un punto fuera de la cobertura se rechaza (DELIVERY_OUTSIDE_COVERAGE) sin descontar stock', async () => {
    const stockBefore = await stockOfTestProduct()

    const result = await rejection(
      ordersService.createPurchase(
        buildInput({ deliveryLat: OUTSIDE.lat, deliveryLng: OUTSIDE.lng }),
        crypto.randomUUID(),
      ),
    )

    expect(result).toEqual(
      expect.objectContaining({ status: 422, code: 'DELIVERY_OUTSIDE_COVERAGE' }),
    )
    expect(await stockOfTestProduct()).toBe(stockBefore)
  })

  it('el teléfono del comprador es obligatorio (400)', async () => {
    const input = buildInput()
    const result = await rejection(
      ordersService.createPurchase(
        { ...input, buyer: { type: 'GUEST', name: 'IT Sin teléfono', contactPhone: ' ' } },
        crypto.randomUUID(),
      ),
    )

    expect(result.status).toBe(400)
  })

  it('corrige el contacto con versión, guarda historial y no cambia el comprobante', async () => {
    const created = await ordersService.createPurchase(
      buildInput({ giftRecipient: { name: 'IT Recibe', contactPhone: '0987000000' } }),
      crypto.randomUUID(),
    )

    const corrected = await ordersService.updateContact(created.id, {
      contactRevision: 0,
      recipientPhone: '0987111111',
    })
    const stale = await rejection(
      ordersService.updateContact(created.id, { contactRevision: 0, recipientPhone: '0987222222' }),
    )
    const history = await ordersService.contactHistory(created.id)
    const receipt = await ordersService.receipt(created.id)

    expect(corrected).toEqual(
      expect.objectContaining({ recipientPhone: '0987111111', contactRevision: 1 }),
    )
    expect(stale).toEqual(
      expect.objectContaining({ status: 409, code: 'CONTACT_REVISION_CONFLICT' }),
    )
    expect(history).toEqual([
      expect.objectContaining({
        field: 'recipientPhone',
        previousValue: '0987000000',
        nextValue: '0987111111',
      }),
    ])
    // El comprobante conserva el contacto de la venta.
    expect(receipt.recipient.phone).toBe('0987000000')
  })

  it('un CLIENT no puede registrar ventas ni corregir contactos (403)', async () => {
    const created = await ordersService.createPurchase(buildInput(), crypto.randomUUID())
    await loginAsClient()

    expect(
      (await rejection(ordersService.createPurchase(buildInput(), crypto.randomUUID()))).status,
    ).toBe(403)
    expect(
      (
        await rejection(
          ordersService.updateContact(created.id, { contactRevision: 0, buyerPhone: '0991' }),
        )
      ).status,
    ).toBe(403)
  })
})
