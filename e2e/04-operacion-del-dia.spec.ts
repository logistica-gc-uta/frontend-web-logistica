import { expect, test } from '@playwright/test'
import { openFullDaySchedule, setDeliverySchedule } from './support/aislado'
import { ApiError, apiAs, type Api } from './support/api'
import { findInStepNav, pickSelectMenu } from './support/controls'
import {
  createOrder,
  createProduct,
  createZone,
  driverActions,
  getOrder,
  planAndAssign,
  seedDriver,
  stopOf,
  type RawRoute,
  type Zone,
} from './support/data'
import { evidence } from './support/evidence'
import {
  at,
  formatTime12h,
  guayaquilSlotIn,
  guayaquilTimeIn,
  todayInGuayaquil,
} from './support/time'

/**
 * Operación del día con el chofer del seed, contra la API real. El chofer actúa con la API y los
 * mismos endpoints que la app Flutter (Playwright no prueba la app móvil); todo lo demás se hace y
 * se comprueba en el panel web:
 * R1 en curso (no se modifica) → urgencia sin cupo → seguimiento de entregas, visita fallida y
 * regreso del chofer → gestión de la entrega fallida → R2 entregada sin perder la visita de R1.
 * Necesita unas 3 horas libres dentro del horario operativo de Guayaquil; si no, se omite.
 */
const TODAY = todayInGuayaquil()
const FIRST_VISIT = guayaquilTimeIn(20)
const AGREED_FROM = guayaquilSlotIn(60)
const AGREED_TO = guayaquilSlotIn(90)
const HAS_TIME_TODAY =
  guayaquilTimeIn(0) < FIRST_VISIT &&
  FIRST_VISIT < AGREED_FROM &&
  AGREED_FROM < AGREED_TO &&
  AGREED_TO <= '23:30'

let admin: Api
let originalSchedule: { startTime: string; endTime: string } | null = null
let driver: Awaited<ReturnType<typeof driverActions>>
let zone: Zone
let productId: string
let driverId: string
let delivered: { id: string; address: string }
let failed: { id: string; address: string }
let r1: RawRoute
/** Rutas que el chofer debe cerrar al final para quedar disponible. */
const openRoutes = new Set<string>()

test.describe.configure({ mode: 'serial' })
test.skip(!HAS_TIME_TODAY, 'Quedan menos de 3 horas en el día de Guayaquil')

test.beforeAll(async () => {
  admin = await apiAs('ADMIN')
  const seed = await seedDriver(admin)
  if (!seed.isAvailable) {
    throw new Error('El chofer del seed no está disponible: confirma su regreso o recrea la base.')
  }
  originalSchedule = await openFullDaySchedule(admin)
  driverId = seed.id
  driver = await driverActions()
  zone = await createZone(admin, 'Operación')
  productId = await createProduct(admin)

  delivered = await createOrder(admin, {
    zone,
    productId,
    scheduledAt: at(TODAY, FIRST_VISIT),
    k: 1,
  })
  failed = await createOrder(admin, { zone, productId, scheduledAt: at(TODAY, FIRST_VISIT), k: 2 })
  r1 = await planAndAssign(admin, { zone, date: TODAY, orderId: failed.id, driverId })
  openRoutes.add(r1.id)
  await driver.start(r1.id)
})

test.afterAll(async () => {
  // Pase lo que pase, el chofer resuelve y cierra lo que quedó abierto para no quedar retenido.
  for (const routeId of openRoutes) {
    const routes = await admin?.get<RawRoute[]>('/routes').catch(() => [])
    const current = routes?.find((route) => route.id === routeId)
    const stops = [...(current?.stops ?? [])].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
    for (const stop of stops) {
      if (!stop.outcome || stop.outcome === 'PENDING') {
        await driver?.deliver(stop.orderId).catch(() => undefined)
      }
    }
    await driver?.complete(routeId).catch(() => undefined)
    await driver?.returnToDepot(routeId).catch(() => undefined)
  }
  if (originalSchedule) {
    await setDeliverySchedule(admin, originalSchedule.startTime, originalSchedule.endTime).catch(
      () => undefined,
    )
  }
  await driver?.dispose()
  await admin?.dispose()
})

