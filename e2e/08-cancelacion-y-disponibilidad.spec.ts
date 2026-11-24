import { expect, test, type Page } from '@playwright/test'
import { ApiError, apiAs, type Api } from './support/api'
import {
  createAssignedRoute,
  createPricedProduct,
  createTodayOrder,
  hasTimeToday,
  incidentOf,
  isolatedEnvironmentProblem,
  openFullDaySchedule,
  routeById,
} from './support/aislado'
import { driverActions, getOrder, routesWithOrder, seedDriver } from './support/data'
import { evidence } from './support/evidence'

/**
 * #69 · Recorridos en navegador con frontend + backend real + PostgreSQL DESCARTABLE y datos
 * sintéticos. Solo corre en el entorno aislado (docs/evidencias/69-e2e-aislado.md):
 * 1. Planificación: una ruta asignada y sin iniciar se cancela con motivo; los pedidos vuelven a
 *    planificación sin cancelarse y la ruta conserva su historial. Una ruta iniciada no lo ofrece.
 * 2. Entregas fallidas: se puede contactar antes de confirmar la disponibilidad; reprogramar y
 *    acordar el retiro quedan bloqueados hasta confirmarla para el intento actual, la pantalla se
 *    actualiza y la confirmación persiste al recargar, sin reintento automático.
 */
const FOLDER = '69-e2e-aislado'
const problem = isolatedEnvironmentProblem()

let admin: Api
let driver: Awaited<ReturnType<typeof driverActions>>
let driverId: string
let productId: string
/** Pedido de la ruta que se cancela y pedido de la ruta que se inicia y falla. */
let cancelled: { id: string; address: string; scheduledAt: string }
let failed: { id: string; address: string; scheduledAt: string }
let cancelledRouteId: string
let startedRouteId: string

test.describe.configure({ mode: 'serial' })
test.skip(problem !== null, problem ?? '')
test.skip(!hasTimeToday(), 'Quedan menos de 40 minutos en el día de Guayaquil')

test.beforeAll(async () => {
  admin = await apiAs('ADMIN')
  driver = await driverActions()
  const seed = await seedDriver(admin)
  if (!seed.isAvailable)
    throw new Error('El chofer del seed no está disponible: reinicia la base aislada')
  driverId = seed.id
  await openFullDaySchedule(admin)
  productId = await createPricedProduct(admin)
})

test.afterAll(async () => {
  // El chofer termina y regresa la ruta iniciada: queda disponible para repetir la suite.
  if (startedRouteId) {
    await driver.complete(startedRouteId).catch(() => undefined)
    await driver.returnToDepot(startedRouteId).catch(() => undefined)
  }
  await driver?.dispose()
  await admin?.dispose()
})

async function openSavedRoutes(page: Page) {
  await page.goto('/admin/planificacion')
  await page.getByRole('button', { name: 'Ver rutas guardadas' }).click()
  return page.getByRole('dialog', { name: 'Rutas guardadas' })
}

/**
 * Caso de Entregas fallidas por el id del pedido (su enlace «Ver pedido»), no por el título: el título
 * sale de otra consulta y podría mostrarse un momento como «Pedido …».
 */
const failedCase = (page: Page, orderId: string) =>
  page
    .getByRole('article', { name: /^Entrega fallida / })
    .filter({ has: page.locator(`a[href*="${orderId}"]`) })

const savedRoute = (page: Page, address: string) =>
  page.locator('li.saved-route', { hasText: address })

