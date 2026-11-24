import { expect, test, type Page } from '@playwright/test'
import { openFullDaySchedule, setDeliverySchedule } from './support/aislado'
import { apiAs, type Api } from './support/api'
import { fillDeliveryDateTime, pickOrderProduct } from './support/controls'
import {
  createNamedProduct,
  createOrder,
  createZone,
  routesWithOrder,
  type Zone,
} from './support/data'
import { uniqueSuffix } from './support/env'
import { evidence } from './support/evidence'
import { at, guayaquilSlotIn, guayaquilTimeIn, randomFarDay, todayInGuayaquil } from './support/time'

/**
 * SIMULADAS: el panel y el backend son reales, pero la falla se inyecta en la red del navegador
 * (`page.route` y `setOffline`), porque un 403, un 409, un tiempo de espera agotado o una caída de
 * red no se pueden provocar a voluntad en el backend. Comprueban que la pantalla nunca muestra un
 * éxito falso y que, al quitar la falla, el reintento funciona contra la API real.
 */
const DAY = todayInGuayaquil()
const DELIVERY_TIME = guayaquilSlotIn(60)
const CAN_CONFIRM_TODAY = guayaquilTimeIn(0) < DELIVERY_TIME && DELIVERY_TIME <= '23:30'
const FUTURE_DAY = randomFarDay()

let admin: Api
let originalSchedule: { startTime: string; endTime: string } | null = null
let zone: Zone
let orderId: string
let orderAddress: string
let product: { id: string; name: string }

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  admin = await apiAs('ADMIN')
  if (CAN_CONFIRM_TODAY) originalSchedule = await openFullDaySchedule(admin)
  zone = await createZone(admin, 'Fallas')
  product = await createNamedProduct(admin)
  const created = await createOrder(admin, {
    zone,
    productId: product.id,
    scheduledAt: at(CAN_CONFIRM_TODAY ? DAY : FUTURE_DAY, CAN_CONFIRM_TODAY ? DELIVERY_TIME : '10:00'),
    k: 1,
  })
  orderId = created.id
  orderAddress = created.address
})

test.afterAll(async () => {
  if (originalSchedule) {
    await setDeliverySchedule(admin, originalSchedule.startTime, originalSchedule.endTime).catch(
      () => undefined,
    )
  }
  await admin?.dispose()
})

async function previewDay(page: Page, day = CAN_CONFIRM_TODAY ? DAY : FUTURE_DAY) {
  await page.goto('/planificacion')
  const form = page.getByRole('form', { name: 'Datos de la propuesta' })
  await form.getByLabel('Día a planificar').fill(day)
  await form.getByRole('button', { name: 'Previsualizar rutas' }).click()
}

test('[simulada] un 409 al confirmar la ruta no la da por guardada', async ({ page }) => {
  test.skip(!CAN_CONFIRM_TODAY, 'No queda una franja futura dentro del horario operativo de hoy')
  await page.route('**/api/v1/routes', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 409,
          json: { statusCode: 409, message: 'La propuesta cambió mientras se confirmaba' },
        })
      : route.fallback(),
  )
  await previewDay(page, DAY)
  const proposal = page.getByRole('article').filter({ hasText: orderAddress })

  await proposal.getByRole('button', { name: 'Confirmar ruta' }).click()

  await expect(proposal.getByRole('alert')).toContainText('Conflicto')
  await expect(proposal.getByRole('alert')).toContainText('Vuelve a previsualizar')
  await expect(proposal.getByText('Guardada como borrador')).toHaveCount(0)
  await evidence(proposal, '10-simulada-409-confirmar')
  expect(await routesWithOrder(admin, orderId)).toEqual([])
})

test('[simulada] un tiempo de espera agotado se informa y el reintento funciona', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const targetDay = CAN_CONFIRM_TODAY ? DAY : FUTURE_DAY
  // La API tarda más que el límite del cliente (30 s) en la primera consulta.
  let delayed = false
  await page.route('**/api/v1/route-proposals?*', async (route) => {
    if (delayed) return route.fallback()
    delayed = true
    await new Promise((resolve) => setTimeout(resolve, 31_000))
    await route.abort('timedout').catch(() => undefined)
  })
  await previewDay(page, targetDay)

  await expect(
    page.getByRole('alert').filter({ hasText: 'El servidor tardó demasiado en responder' }),
  ).toBeVisible({
    timeout: 45_000,
  })
  await expect(page.getByRole('heading', { name: `Propuesta para el ${targetDay}` })).toHaveCount(0)

  await page.getByRole('button', { name: 'Previsualizar rutas' }).click()
  await expect(page.getByRole('heading', { name: `Propuesta para el ${targetDay}` })).toBeVisible()
})

