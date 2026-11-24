import { expect, test } from '@playwright/test'
import { apiAs, type Api } from './support/api'
import {
  createAssignedRoute,
  createPricedProduct,
  createTodayOrder,
  hasTimeToday,
  openFullDaySchedule,
  routeById,
} from './support/aislado'
import { driverActions, getOrder, seedDriver } from './support/data'
import { uniqueSuffix } from './support/env'
import { at, formatTime12h, randomFarDay } from './support/time'

/**
 * Escenario E2E 10 · Reprogramación de pedidos pendientes y Retiro en tienda completo:
 * 1. Reprogramar un pedido pendiente desde Pedidos verificando el filtro dinámico Desde/Hasta.
 * 2. Completar el flujo de retiro en tienda tras una entrega fallida (disponibilidad -> contacto
 *    -> acordar retiro -> confirmar retiro físico -> pedido DELIVERED).
 */
let admin: Api
let driver: Awaited<ReturnType<typeof driverActions>>
let productId: string
let originalSchedule: { startTime: string; endTime: string } | null = null

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  admin = await apiAs('ADMIN')
  driver = await driverActions()
  productId = await createPricedProduct(admin)
})

test.afterAll(async () => {
  if (originalSchedule) {
    const latest = await admin.get<{
      version: number
      deliverySchedule: { startTime: string; endTime: string }
    }>('/admin/shop-settings')
    if (
      latest.deliverySchedule.startTime !== originalSchedule.startTime ||
      latest.deliverySchedule.endTime !== originalSchedule.endTime
    ) {
      await admin
        .patch('/admin/shop-settings', {
          expectedVersion: latest.version,
          deliverySchedule: {
            startTime: originalSchedule.startTime,
            endTime: originalSchedule.endTime,
          },
        })
        .catch(() => undefined)
    }
  }
  await driver?.dispose()
  await admin?.dispose()
})

test('Pedidos: reprogramar un pedido pendiente filtra Desde/Hasta y persiste la nueva fecha', async ({
  page,
}) => {
  const store = (await admin.get<{ location: { lat: number; lng: number } }>('/store-coverage'))
    .location
  const suffix = uniqueSuffix()
  const recipient = `E2E Reprog ${suffix}`
  const initialDay = randomFarDay()
  const targetDay = randomFarDay()
  const address = `E2E Reprogramar ${suffix}`
  const order = await admin.post<{ id: string }>(
    '/orders/admin',
    {
      buyer: { type: 'GUEST', name: recipient, contactPhone: '0991112233' },
      payment: { method: 'CASH' },
      deliveryAddress: address,
      items: [{ productId, quantity: 1 }],
      scheduledDeliveryDate: at(initialDay, '10:00'),
      deliveryLat: store.lat + 0.001,
      deliveryLng: store.lng - 0.001,
    },
    { 'Idempotency-Key': crypto.randomUUID() },
  )

  await page.goto('/admin/pedidos')
  await page.getByRole('button', { name: 'Ver pedidos registrados' }).click()
  const listDialog = page.getByRole('dialog', { name: 'Pedidos registrados' })
  await listDialog.getByLabel('Fecha de entrega').fill(initialDay)
  await listDialog.getByRole('button', { name: `Reprogramar pedido de ${recipient}` }).click()

  const drawer = page.getByRole('dialog', { name: 'Reprogramar pedido' })
  await expect(drawer).toBeVisible()
  await drawer.getByLabel(/Nuevo día|Día acordado/i).fill(targetDay)

  await drawer.getByLabel('Desde').click()
  await page.getByRole('option', { name: formatTime12h('14:00'), exact: true }).click()

  // «Hasta» solo debe mostrar horas posteriores a 14:00.
  await drawer.getByLabel('Hasta').click()
  await expect(page.getByRole('option', { name: formatTime12h('10:00'), exact: true })).toHaveCount(
    0,
  )
  await expect(page.getByRole('option', { name: formatTime12h('14:00'), exact: true })).toHaveCount(
    0,
  )
  await page.getByRole('option', { name: formatTime12h('15:30'), exact: true }).click()

  await drawer.getByLabel('Acuerdo con el cliente').fill('E2E 10: cliente pidió recibir por la tarde')
  await drawer.getByRole('button', { name: 'Guardar nueva fecha' }).click()
  await expect(drawer).toBeHidden()

  const updated = await getOrder(admin, order.id)
  expect(updated.scheduledDeliveryDate).toContain(targetDay)
})

test('Entregas fallidas: flujo completo de retiro en tienda hasta DELIVERED', async ({ page }) => {
  test.skip(!hasTimeToday(), 'Quedan menos de 40 minutos en el día de Guayaquil')
  const seed = await seedDriver(admin)
  if (!seed.isAvailable) {
    throw new Error('El chofer del seed no está disponible para probar retiro en tienda')
  }
  const settings = await admin.get<{
    deliverySchedule: { startTime: string; endTime: string }
  }>('/admin/shop-settings')
  originalSchedule = settings.deliverySchedule
  await openFullDaySchedule(admin)

  const order = await createTodayOrder(admin, { productId, label: 'RetiroTienda', k: 3 })
  const routeId = await createAssignedRoute(admin, {
    orderIds: [order.id],
    scheduledAt: order.scheduledAt,
    driverId: seed.id,
  })
  try {
    await driver.start(routeId)
    const route = await routeById(admin, routeId)
    const stop = route!.stops.find((s) => s.orderId === order.id)!
    await driver.fail(routeId, stop.id)
    await driver.complete(routeId)
    await driver.returnToDepot(routeId)

    await page.goto(`/admin/entregas-fallidas?pedido=${order.id}`)
    const card = page
      .getByRole('article', { name: /^Entrega fallida / })
      .filter({ has: page.locator(`a[href*="${order.id}"]`) })
    await expect(card).toBeVisible()

    // Paso 1: confirmar disponibilidad en tienda.
    await card.getByRole('button', { name: 'Confirmar disponibilidad en tienda' }).click()
    await card.getByLabel('Motivo o verificación en tienda').fill('E2E 10: paquete sano en bodega')
    await card.getByRole('button', { name: 'Sí, confirmar disponibilidad' }).click()
    await expect(card.getByText('Disponibilidad en tienda confirmada', { exact: true })).toBeVisible()

    // Paso 2: contactar al destinatario (sin acuerdo) para habilitar el camino de retiro en tienda.
    await card.getByLabel('No se logró acordar').check()
    await card.getByRole('button', { name: 'Registrar contacto' }).click()

    await card.getByLabel('Retiro en tienda').check()
    const pickupBox = card.getByRole('region', { name: /^Retiro en tienda/ })
    await pickupBox.getByLabel('El cliente retirará en tienda').check()
    await pickupBox.getByLabel('Respuesta del cliente').fill('E2E 10: cliente pasará hoy por el local')
    await pickupBox.getByRole('button', { name: 'Registrar respuesta' }).click()
    await expect(card.locator('.badge', { hasText: 'Pendiente de retiro en tienda' })).toBeVisible()

    // Paso 3: confirmar retiro físico -> pedido DELIVERED.
    await pickupBox.getByRole('button', { name: 'Confirmar retiro' }).click()
    await pickupBox.getByLabel('Cómo se confirmó el retiro').fill('E2E 10: retirado con cédula en mostrador')
    await pickupBox.getByRole('button', { name: 'Sí, el cliente lo retiró' }).click()

    await expect.poll(async () => (await getOrder(admin, order.id)).status).toBe('DELIVERED')
  } finally {
    await driver.complete(routeId).catch(() => undefined)
    await driver.returnToDepot(routeId).catch(() => undefined)
  }
})
