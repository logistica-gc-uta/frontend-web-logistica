import { expect, test } from '@playwright/test'
import { apiAs, type Api } from './support/api'
import {
  createAssignedRoute,
  createPricedProduct,
  createTodayOrder,
  hasTimeToday,
  openFullDaySchedule,
} from './support/aislado'
import { driverActions, getOrder, seedDriver } from './support/data'

/**
 * Escenario E2E 09 · Emergencias en ruta y pérdidas/reemplazos inline:
 * 1. Declarar emergencia desde Seguimiento, confirmar retorno del producto, habilitar pedido para
 *    planificar, confirmar retorno del repartidor y cerrar la emergencia.
 * 2. Declarar pérdida o daño inline sobre una unidad en Emergencias (descuenta stock y prepara
 *    reemplazo), anular la pérdida por error (devuelve stock), confirmar retorno y habilitar.
 */
let admin: Api
let driver: Awaited<ReturnType<typeof driverActions>>
let driverId: string
let productId: string
let originalSchedule: { startTime: string; endTime: string } | null = null
const startedRoutes: string[] = []

test.describe.configure({ mode: 'serial' })
test.skip(!hasTimeToday(), 'Quedan menos de 40 minutos en el día de Guayaquil')

test.beforeAll(async () => {
  admin = await apiAs('ADMIN')
  driver = await driverActions()
  const seed = await seedDriver(admin)
  if (!seed.isAvailable) {
    throw new Error('El chofer del seed no está disponible: reinicia la base E2E')
  }
  driverId = seed.id
  const settings = await admin.get<{
    deliverySchedule: { startTime: string; endTime: string }
  }>('/admin/shop-settings')
  originalSchedule = settings.deliverySchedule
  await openFullDaySchedule(admin)
  productId = await createPricedProduct(admin)
})