test('[simulada] un 403 en la bandeja se muestra y al reintentar carga la real', async ({
  page,
}) => {
  await page.route('**/api/v1/dispatch/inbox**', (route) =>
    route.fulfill({ status: 403, json: { statusCode: 403, message: 'Forbidden resource' } }),
  )
  await page.goto('/urgencias')

  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Bandeja de urgencias' })).toBeVisible()
  await expect(page.getByRole('article', { name: /^Urgencia / })).toHaveCount(0)
  await evidence(page, '11-simulada-403-bandeja')

  await page.unroute('**/api/v1/dispatch/inbox**')
  await page.getByRole('button', { name: 'Reintentar' }).first().click()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('[simulada] sin conexión la venta no se da por registrada y al reenviarla se registra una sola vez', async ({
  page,
}) => {
  const address = `E2E Sin red ${uniqueSuffix()}`
  const sent: { url: string; key: string | null }[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/orders/admin'))
      sent.push({ url: request.url(), key: request.headers()['idempotency-key'] ?? null })
  })
  await page.route('**/api/v1/orders/admin', (route) => route.abort('internetdisconnected'))

  await page.goto('/admin/pedidos')
  const form = page.getByRole('form', { name: 'Nueva venta' })
  await form.getByLabel('Nombre del comprador').fill('E2E Comprador')
  await form.getByLabel('Teléfono del comprador').fill('0991234567')
  await form.getByRole('radio', { name: 'Efectivo' }).check()
  await form.getByLabel('Dirección de entrega').fill(address)
  await fillDeliveryDateTime(form, page, FUTURE_DAY, '11:00')
  await pickOrderProduct(form, page, product.name)
  const map = form.locator('.location-picker__canvas')
  const box = (await map.boundingBox())!
  await map.click({ position: { x: box.width / 2 + 40, y: box.height / 2 + 30 } })
  await expect(form.getByText('Dentro de la zona de entrega.')).toBeVisible()
  await form.getByRole('button', { name: 'Confirmar ubicación' }).click()

  // La venta no llegó: se consulta el intento con la misma clave y se dice que no se registró.
  await form.getByRole('button', { name: 'Registrar venta' }).click()
  await expect(form.getByRole('alert')).toContainText('La venta no llegó a registrarse')
  await expect(page.getByText('Venta registrada')).toHaveCount(0)
  await evidence(form, '12-simulada-sin-conexion')

  // Al volver la conexión, lo escrito sigue ahí y el reenvío usa la misma clave.
  await page.unroute('**/api/v1/orders/admin')
  const created = page.waitForResponse((r) => r.url().endsWith('/orders/admin'))
  await form.getByRole('button', { name: 'Registrar venta' }).click()
  expect((await created).status()).toBe(201)
  await expect(page.getByText('Venta registrada. Este es su comprobante.')).toBeVisible()
  expect(sent).toHaveLength(2)
  expect(sent[1].key).toBe(sent[0].key)
})

test('[simulada] el seguimiento avisa la pérdida de conexión y se recupera solo', async ({
  page,
}) => {
  // El websocket pasa por Playwright: mientras `down` es verdadero, se corta y no deja reconectar.
  let down = false
  const sockets: { close: () => Promise<void> }[] = []
  await page.routeWebSocket(/\/socket\.io\//, (ws) => {
    if (down) return void ws.close()
    ws.connectToServer()
    sockets.push(ws)
  })
  await page.route(/\/socket\.io\/.*transport=polling/, (route) =>
    down ? route.abort('internetdisconnected') : route.fallback(),
  )

  await page.goto('/seguimiento')
  const status = page.locator('.connection')
  await expect(status).toContainText('En vivo')

  down = true
  await Promise.all(sockets.map((ws) => ws.close()))
  await expect(status).toContainText('Conexión perdida')
  await evidence(page, '13-simulada-conexion-perdida')

  down = false
  await expect(status).toContainText('Conexión recuperada', { timeout: 30_000 })
})
