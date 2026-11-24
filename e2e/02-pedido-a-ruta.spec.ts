import { expect, test, type Page } from '@playwright/test'
import { openFullDaySchedule, setDeliverySchedule } from './support/aislado'
import { apiAs, type Api } from './support/api'
import { fillDeliveryDateTime, pickOrderProduct } from './support/controls'
import {
  createNamedProduct,
  createOrder,
  createZone,
  getOrder,
  routesWithOrder,
  type Zone,
} from './support/data'
import { uniqueSuffix } from './support/env'
import { evidence } from './support/evidence'
import { at, guayaquilSlotIn, guayaquilTimeIn, todayInGuayaquil } from './support/time'

/**
 * Flujo web completo contra la API real: alta de pedido con confirmación en el mapa → propuesta
 * Clarke & Wright (se puede repetir sin guardar) → ruta DRAFT confirmada una sola vez → corrección
 * de paradas auditada. Usa hoy porque el backend solo permite confirmar rutas del día operativo.
 */
const DAY = todayInGuayaquil()
const DELIVERY_TIME = guayaquilSlotIn(60)
const CAN_CONFIRM_TODAY = guayaquilTimeIn(0) < DELIVERY_TIME && DELIVERY_TIME <= '23:30'

let admin: Api
let originalSchedule: { startTime: string; endTime: string } | null = null
let zone: Zone
let product: { id: string; name: string }
const extraOrders: { id: string; address: string }[] = []

test.describe.configure({ mode: 'serial' })
test.skip(!CAN_CONFIRM_TODAY, 'No queda una franja futura dentro del horario operativo de hoy')

test.beforeAll(async () => {
  admin = await apiAs('ADMIN')
  originalSchedule = await openFullDaySchedule(admin)
  zone = await createZone(admin, 'Flujo')
  product = await createNamedProduct(admin)
  for (const k of [2, 3]) {
    extraOrders.push(
      await createOrder(admin, {
        zone,
        productId: product.id,
        scheduledAt: at(DAY, DELIVERY_TIME),
        k,
      }),
    )
  }
})

test.afterAll(async () => {
  if (originalSchedule) {
    await setDeliverySchedule(admin, originalSchedule.startTime, originalSchedule.endTime).catch(
      () => undefined,
    )
  }
  await admin?.dispose()
})

async function previewDay(page: Page) {
  const form = page.getByRole('form', { name: 'Datos de la propuesta' })
  await form.getByLabel('Día a planificar').fill(DAY)
  await form.getByRole('button', { name: 'Previsualizar rutas' }).click()
  await expect(page.getByRole('heading', { name: `Propuesta para el ${DAY}` })).toBeVisible()
}

test('del alta del pedido a la ruta DRAFT corregida', async ({ page }) => {
  test.info().annotations.push({ type: 'Día planificado', description: DAY })
  let address = ''
  let orderId = ''

  await test.step('registrar una venta de invitado en el panel y ver su comprobante', async () => {
    await page.goto('/admin/pedidos')
    const form = page.getByRole('form', { name: 'Nueva venta' })
    await form.getByLabel('Nombre del comprador').fill('E2E Compradora')
    await form.getByLabel('Teléfono del comprador').fill('0991234567')
    await form.getByRole('radio', { name: 'Efectivo' }).check()
    await form.getByLabel('Dirección de entrega').fill(`E2E Venta ${uniqueSuffix()}`)
    await fillDeliveryDateTime(form, page, DAY, DELIVERY_TIME)
    await pickOrderProduct(form, page, product.name)

    // Un clic en el mapa coloca el marcador; el servidor lo verifica y luego se confirma.
    const map = form.locator('.location-picker__canvas')
    const box = (await map.boundingBox())!
    await map.click({ position: { x: box.width / 2 + 40, y: box.height / 2 + 30 } })
    await expect(form.getByText('Dentro de la zona de entrega.')).toBeVisible()
    await form.getByRole('button', { name: 'Confirmar ubicación' }).click()
    await expect(form.getByText('Ubicación confirmada')).toBeVisible()

    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith('/orders/admin') && response.request().method() === 'POST',
    )
    await form.getByRole('button', { name: 'Registrar venta' }).click()
    const saleId = ((await (await created).json()) as { id: string }).id

    await expect(page.getByText('Venta registrada. Este es su comprobante.')).toBeVisible()
    await expect(page.getByText(/Pago declarado: Efectivo\./)).toBeVisible()
    await evidence(page.locator('.admin-receipt'), '02-venta-comprobante')
    const sale = await getOrder(admin, saleId)
    expect(sale.status).toBe('PENDING')
    // Sin zona (#42): la planificación lo agrupa por cobertura de tienda.
    expect(sale.zoneId).toBeNull()
  })

  await test.step('pedido planificable del día (con zona propia para aislar la propuesta)', async () => {
    const order = await createOrder(admin, {
      zone,
      productId: product.id,
      scheduledAt: at(DAY, DELIVERY_TIME),
      k: 1,
    })
    orderId = order.id
    address = order.address
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

    await expect(proposal.getByText('Guardada como borrador')).toBeVisible()
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
    await page.getByRole('button', { name: 'Ver rutas guardadas' }).click()
    const drawer = page.getByRole('dialog', { name: 'Rutas guardadas' })
    const saved = drawer.getByRole('listitem', { name: new RegExp(`· ${zone.code}$`) })
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

    const drawer = page.getByRole('dialog', { name: 'Rutas guardadas' })
    const saved = drawer.getByRole('listitem', { name: new RegExp(`· ${zone.code}$`) })
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
