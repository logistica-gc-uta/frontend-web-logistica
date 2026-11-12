import axios from 'axios'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { env } from '../config/env'
import { customerApiClient } from '../features/shop/account/customerApiClient'
import { customerService, NOT_A_CUSTOMER_MESSAGE } from '../features/shop/account/customerService'
import { customerStorage } from '../features/shop/account/customerStorage'
import { checkoutService } from '../features/shop/checkout/checkoutService'
import type { CardInput, DeliveryInput } from '../features/shop/checkout/checkoutTypes'
import {
  customerOrdersService,
  ORDER_NOT_FOUND_MESSAGE,
} from '../features/shop/orders/customerOrdersService'
import { shopErrorInfo } from '../features/shop/shopError'
import { authStorage } from '../lib/auth/authStorage'
import { BUSINESS_TIME_ZONE } from '../lib/time/guayaquil'
import type { Session } from '../types/auth'
import { fromPolygon } from '../features/store-coverage/coverageDraft'
import { shopService } from '../features/shop/shopService'
import type { GeoPoint } from '../types/geo'
import { credentialsFor } from './support/env'
import { loginAsAdmin, uniqueSuffix } from './support/session'
import {
  createShopCategory,
  createShopProduct,
  setProductPrice,
  setSimulatedTax,
} from './support/shopCatalog'

/**
 * Compra del Shop contra la API real: registro CLIENT, cotización con IVA simulado, ventana de
 * reparto, pago con tarjetas ficticias, idempotencia, competencia por la última unidad e historial.
 * Requiere el simulador de pagos habilitado en el backend y las 3 tarjetas de demostración.
 */
const APPROVED: CardInput = {
  number: '9000 0000 0000 0001',
  holderName: 'PRUEBA APROBADA',
  expiresMonth: 12,
  expiresYear: 2030,
  cvv: '111',
}
const EMPTY: CardInput = {
  ...APPROVED,
  number: '9000 0000 0000 0003',
  holderName: 'PRUEBA SIN SALDO',
  cvv: '333',
}

/** Mañana en Ecuador, para que cualquier hora de la ventana sea futura. */
const TOMORROW = new Intl.DateTimeFormat('sv-SE', { timeZone: BUSINESS_TIME_ZONE }).format(
  new Date(Date.now() + 24 * 60 * 60 * 1000),
)

/** Un punto dentro de la cobertura de la tienda y un vértice (su borde), leídos del backend. */
let inside: GeoPoint
let onBorder: GeoPoint
/** Lejos de Ambato: fuera de la cobertura. */
const OUTSIDE: GeoPoint = { lat: -2.9, lng: -79.0 }
let gift: { id: string } // $36,50: 2 unidades = $73,00
let cheap: { id: string } // $1,00: para pagar sin agotar el saldo ficticio
let lastUnit: { id: string } // stock 1: dos compradores compiten
let buyerA: Session
let buyerB: Session

/** Entrega sin zona (backend #42): solo dirección, punto y hora aproximada. */
const deliveryAt = (time: string, location: GeoPoint = inside): DeliveryInput => ({
  recipient: { name: 'IT Destinataria', phone: '0991234567' },
  deliveryAddress: `IT Calle ${uniqueSuffix()}`,
  deliveryLocation: location,
  scheduledDeliveryDate: `${TOMORROW}T${time}:00-05:00`,
})

const as = (session: Session) => customerStorage.save(session)
const codeOf = (error: unknown) => shopErrorInfo(error).code

async function newCustomer(label: string): Promise<Session> {
  const email = `it-${label}-${uniqueSuffix().toLowerCase()}@regalia.test`
  await customerService.register({ name: `IT Cliente ${label}`, email, password: 'Clave12345' })
  return customerService.login({ email, password: 'Clave12345' })
}

async function payOnce(
  session: Session,
  productId: string,
  card = APPROVED,
  key = crypto.randomUUID(),
) {
  as(session)
  const items = [{ productId, quantity: 1 }]
  const delivery = deliveryAt('10:00')
  const quote = await checkoutService.quote(items, delivery)
  return {
    key,
    quote,
    delivery,
    result: await checkoutService.pay(key, {
      items,
      delivery,
      quoteToken: quote.quoteToken,
      paymentCard: card,
    }),
  }
}