test.afterAll(async () => {
  for (const routeId of startedRoutes) {
    await admin
      .post('/dispatch/interventions', {
        requestId: crypto.randomUUID(),
        action: 'EMERGENCY_DECLARE',
        routeId,
        reason: 'E2E 09 limpieza de ruta abierta',
      })
      .catch(() => undefined)
    await admin
      .post('/dispatch/interventions', {
        requestId: crypto.randomUUID(),
        action: 'EMERGENCY_DRIVER_RELEASE',
        routeId,
        reason: 'E2E 09 limpieza de chofer',
      })
      .catch(() => undefined)
    await driver.complete(routeId).catch(() => undefined)
    await driver.returnToDepot(routeId).catch(() => undefined)
  }
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

test('Emergencia completa: declara desde Seguimiento, recupera producto, habilita pedido, libera chofer y cierra', async ({
  page,
}) => {
  const order = await createTodayOrder(admin, { productId, label: 'EmergenciaRetorno', k: 1 })
  const routeId = await createAssignedRoute(admin, {
    orderIds: [order.id],
    scheduledAt: order.scheduledAt,
    driverId,
  })
  startedRoutes.push(routeId)
  await driver.start(routeId)

  // 1. Declarar emergencia desde Seguimiento.
  await page.goto(`/admin/seguimiento?ruta=${routeId}`)
  const routeCard = page.getByRole('article').filter({ hasText: order.address }).first()
  await expect(routeCard).toBeVisible()
  await routeCard.getByRole('button', { name: /Declarar emergencia/i }).click()

  const declareDialog = page.getByRole('dialog', { name: /Declarar emergencia/i })
  await declareDialog.getByLabel(/Qué pasó/i).fill('E2E 09: avería de neumático en ruta')
  await declareDialog.getByRole('button', { name: 'Confirmar emergencia' }).click()
  await expect(declareDialog).toBeHidden()

  // 2. Gestionar custodia y recuperación en Emergencias.
  await page.goto(`/admin/emergencias?ruta=${routeId}`)
  const orderSection = page.locator('section.emergency__order', { hasText: order.address })
  await expect(orderSection).toBeVisible()

  await orderSection.getByRole('button', { name: 'Confirmar retorno del producto' }).click()
  const returnDrawer = page.getByRole('dialog', { name: 'Confirmar retorno del producto' })
  await returnDrawer.getByLabel(/Motivo del retorno/i).fill('E2E 09: producto regresó intacto')
  await returnDrawer.getByRole('button', { name: 'Sí, volvió a la tienda' }).click()
  await expect(returnDrawer).toBeHidden()

  // 3. Habilitar para planificar.
  await orderSection.getByRole('button', { name: 'Habilitar para planificar' }).click()
  const requeueDrawer = page.getByRole('dialog', { name: 'Habilitar para planificar' })
  await requeueDrawer.getByLabel(/Motivo para habilitar/i).fill('E2E 09: listo para nueva ruta')
  await requeueDrawer.getByRole('button', { name: 'Habilitar' }).click()
  await expect(requeueDrawer).toBeHidden()
  await expect(orderSection.getByText('Habilitado para planificar.')).toBeVisible()

  // 4. Liberar repartidor y cerrar emergencia.
  await page.getByRole('button', { name: 'Confirmar retorno del repartidor' }).click()
  const driverDrawer = page.getByRole('dialog', { name: 'Confirmar retorno del repartidor' })
  await driverDrawer.getByLabel(/Motivo/i).fill('E2E 09: chofer regresó al depósito')
  await driverDrawer.getByRole('button', { name: /Confirmar|Sí/i }).click()
  await expect(driverDrawer).toBeHidden()

  await page.getByRole('button', { name: 'Cerrar emergencia' }).click()
  const closeDrawer = page.getByRole('dialog', { name: 'Cerrar emergencia' })
  await closeDrawer.getByLabel(/Motivo del cierre/i).fill('E2E 09: incidencia resuelta')
  await closeDrawer.locator('button.btn--primary', { hasText: 'Cerrar' }).click()
  await expect(closeDrawer).toBeHidden()

  // Verificación real en backend.
  const updatedOrder = await getOrder(admin, order.id)
  expect(updatedOrder.status).toBe('PENDING')
  expect((await seedDriver(admin)).isAvailable).toBe(true)
})

test('Emergencia con pérdida inline: declara pérdida (descuenta stock), anula por error (devuelve stock) y recupera', async ({
  page,
}) => {
  const order = await createTodayOrder(admin, { productId, label: 'EmergenciaPerdida', k: 2 })
  const routeId = await createAssignedRoute(admin, {
    orderIds: [order.id],
    scheduledAt: order.scheduledAt,
    driverId,
  })
  startedRoutes.push(routeId)
  await driver.start(routeId)
  await admin.post('/dispatch/interventions', {
    requestId: crypto.randomUUID(),
    action: 'EMERGENCY_DECLARE',
    routeId,
    reason: 'E2E 09: incidente para probar pérdida inline',
  })

  async function productStock() {
    const list = await admin.get<{ id: string; stock: number }[]>('/products')
    const found = list.find((p) => p.id === productId)
    if (!found) throw new Error(`Producto ${productId} no encontrado`)
    return found.stock
  }

  const stockBefore = await productStock()

  await page.goto(`/admin/emergencias?ruta=${routeId}`)
  const orderSection = page.locator('section.emergency__order', { hasText: order.address })
  await expect(orderSection).toBeVisible()

  // 1. Declarar pérdida o daño inline sin salir de Emergencias.
  await orderSection.getByRole('button', { name: 'Declarar pérdida o daño' }).click()
  const lossDrawer = page.getByRole('dialog', { name: 'Declarar pérdida o daño' })
  await lossDrawer.getByLabel(/Motivo de la pérdida/i).fill('E2E 09: caja golpeada en choque')
  await lossDrawer.getByRole('button', { name: 'Sí, declarar pérdida' }).click()
  await expect(lossDrawer).toBeHidden()

  await expect(orderSection.getByText('Perdida · reemplazo preparado')).toBeVisible()
  expect(await productStock()).toBe(stockBefore - 1)

  // 2. Anular pérdida por error: devuelve el reemplazo al stock y vuelve a pendiente.
  await orderSection.getByRole('button', { name: 'Anular pérdida (fue un error)' }).click()
  const cancelDrawer = page.getByRole('dialog', { name: 'Anular pérdida (fue un error)' })
  await cancelDrawer.getByLabel(/Motivo para anular/i).fill('E2E 09: el producto estaba sano')
  await cancelDrawer.getByRole('button', { name: 'Anular pérdida' }).click()
  await expect(cancelDrawer).toBeHidden()

  expect(await productStock()).toBe(stockBefore)

  // 3. Confirmar retorno y habilitar para planificar.
  await orderSection.getByRole('button', { name: 'Confirmar retorno del producto' }).click()
  const returnDrawer = page.getByRole('dialog', { name: 'Confirmar retorno del producto' })
  await returnDrawer.getByLabel(/Motivo del retorno/i).fill('E2E 09: confirmado sano en bodega')
  await returnDrawer.getByRole('button', { name: 'Sí, volvió a la tienda' }).click()
  await expect(returnDrawer).toBeHidden()

  await orderSection.getByRole('button', { name: 'Habilitar para planificar' }).click()
  const requeueDrawer = page.getByRole('dialog', { name: 'Habilitar para planificar' })
  await requeueDrawer.getByLabel(/Motivo para habilitar/i).fill('E2E 09: listo tras anular pérdida')
  await requeueDrawer.getByRole('button', { name: 'Habilitar' }).click()
  await expect(requeueDrawer).toBeHidden()

  // Liberar chofer para dejar limpio el entorno.
  await page.getByRole('button', { name: 'Confirmar retorno del repartidor' }).click()
  const driverDrawer = page.getByRole('dialog', { name: 'Confirmar retorno del repartidor' })
  await driverDrawer.getByLabel(/Motivo/i).fill('E2E 09: chofer de regreso')
  await driverDrawer.getByRole('button', { name: /Confirmar|Sí/i }).click()
  await expect(driverDrawer).toBeHidden()
  expect((await seedDriver(admin)).isAvailable).toBe(true)
})
