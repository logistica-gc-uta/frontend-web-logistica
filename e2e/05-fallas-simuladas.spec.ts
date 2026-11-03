import { expect, test, type Page } from '@playwright/test'
import { apiAs, type Api } from './support/api'
import { createOrder, createProduct, createZone, routesWithOrder, type Zone } from './support/data'
import { uniqueSuffix } from './support/env'
import { evidence } from './support/evidence'
import { at, randomFarDay } from './support/time'

/**
 * SIMULADAS: el panel y el backend son reales, pero la falla se inyecta en la red del navegador
 * (`page.route` y `setOffline`), porque un 403, un 409, un tiempo de espera agotado o una caída de
 * red no se pueden provocar a voluntad en el backend. Comprueban que la pantalla nunca muestra un
 * éxito falso y que, al quitar la falla, el reintento funciona contra la API real.
 */
const DAY = randomFarDay()

let admin: Api
let zone: Zone
let orderId: string

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  admin = await apiAs('ADMIN')
  zone = await createZone(admin, 'Fallas')
  const productId = await createProduct(admin)
  ;({ id: orderId } = await createOrder(admin, {
    zone,
    productId,
    scheduledAt: at(DAY, '10:00'),
    k: 1,
  }))
})

test.afterAll(async () => admin?.dispose())

async function previewDay(page: Page) {
  await page.goto('/planificacion')
  const form = page.getByRole('form', { name: 'Datos de la propuesta' })
  await form.getByLabel('Día a planificar').fill(DAY)
  await form.getByLabel('Zona').selectOption(zone.id)
  await form.getByRole('button', { name: 'Previsualizar rutas' }).click()
}

test('[simulada] un 409 al confirmar la ruta no la da por guardada', async ({ page }) => {
  await page.route('**/api/v1/routes', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 409,
          json: { statusCode: 409, message: 'La propuesta cambió mientras se confirmaba' },
        })
      : route.fallback(),
  )
  await previewDay(page)
  const proposal = page.getByRole('article', { name: /^Ruta 1/ })

  await proposal.getByRole('button', { name: 'Confirmar ruta' }).click()

  await expect(proposal.getByRole('alert')).toContainText('Conflicto')
  await expect(proposal.getByRole('alert')).toContainText('Vuelve a previsualizar')
  await expect(proposal.getByText('Guardada como borrador (DRAFT)')).toHaveCount(0)
  await evidence(proposal, '10-simulada-409-confirmar')
  expect(await routesWithOrder(admin, orderId)).toEqual([])
})

test('[simulada] un tiempo de espera agotado se informa y el reintento funciona', async ({
  page,
}) => {
  test.setTimeout(120_000)
  // La API tarda más que el límite del cliente (30 s) en la primera consulta.
  let delayed = false
  await page.route('**/api/v1/route-proposals**', async (route) => {
    if (delayed) return route.fallback()
    delayed = true
    await new Promise((resolve) => setTimeout(resolve, 31_000))
    await route.abort('timedout').catch(() => undefined)
  })
  await previewDay(page)

  await expect(page.getByRole('alert')).toContainText('El servidor tardó demasiado en responder', {
    timeout: 45_000,
  })
  await expect(page.getByRole('heading', { name: `Propuesta para el ${DAY}` })).toHaveCount(0)

  await page.getByRole('button', { name: 'Previsualizar rutas' }).click()
  await expect(page.getByRole('heading', { name: `Propuesta para el ${DAY}` })).toBeVisible()
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

test('[simulada] sin conexión el alta del pedido falla sin éxito falso y al reintentar se registra una vez', async ({
  page,
}) => {
  const address = `E2E Sin red ${uniqueSuffix()}`
  const sent: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/orders/admin'))
      sent.push(request.url())
  })
  await page.route('**/api/v1/orders/admin', (route) => route.abort('internetdisconnected'))

  await page.goto('/pedidos')
  const form = page.getByRole('form', { name: 'Nuevo pedido' })
  await form.getByLabel('Nombre del destinatario').fill('E2E Destinatario')
  await form.getByLabel('Teléfono de contacto').fill('0991234567')
  await form.getByLabel('Zona').selectOption(zone.id)
  await form.getByLabel('Dirección de entrega').fill(address)
  await form.getByLabel('Fecha y hora de entrega (hora de Guayaquil)').fill(`${DAY}T11:00`)
  await form.getByLabel('Producto 1', { exact: true }).selectOption({ index: 1 })
  const map = form.locator('.location-picker__canvas')
  const box = (await map.boundingBox())!
  await map.click({ position: { x: box.width / 2 + 40, y: box.height / 2 + 30 } })
  await form.getByRole('button', { name: 'Confirmar ubicación' }).click()

  await form.getByRole('button', { name: 'Registrar pedido' }).click()
  await expect(form.getByRole('alert')).toHaveText('No se pudo conectar con el servidor')
  await expect(form.getByText('Pedido registrado correctamente')).toHaveCount(0)
  await evidence(form, '12-simulada-sin-conexion')

  // Al volver la conexión, lo escrito sigue ahí y el reintento registra el pedido real.
  await page.unroute('**/api/v1/orders/admin')
  const created = page.waitForResponse((r) => r.url().endsWith('/orders/admin'))
  await form.getByRole('button', { name: 'Registrar pedido' }).click()
  expect((await created).status()).toBe(201)
  await expect(form.getByText('Pedido registrado correctamente')).toBeVisible()
  expect(sent).toHaveLength(2)
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