describe('Integración real · compra en el Shop (CLIENT)', () => {
  let originalTax: { enabled: boolean; rateBps: number }

  beforeAll(async () => {
    await loginAsAdmin()
    // La compra necesita la cobertura de la tienda (#32/#41): se usa la que esté configurada.
    const coverage = await shopService.storeCoverage()
    if (!coverage.configured)
      throw new Error('Configura la tienda y su cobertura antes de esta prueba')
    const area = fromPolygon(coverage.coverage)
    onBorder = area[0]
    inside = {
      lat: area.reduce((sum, p) => sum + p.lat, 0) / area.length,
      lng: area.reduce((sum, p) => sum + p.lng, 0) / area.length,
    }
    expect((await shopService.evaluateCoverage(inside)).position).toBe('INTERIOR')
    const category = await createShopCategory('IT Checkout')
    gift = await createShopProduct({
      categoryId: category.id,
      name: 'IT Regalo 36,50',
      description: 'IT',
      priceCents: 3650,
      stock: 10,
    })
    cheap = await createShopProduct({
      categoryId: category.id,
      name: 'IT Regalo 1,00',
      description: 'IT',
      priceCents: 100,
      stock: 20,
    })
    lastUnit = await createShopProduct({
      categoryId: category.id,
      name: 'IT Última unidad',
      description: 'IT',
      priceCents: 100,
      stock: 1,
    })
    // El cálculo del issue usa el 15 %: se fija y al final se restaura lo que había.
    originalTax = await setSimulatedTax({ enabled: true, rateBps: 1500 })
    authStorage.clear()
    buyerA = await newCustomer('a')
    buyerB = await newCustomer('b')
  }, 120_000)

  afterAll(async () => {
    await loginAsAdmin()
    if (originalTax) await setSimulatedTax(originalTax)
    authStorage.clear()
    customerStorage.clear()
  })

  describe('registro y acceso', () => {
    it('el registro público no acepta un rol y crea la cuenta como CLIENT', async () => {
      const email = `it-rol-${uniqueSuffix().toLowerCase()}@regalia.test`
      const withRole = await customerApiClient
        .post('/auth/register', {
          name: 'IT Intento ADMIN',
          email,
          password: 'Clave12345',
          role: 'ADMIN',
        })
        .catch((error: unknown) => error)
      expect(shopErrorInfo(withRole)).toEqual(
        expect.objectContaining({ status: 400, code: 'VALIDATION_ERROR' }),
      )

      await customerService.register({ name: 'IT Cliente', email, password: 'Clave12345' })
      expect((await customerService.login({ email, password: 'Clave12345' })).user.role).toBe(
        'CLIENT',
      )
    })

    it('un correo repetido se rechaza con su código', async () => {
      await expect(
        customerService.register({
          name: 'Otra',
          email: buyerA.user.email,
          password: 'Clave12345',
        }),
      ).rejects.toThrow('Ya existe una cuenta con este correo. Inicia sesión.')
    })

    it('el Shop no acepta cuentas ADMIN y un CLIENT no accede a la administración (403)', async () => {
      await expect(customerService.login(credentialsFor('ADMIN'))).rejects.toThrow(
        NOT_A_CUSTOMER_MESSAGE,
      )
      as(buyerA)
      const forbidden = await customerApiClient
        .get('/admin/catalog/products')
        .catch((error: unknown) => error)
      expect(shopErrorInfo(forbidden).status).toBe(403)
    })
  })

  describe('cotización', () => {
    it('$73,00 → IVA simulado 15 % $10,95 → envío $0 → total $83,95', async () => {
      as(buyerA)
      const quote = await checkoutService.quote(
        [{ productId: gift.id, quantity: 2 }],
        deliveryAt('10:00'),
      )

      expect(quote).toEqual(
        expect.objectContaining({
          subtotalCents: 7300,
          tax: expect.objectContaining({
            enabled: true,
            rateBps: 1500,
            ratePercent: 15,
            amountCents: 1095,
          }),
          shipping: expect.objectContaining({ status: 'FREE_INCLUDED', amountCents: 0 }),
          totalCents: 8395,
          quoteToken: expect.any(String),
        }),
      )
      expect(Date.parse(quote.validUntil) - Date.now()).toBeLessThanOrEqual(15 * 60 * 1000)
    })

    it('#33 · sin zona: un punto en el borde de la cobertura se cotiza', async () => {
      as(buyerA)
      expect((await shopService.evaluateCoverage(onBorder)).position).toBe('BOUNDARY')

      const quote = await checkoutService.quote(
        [{ productId: gift.id, quantity: 2 }],
        deliveryAt('10:00', onBorder),
      )

      expect(quote.totalCents).toBe(8395)
    })

    it('#33 · un punto fuera de la cobertura se rechaza (DELIVERY_OUTSIDE_COVERAGE) sin cotizar', async () => {
      as(buyerA)
      expect((await shopService.evaluateCoverage(OUTSIDE)).accepted).toBe(false)

      const error = await checkoutService
        .quote([{ productId: gift.id, quantity: 2 }], deliveryAt('10:00', OUTSIDE))
        .catch((reason: unknown) => reason)

      expect(shopErrorInfo(error)).toEqual(
        expect.objectContaining({ status: 422, code: 'DELIVERY_OUTSIDE_COVERAGE' }),
      )
    })

    it('si el ADMIN cambia o desactiva el IVA, el desglose cambia y la cotización anterior ya no se cobra', async () => {
      as(buyerA)
      const items = [{ productId: gift.id, quantity: 2 }]
      const delivery = deliveryAt('10:00')
      const before = await checkoutService.quote(items, delivery)

      await loginAsAdmin()
      await setSimulatedTax({ enabled: true, rateBps: 1200 })
      as(buyerA)
      expect((await checkoutService.quote(items, delivery)).totalCents).toBe(8176)
      const stale = await checkoutService
        .pay(crypto.randomUUID(), {
          items,
          delivery,
          quoteToken: before.quoteToken,
          paymentCard: APPROVED,
        })
        .catch((error: unknown) => error)
      expect(codeOf(stale)).toBe('SHOP_SETTINGS_CHANGED')

      await loginAsAdmin()
      await setSimulatedTax({ enabled: false, rateBps: 1200 })
      as(buyerA)
      expect(await checkoutService.quote(items, delivery)).toEqual(
        expect.objectContaining({
          totalCents: 7300,
          tax: expect.objectContaining({ enabled: false, amountCents: 0 }),
        }),
      )

      await loginAsAdmin()
      await setSimulatedTax({ enabled: true, rateBps: 1500 })
    })

    it('un precio cambiado después de cotizar exige volver a cotizar (PRICE_CHANGED), sin cobro', async () => {
      as(buyerA)
      const items = [{ productId: gift.id, quantity: 1 }]
      const delivery = deliveryAt('11:00')
      const quote = await checkoutService.quote(items, delivery)
      await loginAsAdmin()
      await setProductPrice(gift.id, 3700)
      as(buyerA)

      const changed = await checkoutService
        .pay(crypto.randomUUID(), {
          items,
          delivery,
          quoteToken: quote.quoteToken,
          paymentCard: APPROVED,
        })
        .catch((error: unknown) => error)
      expect(codeOf(changed)).toBe('PRICE_CHANGED')

      await loginAsAdmin()
      await setProductPrice(gift.id, 3650)
    })

    it.each([
      ['06:59', 'DELIVERY_OUTSIDE_HOURS'],
      ['07:00', null],
      ['17:00', null],
      ['17:01', 'DELIVERY_OUTSIDE_HOURS'],
    ])('hora de Ecuador %s → %s', async (time, code) => {
      as(buyerA)
      const result = await checkoutService
        .quote([{ productId: cheap.id, quantity: 1 }], deliveryAt(time))
        .catch((error: unknown) => error)
      if (code) expect(codeOf(result)).toBe(code)
      else expect(result).toEqual(expect.objectContaining({ totalCents: expect.any(Number) }))
    })
  })

  describe('pago ficticio', () => {
    it('una tarjeta sin saldo se rechaza sin crear pedido', async () => {
      as(buyerB)
      const before = (await customerOrdersService.list(1)).total
      const rejected = await payOnce(buyerB, cheap.id, EMPTY).catch((error: unknown) => error)

      expect(codeOf(rejected)).toBe('INSUFFICIENT_DEMO_FUNDS')
      as(buyerB)
      expect((await customerOrdersService.list(1)).total).toBe(before)
    })

    it('una tarjeta con saldo aprueba; repetir la misma clave no cobra ni crea otro pedido', async () => {
      const { key, quote, delivery, result } = await payOnce(buyerA, cheap.id)

      expect(result).toEqual(
        expect.objectContaining({
          status: 'SUCCEEDED',
          order: expect.objectContaining({ totalCents: quote.totalCents }),
          payment: expect.objectContaining({ status: 'APPROVED', cardLast4: '0001' }),
        }),
      )
      as(buyerA)
      const before = (await customerOrdersService.list(1)).total
      const replay = await checkoutService
        .pay(key, {
          items: [{ productId: cheap.id, quantity: 1 }],
          delivery,
          quoteToken: quote.quoteToken,
          paymentCard: APPROVED,
        })
        .catch((error: unknown) => error)
      // La misma petición con la misma clave devuelve el mismo pedido: no cobra otra vez.
      expect((replay as typeof result).order.id).toBe(result.order.id)
      expect((await customerOrdersService.list(1)).total).toBe(before)
      expect(await checkoutService.attempt(key)).toEqual({
        status: 'SUCCEEDED',
        orderId: result.order.id,
        errorCode: null,
      })
    })

    it('con 1 unidad y 2 compradores solo uno confirma; el otro recibe STOCK_UNAVAILABLE sin cargo', async () => {
      as(buyerA)
      const items = [{ productId: lastUnit.id, quantity: 1 }]
      const deliveryA = deliveryAt('10:00')
      const deliveryB = deliveryAt('10:00')
      const quoteA = await checkoutService.quote(items, deliveryA)
      as(buyerB)
      const quoteB = await checkoutService.quote(items, deliveryB)
      const ordersB = (await customerOrdersService.list(1)).total

      // Cada comprador con su propio token (cliente HTTP sin la sesión guardada), enviados a la vez.
      const payAs = (session: Session, delivery: DeliveryInput, quoteToken: string) =>
        axios
          .post(
            `${env.apiUrl}/shop/checkout`,
            { items, delivery, quoteToken, paymentCard: APPROVED },
            {
              headers: {
                Authorization: `Bearer ${session.token}`,
                'Idempotency-Key': crypto.randomUUID(),
              },
            },
          )
          .then(() => 'SUCCEEDED')
          .catch((error: unknown) => codeOf(error))
      const results = await Promise.all([
        payAs(buyerA, deliveryA, quoteA.quoteToken),
        payAs(buyerB, deliveryB, quoteB.quoteToken),
      ])

      expect(results.filter((result) => result === 'SUCCEEDED')).toHaveLength(1)
      expect(results.filter((result) => result === 'STOCK_UNAVAILABLE')).toHaveLength(1)
      if (results[1] !== 'SUCCEEDED') {
        as(buyerB)
        expect((await customerOrdersService.list(1)).total).toBe(ordersB)
      }
    })
  })

  describe('historial y comprobante', () => {
    it('detalle con seguimiento y comprobante simulado, con importes históricos aunque cambie el IVA', async () => {
      const { result } = await payOnce(buyerA, cheap.id)
      await loginAsAdmin()
      await setSimulatedTax({ enabled: true, rateBps: 1200 })
      as(buyerA)

      const detail = await customerOrdersService.detail(result.order.id)
      expect(detail).toEqual(
        expect.objectContaining({
          status: 'PENDING',
          totalCents: result.order.totalCents,
          taxRateBps: 1500,
          timeline: [expect.objectContaining({ code: 'PENDING' })],
        }),
      )
      // #33: el pedido se creó sin zona; la entrega es dirección + punto + hora.
      expect(detail.delivery).toEqual(expect.objectContaining({ zoneName: null, location: inside }))
      const receipt = await customerOrdersService.receipt(result.order.id)
      expect(receipt).toEqual(
        expect.objectContaining({
          disclaimer: 'COMPROBANTE DE COMPRA SIMULADO — SIN VALIDEZ TRIBUTARIA',
          totalCents: result.order.totalCents,
          tax: expect.objectContaining({ rateBps: 1500 }),
          payment: expect.objectContaining({ cardLast4: '0001' }),
        }),
      )
      expect(JSON.stringify(receipt)).not.toContain('9000000000000001')

      await loginAsAdmin()
      await setSimulatedTax({ enabled: true, rateBps: 1500 })
    })

    it('un CLIENT no ve los pedidos ni comprobantes de otro', async () => {
      const { result } = await payOnce(buyerA, cheap.id)
      as(buyerB)

      await expect(customerOrdersService.detail(result.order.id)).rejects.toThrow(
        ORDER_NOT_FOUND_MESSAGE,
      )
      await expect(customerOrdersService.receipt(result.order.id)).rejects.toThrow(
        ORDER_NOT_FOUND_MESSAGE,
      )
      const mine = await customerOrdersService.list(1)
      expect(mine.items.map(({ id }) => id)).not.toContain(result.order.id)
    })
  })
})