test('una ruta en curso no se modifica y una urgencia sin cupo queda pendiente con su motivo', async ({
  page,
}) => {
  test.info().annotations.push({ type: 'Zona', description: zone.code })
  const urgent = await createOrder(admin, {
    zone,
    productId,
    scheduledAt: at(TODAY, FIRST_VISIT),
    k: 3,
  })

  await page.goto('/urgencias')
  const card = page.getByRole('article', { name: `Urgencia ${urgent.address}` })
  await expect(card).toBeVisible()
  await expect(card).toContainText('Pendiente (PENDING)')
  // R1 ya se inició: no puede recibirlo.
  await expect(card.locator('.badge')).not.toHaveText('Insertar en una ruta')

  await page.getByRole('button', { name: 'Ver rutas de hoy' }).click()
  const routesDrawer = page.getByRole('dialog', { name: 'Rutas de hoy' })
  const started = routesDrawer.getByRole('listitem', { name: new RegExp(`· ${zone.code}$`) })
  await expect(started).toContainText('En curso')
  await expect(started.getByRole('button')).toHaveCount(0)
  await evidence(started, '06-urgencia-sin-cupo-y-ruta-en-curso')
  await routesDrawer.getByRole('button', { name: 'Cerrar' }).click()
  await expect(routesDrawer).toBeHidden()

  // La API también rechaza corregir una ruta en curso, y sus paradas no cambian.
  const reorder = admin.post('/dispatch/interventions', {
    requestId: crypto.randomUUID(),
    action: 'REORDER',
    routeId: r1.id,
    orderIds: [...r1.orders.map((order) => order.id)].reverse(),
    reason: 'E2E: intento sobre una ruta en curso',
  })
  await expect(reorder).rejects.toMatchObject({ status: 409 } satisfies Partial<ApiError>)
  expect((await stopOf(admin, r1.id, failed.id))?.outcome).not.toBe('SUCCESSFUL')

  // Si hay otro chofer libre se propone una salida nueva; el ADMIN la rechaza con motivo.
  const reject = card.getByRole('button', { name: 'Rechazar propuesta' })
  if (await reject.isVisible()) {
    await card
      .getByLabel(`Motivo de la decisión para ${urgent.address}`)
      .fill('E2E: se despacha mañana')
    await reject.click()
    await page.getByRole('button', { name: 'Ver decisiones registradas' }).click()
    await expect(
      page.getByRole('dialog', { name: 'Decisiones registradas hoy' }),
    ).toContainText('E2E: se despacha mañana')
  } else {
    test.info().annotations.push({ type: 'Urgencia', description: 'Bloqueada: sin chofer libre' })
  }
  expect((await getOrder(admin, urgent.id)).status).toBe('PENDING')
})

test('el seguimiento separa entregas, visitas fallidas y la disponibilidad del chofer', async ({
  page,
}) => {
  await page.goto(`/seguimiento?ruta=${r1.id}`)
  const card = page.getByRole('article', { name: new RegExp(`· ${zone.code}$`) })
  await expect(page.getByRole('status').filter({ hasText: 'En vivo' })).toBeVisible()
  await expect(card).toContainText('0 de 2 entregados')

  // Cada avance del chofer llega sin recargar la página.
  await driver.deliver(delivered.id)
  await expect(card).toContainText('1 de 2 entregados')

  await driver.fail(r1.id, (await stopOf(admin, r1.id, failed.id))!.id)
  await expect(card).toContainText('Visita fallida: destinatario ausente')
  await expect(card).toContainText('1 de 2 entregados')

  await driver.complete(r1.id)
  await expect(card).toContainText('Completada')
  await expect(card).toContainText('Retornando al depósito: todavía no está disponible')
  await evidence(card, '07-chofer-retornando')
  expect((await seedDriver(admin)).isAvailable).toBe(false)

  await driver.returnToDepot(r1.id)
  openRoutes.delete(r1.id)
  await expect(card).toContainText('Regresó al depósito y está disponible')
  expect((await seedDriver(admin)).isAvailable).toBe(true)
})

