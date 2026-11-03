import { expect, test, type Locator, type Page } from '@playwright/test'
import { apiAs, type Api } from './support/api'
import { createOrder, createProduct, createZone, type Zone } from './support/data'
import { uniqueSuffix } from './support/env'
import { evidence } from './support/evidence'
import { at, randomFarDay } from './support/time'

/**
 * Errores básicos del alta de pedidos: validaciones del formulario (no llegan a la API) y un
 * rechazo real del backend (otro pedido se llevó el stock) que nunca se presenta como éxito.
 */
let admin: Api
let zone: Zone
let productId: string

test.beforeAll(async () => {
  admin = await apiAs('ADMIN')
  zone = await createZone(admin, 'Validaciones')
  productId = await createProduct(admin, 1)
})

test.afterAll(async () => admin?.dispose())

/** Cuenta las altas de pedidos que salen hacia la API. */
function countOrderRequests(page: Page) {
  const sent: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/orders/admin'))
      sent.push(request.url())
  })
  return sent
}

async function placeMarker(form: Locator) {
  const map = form.locator('.location-picker__canvas')
  const box = (await map.boundingBox())!
  await map.click({ position: { x: box.width / 2 + 40, y: box.height / 2 + 30 } })
}

test('el formulario explica cada dato faltante y no envía nada', async ({ page }) => {
  const sent = countOrderRequests(page)
  await page.goto('/pedidos')
  const form = page.getByRole('form', { name: 'Nuevo pedido' })

  await form.getByRole('button', { name: 'Registrar pedido' }).click()

  for (const message of [
    'El nombre del destinatario es obligatorio',
    'El teléfono de contacto es obligatorio',
    'Selecciona una zona',
    'La dirección de entrega es obligatoria',
    'La fecha y hora de entrega son obligatorias',
    'Coloca el marcador en el mapa',
  ]) {
    await expect(form.locator('.field__error', { hasText: message })).toBeVisible()
  }
  await evidence(form, '04-validaciones-formulario')
  expect(sent).toEqual([])
})

test('una fecha pasada y una ubicación sin confirmar se rechazan antes de enviar', async ({
  page,
}) => {
  const sent = countOrderRequests(page)
  await page.goto('/pedidos')
  const form = page.getByRole('form', { name: 'Nuevo pedido' })
  await form.getByLabel('Nombre del destinatario').fill('E2E Destinatario')
  await form.getByLabel('Teléfono de contacto').fill('0991234567')
  await form.getByLabel('Zona').selectOption(zone.id)
  await form.getByLabel('Dirección de entrega').fill(`E2E Validación ${uniqueSuffix()}`)
  await form.getByLabel('Fecha y hora de entrega (hora de Guayaquil)').fill('2020-01-01T10:00')
  await form.getByLabel('Producto 1', { exact: true }).selectOption(productId)
  await placeMarker(form)

  await form.getByRole('button', { name: 'Registrar pedido' }).click()

  await expect(
    form.locator('.field__error', {
      hasText: 'La entrega debe programarse para una fecha y hora futuras',
    }),
  ).toBeVisible()
  await expect(
    form.locator('.field__error', { hasText: 'Confirma la ubicación en el mapa' }),
  ).toBeVisible()
  expect(sent).toEqual([])
})

test('si otro pedido se lleva el último stock, el backend rechaza el alta y no se muestra éxito', async ({
  page,
}) => {
  const day = randomFarDay()
  await page.goto('/pedidos')
  const form = page.getByRole('form', { name: 'Nuevo pedido' })
  await form.getByLabel('Nombre del destinatario').fill('E2E Destinatario')
  await form.getByLabel('Teléfono de contacto').fill('0991234567')
  await form.getByLabel('Zona').selectOption(zone.id)
  await form.getByLabel('Dirección de entrega').fill(`E2E Sin stock ${uniqueSuffix()}`)
  await form.getByLabel('Fecha y hora de entrega (hora de Guayaquil)').fill(`${day}T10:00`)
  await form.getByLabel('Producto 1', { exact: true }).selectOption(productId)
  await placeMarker(form)
  await form.getByRole('button', { name: 'Confirmar ubicación' }).click()

  // Mientras el formulario está abierto, otro pedido consume la única unidad del producto.
  await createOrder(admin, { zone, productId, scheduledAt: at(day, '10:00'), k: 1 })

  const response = page.waitForResponse((r) => r.url().endsWith('/orders/admin'))
  await form.getByRole('button', { name: 'Registrar pedido' }).click()
  expect((await response).ok()).toBe(false)

  await expect(form.getByRole('alert')).toBeVisible()
  await evidence(form, '05-rechazo-del-backend')
  await expect(form.getByText('Pedido registrado correctamente')).toHaveCount(0)
})
