import { expect, test, type Page } from '@playwright/test'
import { apiAs, type Api } from './support/api'
import {
  createOrder,
  createProduct,
  createZone,
  getOrder,
  routesWithOrder,
  type Zone,
} from './support/data'
import { uniqueSuffix } from './support/env'
import { evidence } from './support/evidence'
import { at, randomFarDay } from './support/time'

/**
 * Flujo web completo contra la API real: alta de pedido con confirmación en el mapa → propuesta
 * Clarke & Wright (se puede repetir sin guardar) → ruta DRAFT confirmada una sola vez → corrección
 * de paradas auditada. Usa su propia zona y un día lejano; no asigna choferes.
 */
const DAY = randomFarDay()

let admin: Api
let zone: Zone
let productId: string
const extraOrders: { id: string; address: string }[] = []

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  admin = await apiAs('ADMIN')
  zone = await createZone(admin, 'Flujo')
  productId = await createProduct(admin)
  for (const k of [2, 3]) {
    extraOrders.push(
      await createOrder(admin, { zone, productId, scheduledAt: at(DAY, '10:00'), k }),
    )
  }
})

test.afterAll(async () => admin?.dispose())

async function previewDay(page: Page) {
  const form = page.getByRole('form', { name: 'Datos de la propuesta' })
  await form.getByLabel('Día a planificar').fill(DAY)
  await form.getByLabel('Zona').selectOption(zone.id)
  await form.getByRole('button', { name: 'Previsualizar rutas' }).click()
  await expect(page.getByRole('heading', { name: `Propuesta para el ${DAY}` })).toBeVisible()
}

test('del alta del pedido a la ruta DRAFT corregida', async ({ page }) => {
  test.info().annotations.push({ type: 'Día planificado', description: DAY })
  const address = `E2E Calle principal ${uniqueSuffix()}`
  let orderId = ''

  await test.step('registrar el pedido y confirmar su ubicación en el mapa', async () => {
    await page.goto('/pedidos')
    const form = page.getByRole('form', { name: 'Nuevo pedido' })
    await form.getByLabel('Nombre del destinatario').fill('E2E Destinataria')
    await form.getByLabel('Teléfono de contacto').fill('0991234567')
    await form.getByLabel('Zona').selectOption(zone.id)
    await form.getByLabel('Dirección de entrega').fill(address)
    await form.getByLabel('Fecha y hora de entrega (hora de Guayaquil)').fill(`${DAY}T10:00`)
    await form.getByLabel('Producto 1', { exact: true }).selectOption(productId)

    // Un clic en el mapa coloca el marcador; hay que confirmarlo antes de registrar.
    const map = form.locator('.location-picker__canvas')
    const box = (await map.boundingBox())!
    await map.click({ position: { x: box.width / 2 + 40, y: box.height / 2 + 30 } })
    await form.getByRole('button', { name: 'Confirmar ubicación' }).click()
    await expect(form.getByText('Ubicación confirmada')).toBeVisible()

    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith('/orders/admin') && response.request().method() === 'POST',
    )
    await form.getByRole('button', { name: 'Registrar pedido' }).click()
    orderId = ((await (await created).json()) as { id: string }).id

    await expect(
      form.getByRole('status').filter({ hasText: 'Pedido registrado correctamente' }),
    ).toBeVisible()
    await evidence(form, '02-pedido-registrado')
    expect((await getOrder(admin, orderId)).status).toBe('PENDING')
  })

  await test.step('previsualizar dos veces no guarda ninguna ruta', async () => {
    await page.goto('/planificacion')
    await previewDay(page)
    await previewDay(page)

    const proposal = page.getByRole('article').filter({ hasText: address })
    await expect(proposal).toBeVisible()
    for (const extra of extraOrders) await expect(proposal).toContainText(extra.address)
    expect(await routesWithOrder(admin, orderId)).toEqual([])
  })

  await test.step('confirmar la propuesta guarda una sola ruta DRAFT, aunque se pulse dos veces', async () => {
    const proposal = page.getByRole('article').filter({ hasText: address })
    await proposal.getByRole('button', { name: 'Confirmar ruta' }).dblclick()

    await expect(proposal.getByText('Guardada como borrador (DRAFT)')).toBeVisible()
    await evidence(proposal, '03-ruta-draft-confirmada')
    const routes = await routesWithOrder(admin, orderId)
    expect(routes).toHaveLength(1)
    expect(routes[0].status).toBe('DRAFT')
    expect(routes[0].stops.map((stop) => stop.orderId).sort()).toEqual(
      [orderId, ...extraOrders.map((order) => order.id)].sort(),
    )
  })

  await test.step('la propuesta ya no ofrece los pedidos guardados', async () => {
    await previewDay(page)

    await expect(page.getByRole('article').filter({ hasText: address })).toHaveCount(0)
    const saved = page.getByRole('listitem', { name: new RegExp(`· ${zone.code}$`) })
    await expect(saved).toContainText(address)
    await expect(saved).toContainText('Borrador')
  })

  await test.step('corregir el orden de las paradas de la ruta DRAFT', async () => {
    const [route] = await routesWithOrder(admin, orderId)
    const sequence = () =>
      routesWithOrder(admin, orderId).then(([current]) =>
        [...current.stops]
          .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
          .map((stop) => stop.orderId),
      )
    const before = await sequence()
    const first = route.orders.find((order) => order.id === before[0])!

    const saved = page.getByRole('listitem', { name: new RegExp(`· ${zone.code}$`) })
    await saved.getByRole('button', { name: 'Corregir paradas' }).click()
    const correction = page.getByRole('group', { name: /^Corregir / })
    await correction.getByRole('button', { name: `Bajar ${first.deliveryAddress}` }).click()
    await correction.getByLabel(/^Motivo de la corrección/).fill('E2E: el cliente pidió más tarde')
    await correction.getByRole('button', { name: 'Guardar nuevo orden' }).click()
    await expect(correction).toBeHidden()

    await expect.poll(sequence).toEqual([before[1], before[0], ...before.slice(2)])
    expect((await routesWithOrder(admin, orderId))[0].status).toBe('DRAFT')
  })
})