test('la entrega fallida se gestiona aparte y solo se reprograma con un acuerdo', async ({
  page,
}) => {
  await test.step('no aparece como urgencia ni como entregada o cancelada', async () => {
    await page.goto('/urgencias')
    await expect(page.getByRole('heading', { name: 'Bandeja de urgencias' })).toBeVisible()
    await expect(page.getByRole('article', { name: `Urgencia ${failed.address}` })).toHaveCount(0)
    expect(['DELIVERED', 'CANCELLED']).not.toContain((await getOrder(admin, failed.id)).status)
  })

  const card = page
    .getByRole('article', { name: /^Entrega fallida / })
    .filter({ has: page.locator(`a[href*="${failed.id}"]`) })
  const rescheduleButton = card.getByRole('button', { name: 'Reprogramar con este acuerdo' })

  await test.step('la bandeja muestra el intento con su motivo y la ruta original', async () => {
    await page.goto(`/admin/entregas-fallidas?pedido=${failed.id}`)
    await expect(page.getByRole('heading', { name: 'Pendientes de gestión' })).toBeVisible()
    await expect(card).toContainText(
      /Esperando disponibilidad en tienda|Entrega pendiente de gestión/,
    )
    await expect(card).toContainText('Destinatario ausente', { ignoreCase: true })
    await card.getByText('Ver historial del pedido').click()
    await expect(card).toContainText(zone.code)
    await expect(rescheduleButton).toBeDisabled()
  })

  await test.step('un contacto sin acuerdo no habilita la reprogramación', async () => {
    await card.getByLabel('No se logró acordar').check()
    await card.getByRole('button', { name: 'Registrar contacto' }).click()

    await expect(card.getByRole('list', { name: /^Historial de / })).toContainText(
      'No se logró acordar con el destinatario',
    )
    await expect(rescheduleButton).toBeDisabled()
  })

  await test.step('con día y franja acordados se reprograma y el pedido vuelve a PENDING', async () => {
    const reasonInput = card.getByLabel('Motivo o verificación en tienda')
    await expect(async () => {
      if (!(await reasonInput.isVisible())) {
        await card.getByRole('button', { name: 'Confirmar disponibilidad en tienda' }).click()
      }
      await expect(reasonInput).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 10_000 })
    await reasonInput.fill('E2E 04: producto sano en tienda')
    await card.getByRole('button', { name: 'Sí, confirmar disponibilidad' }).click()
    await expect(card.getByText('Disponibilidad en tienda confirmada', { exact: true })).toBeVisible()

    await card.getByLabel('Se acordó una nueva entrega').check()
    await card.getByLabel('Qué se habló con el destinatario').fill('E2E: acordó la tarde')
    await card.getByLabel('Día acordado').fill(TODAY)
    await pickSelectMenu(card, page, 'Desde', formatTime12h(AGREED_FROM))
    await pickSelectMenu(card, page, 'Hasta', formatTime12h(AGREED_TO))
    await card.getByRole('button', { name: 'Registrar contacto' }).click()

    await expect(card).toContainText('Acuerdo registrado')
    await expect(rescheduleButton).toBeEnabled()
    await evidence(card, '08-entrega-fallida-con-acuerdo')
    await rescheduleButton.click()

    await expect(page.getByRole('status').filter({ hasText: 'reprogramado' })).toBeVisible()
    await expect(card).toHaveCount(0)
    const order = await getOrder(admin, failed.id)
    expect(order.status).toBe('PENDING')
    expect(Date.parse(order.scheduledDeliveryDate ?? '')).toBe(Date.parse(at(TODAY, AGREED_FROM)))
  })

  await test.step('tras entregarse en R2 conserva la visita fallida de R1', async () => {
    const r2 = await planAndAssign(admin, { zone, date: TODAY, orderId: failed.id, driverId })
    openRoutes.add(r2.id)
    await driver.start(r2.id)
    for (const order of r2.orders) await driver.deliver(order.id)
    await driver.complete(r2.id)
    await driver.returnToDepot(r2.id)
    openRoutes.delete(r2.id)

    await page.goto(`/seguimiento?ruta=${r1.id}`)
    await expect(page.getByRole('status').filter({ hasText: 'En vivo' })).toBeVisible()
    const r1Visit = page
      .getByRole('article', { name: new RegExp(`· ${zone.code}$`) })
      .locator('li', { hasText: failed.address })
      .filter({ hasText: 'Visita fallida: destinatario ausente' })
    await expect(r1Visit).toHaveCount(1)
    await evidence(r1Visit.locator('..'), '09-historial-r1-fallida-r2-entregada')

    await page.goto(`/seguimiento?ruta=${r2.id}`)
    const r2Visit = page
      .getByRole('article', { name: new RegExp(`· ${zone.code}$`) })
      .locator('li', { hasText: failed.address })
      .filter({ hasText: 'Entregado' })
    await expect(r2Visit).toHaveCount(1)

    expect((await stopOf(admin, r1.id, failed.id))?.outcome).toBe('FAILED')
    expect((await stopOf(admin, r2.id, failed.id))?.outcome).toBe('SUCCESSFUL')
    expect((await getOrder(admin, failed.id)).status).toBe('DELIVERED')
    expect((await seedDriver(admin)).isAvailable).toBe(true)
  })
})