test('Planificación cancela con motivo una ruta asignada sin iniciar y sus pedidos vuelven sin cancelarse', async ({
  page,
}) => {
  cancelled = await createTodayOrder(admin, { productId, label: 'Cancelada', k: 1 })
  cancelledRouteId = await createAssignedRoute(admin, {
    orderIds: [cancelled.id],
    scheduledAt: cancelled.scheduledAt,
    driverId,
  })
  const reason = 'E2E 69: vehículo con avería antes de salir'

  await openSavedRoutes(page)
  const route = savedRoute(page, cancelled.address)
  await expect(route).toContainText('Asignada (ASSIGNED)')
  await route.getByRole('button', { name: 'Cancelar ruta' }).click()
  const confirm = route.getByRole('group', { name: /^Cancelar / })
  await expect(confirm).toContainText('Los pedidos no se cancelan')
  await evidence(confirm, '01-cancelar-con-motivo', FOLDER)

  // Sin motivo no se envía nada.
  await confirm.getByRole('button', { name: 'Confirmar cancelación' }).click()
  await expect(confirm).toContainText('Escribe el motivo')
  expect((await routeById(admin, cancelledRouteId))?.status).toBe('ASSIGNED')

  await confirm.getByLabel(/^Motivo para cancelar/).fill(reason)
  await confirm.getByRole('button', { name: 'Confirmar cancelación' }).click()

  await expect(route).toContainText('Cancelada (CANCELLED)')
  await expect(route).toContainText(`Motivo de cancelación: ${reason}`)
  await expect(route.getByRole('button', { name: 'Cancelar ruta' })).toHaveCount(0)
  await evidence(route, '02-ruta-cancelada-con-historial', FOLDER)

  // En el servidor: la ruta queda cancelada con su motivo y conserva la parada (historial)...
  const saved = await routeById(admin, cancelledRouteId)
  expect(saved?.status).toBe('CANCELLED')
  expect(saved?.cancelReason).toBe(reason)
  expect(saved?.stops.map((stop) => stop.orderId)).toEqual([cancelled.id])
  // ...y el pedido NO se cancela comercialmente: vuelve a pendiente de planificar, sin otra ruta.
  expect((await getOrder(admin, cancelled.id)).status).toBe('PENDING')
  expect((await routesWithOrder(admin, cancelled.id)).map((r) => r.id)).toEqual([cancelledRouteId])
  // El chofer queda libre.
  expect((await seedDriver(admin)).isAvailable).toBe(true)

  // Persiste al recargar.
  await page.reload()
  await page.getByRole('button', { name: 'Ver rutas guardadas' }).click()
  await expect(savedRoute(page, cancelled.address)).toContainText(
    `Motivo de cancelación: ${reason}`,
  )
})

test('una ruta iniciada no ofrece «Cancelar ruta» y el servidor también la rechaza', async ({
  page,
}) => {
  failed = await createTodayOrder(admin, { productId, label: 'Iniciada', k: 2 })
  startedRouteId = await createAssignedRoute(admin, {
    orderIds: [failed.id],
    scheduledAt: failed.scheduledAt,
    driverId,
  })
  await driver.start(startedRouteId)

  await openSavedRoutes(page)
  const route = savedRoute(page, failed.address)
  await expect(route).toContainText('En curso (IN_PROGRESS)')
  await expect(route.getByRole('button', { name: 'Cancelar ruta' })).toHaveCount(0)
  await evidence(route, '03-ruta-iniciada-sin-cancelar', FOLDER)

  // Aserción negativa en la API: cancelar una ruta iniciada responde 409 y no cambia nada.
  const error = await admin
    .post('/dispatch/interventions', {
      requestId: crypto.randomUUID(),
      action: 'CANCEL_ROUTE',
      routeId: startedRouteId,
      reason: 'E2E 69: no debería permitirse',
    })
    .catch((caught: unknown) => caught)
  expect(error).toBeInstanceOf(ApiError)
  expect((error as ApiError).status).toBe(409)
  expect((await routeById(admin, startedRouteId))?.status).toBe('IN_PROGRESS')
})

test('Entregas fallidas: contacto antes de confirmar, reprogramar y retiro bloqueados, y disponibilidad confirmada que persiste', async ({
  page,
}) => {
  const route = await routeById(admin, startedRouteId)
  const stop = route!.stops.find((candidate) => candidate.orderId === failed.id)!
  await driver.fail(startedRouteId, stop.id)
  const before = await incidentOf(admin, failed.id)
  expect(before?.status).toBe('WAITING_STORE_READINESS')
  expect(before?.allowedActions.CONTACT.allowed).toBe(true)

  await page.goto(`/admin/entregas-fallidas?pedido=${failed.id}`)
  const card = failedCase(page, failed.id)
  await expect(
    page.getByText('Ese pedido ya no tiene una entrega fallida pendiente'),
    'el enlace ?pedido= no encontró el caso',
  ).toHaveCount(0)
  await expect(card).toBeVisible()

  // Antes de confirmar: reprogramar bloqueado con el motivo en español.
  await expect(card.getByRole('button', { name: 'Reprogramar con este acuerdo' })).toBeDisabled()
  await expect(card).toContainText(
    'Confirma primero que el pedido devuelto o un reemplazo está disponible en tienda.',
  )
  // Acordar el retiro también está bloqueado (rechazar el retiro sí se permite).
  await card.getByRole('radio', { name: 'Retiro en tienda' }).check()
  await expect(card.getByRole('radio', { name: 'El cliente retirará en tienda' })).toBeDisabled()
  await evidence(card, '04-retiro-bloqueado-antes-de-confirmar', FOLDER)
  await card.getByRole('radio', { name: 'Contactar al destinatario' }).check()

  // El contacto sí es posible antes de confirmar la disponibilidad.
  const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(
    new Date(Date.now() + 24 * 60 * 60 * 1000),
  )
  await card.getByRole('radio', { name: 'Se acordó una nueva entrega' }).check()
  await card.getByLabel('Qué se habló con el destinatario').fill('E2E 69: acepta recibir mañana')
  await card.getByLabel('Día acordado').fill(tomorrow)
  await card.getByLabel('Desde').click()
  await page.getByRole('option', { name: '10:00 a. m.' }).click()
  await card.getByLabel('Hasta').click()
  await page.getByRole('option', { name: '11:00 a. m.' }).click()
  await card.getByRole('button', { name: 'Registrar contacto' }).click()
  await expect(card).toContainText('Acuerdo registrado')

  // Con acuerdo, reprogramar SIGUE bloqueado hasta confirmar la disponibilidad.
  const readiness = card.getByRole('region', { name: /^Disponibilidad en tienda de / })
  const confirmReadiness = readiness.getByRole('button', {
    name: 'Confirmar disponibilidad en tienda',
  })
  await expect(confirmReadiness).toBeEnabled()
  await expect(card.getByRole('button', { name: 'Reprogramar con este acuerdo' })).toBeDisabled()
  await evidence(card, '05-contacto-registrado-reprogramar-bloqueado', FOLDER)

  // Confirmar disponibilidad para el intento actual.
  await confirmReadiness.click()
  await readiness
    .getByLabel('Motivo o verificación en tienda')
    .fill('E2E 69: pedido devuelto verificado en bodega')
  await readiness.getByRole('button', { name: 'Sí, confirmar disponibilidad' }).click()

  // La pantalla se actualiza con lo que devuelve el servidor. El aviso de éxito es una notificación
  // que se va sola (puede irse con la recarga en vivo): se comprueba lo que queda en la tarjeta.
  await expect(readiness).toContainText('Disponibilidad en tienda confirmada')
  await expect(card.getByRole('button', { name: 'Reprogramar con este acuerdo' })).toBeEnabled()
  await evidence(card, '06-disponibilidad-confirmada', FOLDER)

  // En el servidor: confirmada para el intento ACTUAL, sin reintento automático.
  const after = await incidentOf(admin, failed.id)
  expect(after?.status).not.toBe('WAITING_STORE_READINESS')
  expect(after?.readiness?.attemptId).toBe(before?.latestFailedAttemptId)
  expect(after?.allowedActions.RESCHEDULE.allowed).toBe(true)
  expect(after?.allowedActions.PICKUP_AGREE.allowed).toBe(true)
  expect((await routesWithOrder(admin, failed.id)).map((r) => r.id)).toEqual([startedRouteId])
  expect((await getOrder(admin, failed.id)).status).not.toBe('CANCELLED')

  // Persiste al recargar: página nueva con el enlace del caso (tras seleccionarlo, la pantalla quita
  // `?pedido=` de la URL, y con casos de ejecuciones anteriores mostraría primero otro).
  await page.goto(`/admin/entregas-fallidas?pedido=${failed.id}`)
  const reloaded = failedCase(page, failed.id)
  await expect(
    reloaded.getByRole('region', { name: /^Disponibilidad en tienda de / }),
  ).toContainText('Disponibilidad en tienda confirmada')
  await expect(reloaded.getByRole('button', { name: 'Reprogramar con este acuerdo' })).toBeEnabled()
  await evidence(reloaded, '07-persiste-al-recargar', FOLDER)
})
