import { expect, test, type Locator, type Page } from '@playwright/test'
import { setDeliverySchedule } from './support/aislado'
import { apiAs, type Api } from './support/api'
import { API_URL, uniqueSuffix } from './support/env'
import { evidence } from './support/evidence'
import { CARDS, createShopProduct, registerCustomer } from './support/shop'

/**
 * Compra completa en el Shop como CLIENT, contra la API real y el simulador de pagos del backend:
 * visitante → carrito → registro/login → checkout con mapa y horario de Ecuador → pago rechazado
 * (07A) → pago aprobado → confirmación → comprobante → historial. Requiere las claves de
 * Cloudinary, el simulador de pagos habilitado y las 3 tarjetas de demostración en el backend.
 */
test.use({ storageState: { cookies: [], origins: [] } })
test.describe.configure({ mode: 'serial' })

/** Evidencia del issue #20 (no la del #10). */
const FOLDER = '20-shop-checkout'

let admin: Api
let originalSchedule: { startTime: string; endTime: string } | null = null
let product: { id: string; name: string }

const TOMORROW = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Guayaquil' }).format(
  new Date(Date.now() + 24 * 60 * 60 * 1000),
)

test.beforeAll(async () => {
  admin = await apiAs('ADMIN')
  originalSchedule = await setDeliverySchedule(admin, '07:00', '17:00')
  product = await createShopProduct(admin, {
    name: `E2E Regalo ${uniqueSuffix()}`,
    priceCents: 150,
    stock: 20,
  })
})

test.afterAll(async () => {
  if (originalSchedule) {
    await setDeliverySchedule(admin, originalSchedule.startTime, originalSchedule.endTime).catch(
      () => undefined,
    )
  }
  await admin?.dispose()
})

async function addToCart(page: Page, quantity = 1) {
  await page.goto(`/productos/${product.id}`)
  await expect(page.getByRole('heading', { name: product.name, level: 1 })).toBeVisible()
  for (let extra = 1; extra < quantity; extra += 1) {
    await page.getByRole('button', { name: 'Agregar una unidad' }).click()
  }
  await page.getByRole('button', { name: 'Añadir al carrito' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'al carrito' })).toBeVisible()
}

async function fillDelivery(form: Locator, time: string) {
  await form.getByLabel('Nombre de quien recibe').fill('Ana Regalo')
  await form.getByLabel('Teléfono de contacto').fill('0991234567')
  await form.getByLabel('Dirección de entrega').fill('Av. Cevallos y Montalvo')
  const map = form.locator('.location-picker__canvas')
  const box = (await map.boundingBox())!
  await map.click({ position: { x: box.width / 2 + 30, y: box.height / 2 + 20 } })
  // Se confirma cuando el servidor dice que el punto está dentro de la cobertura (#33).
  await expect(form.getByText('Dentro de la zona de entrega.')).toBeVisible()
  await form.getByRole('button', { name: 'Confirmar ubicación' }).click()
  await form.getByLabel('Día de entrega').fill(TOMORROW)
  await form.getByLabel('Hora aproximada de entrega').fill(time)
}

async function fillCard(form: Locator, card: (typeof CARDS)[keyof typeof CARDS]) {
  await form.getByLabel('Número de tarjeta').fill(card.number)
  await form.getByLabel('Nombre en la tarjeta').fill(card.holder)
  await form.getByLabel('Mes de vencimiento').fill('12')
  await form.getByLabel('Año de vencimiento').fill('2030')
  await form.getByLabel('CVV').fill(card.cvv)
}

/** Pedidos del cliente según el servidor (para comprobar que no se duplican). */
async function ordersOf(token: string): Promise<number> {
  const response = await fetch(`${API_URL}/shop/orders`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return ((await response.json()) as { total: number }).total
}

test('un visitante compra: se registra, cotiza, un pago se rechaza y el siguiente se confirma', async ({
  page,
}) => {
  const email = `e2e-ui-${uniqueSuffix().toLowerCase()}@regalia.test`

  await test.step('el visitante arma su carrito y al ir a pagar se le pide una cuenta', async () => {
    await addToCart(page, 2)
    await page.getByRole('link', { name: /^Carrito/ }).click()
    await expect(page.getByRole('listitem', { name: product.name })).toBeVisible()
    await evidence(page.locator('.cart__layout'), 'e2e-01-carrito', FOLDER)
    await page.getByRole('link', { name: /Continuar a la entrega/ }).click()
    await expect(page.getByRole('note')).toHaveText(/Inicia sesión o crea una cuenta/)
  })

  await test.step('se registra como CLIENT y vuelve al checkout', async () => {
    await page.getByRole('link', { name: 'Crear cuenta' }).click()
    await page.getByLabel('Nombre completo').fill('E2E Compradora')
    await page.getByLabel('Correo electrónico').fill(email)
    await page.getByLabel(/^Contraseña \(/).fill('Clave12345')
    await page.getByLabel('Confirmar contraseña').fill('Clave12345')
    await page.getByRole('button', { name: 'Crear cuenta' }).click()
    await expect(page.getByRole('heading', { name: 'Un lugar para la sorpresa.' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Carrito: 2 unidades' })).toBeVisible()
  })

  const form = page.getByRole('form', { name: 'Datos de entrega' })
  await test.step('la hora 17:01 se rechaza; con 17:00 el servidor cotiza', async () => {
    await fillDelivery(form, '17:01')
    await expect(
      form.getByText('La entrega debe ser entre 07:00 y 17:00 (hora de Ecuador)'),
    ).toBeVisible()

    await form.getByLabel('Hora aproximada de entrega').fill('17:00')
    const summary = page.getByRole('region', { name: 'Total a pagar' })
    await expect(summary).toContainText(/IVA 15 %|IVA no aplicado/)
    await expect(summary).toContainText('Envío gratis $0,00')
    await evidence(page, 'e2e-02-checkout-cotizado', FOLDER)
    await page.getByRole('button', { name: /Continuar al pago/ }).click()
  })

  const payment = page.getByRole('form', { name: 'Pago con tarjeta' })
  await test.step('07A · la tarjeta sin saldo se rechaza y el carrito se conserva', async () => {
    await page.getByText('Ayuda con tarjetas de prueba').click()
    await expect(page.getByRole('note')).toHaveText(/Solo tarjetas ficticias de demostración/)
    await fillCard(payment, CARDS.empty)
    await payment.getByRole('button', { name: /Confirmar pago/ }).click()
    await expect(page.getByRole('alert')).toHaveText(
      'Pago rechazado: la tarjeta de demostración no tiene saldo suficiente.',
    )
    await expect(page.getByRole('link', { name: 'Carrito: 2 unidades' })).toBeVisible()
    await evidence(page, 'e2e-03-pago-rechazado', FOLDER)
  })

  await test.step('la tarjeta aprobada confirma la compra y recién entonces se vacía el carrito', async () => {
    await fillCard(payment, CARDS.approved)
    await payment.getByRole('button', { name: /Confirmar pago/ }).dblclick()
    await expect(page.getByRole('heading', { name: 'Ya es un detalle nuestro.' })).toBeVisible()
    await expect(page.getByText(/Total pagado:/)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Carrito', exact: true })).toBeVisible()
    await evidence(page, 'e2e-04-confirmacion', FOLDER)
  })

  await test.step('comprobante simulado e historial con seguimiento', async () => {
    await page.getByRole('link', { name: 'Ver comprobante' }).click()
    await expect(page.getByRole('heading', { name: 'Comprobante de compra' })).toBeVisible()
    await expect(page.getByText(/tarjeta de demostración terminada en 0001/)).toBeVisible()
    await evidence(page.locator('.receipt'), 'e2e-05-comprobante', FOLDER)

    await page.getByRole('button', { name: /^Hola,/ }).click()
    await page.getByRole('link', { name: 'Mis pedidos' }).click()
    const orderRow = page.getByRole('link', { name: /^Pedido / })
    await expect(orderRow).toHaveCount(1)
    await evidence(page, 'e2e-06-mis-pedidos', FOLDER)
    await orderRow.click()
    await expect(page.getByRole('region', { name: 'Recorrido del pedido' })).toContainText(
      'Pedido registrado',
    )
    await evidence(page, 'e2e-07-detalle-seguimiento', FOLDER)
  })
})

test('[simulada] 07B · si la respuesta del pago se pierde, verifica el mismo intento sin cobrar dos veces', async ({
  page,
}) => {
  const buyer = await registerCustomer('07b')
  await page.addInitScript(
    (session) => {
      localStorage.setItem('regalia.session', JSON.stringify(session))
    },
    { token: buyer.token, user: { ...buyer.user, role: 'CLIENT' } },
  )

  // El pago llega al servidor y se procesa, pero la respuesta no vuelve al navegador.
  let paymentsSent = 0
  await page.route('**/api/v1/shop/checkout', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    paymentsSent += 1
    await route.fetch()
    await route.abort('timedout')
  })

  await addToCart(page)
  await page.goto('/checkout')
  const form = page.getByRole('form', { name: 'Datos de entrega' })
  await fillDelivery(form, '10:00')
  await page.getByRole('button', { name: /Continuar al pago/ }).click()
  const payment = page.getByRole('form', { name: 'Pago con tarjeta' })
  await fillCard(payment, CARDS.approved)
  await payment.getByRole('button', { name: /Confirmar pago/ }).click()

  await expect(page.getByRole('heading', { name: 'Ya es un detalle nuestro.' })).toBeVisible({
    timeout: 30_000,
  })
  await evidence(page, 'e2e-08-simulada-verificacion-confirmada', FOLDER)
  expect(paymentsSent).toBe(1)
  expect(await ordersOf(buyer.token)).toBe(1)
})

test('una cuenta CLIENT no entra al panel administrativo', async ({ page }) => {
  const buyer = await registerCustomer('panel')
  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(buyer.email)
  await page.getByLabel('Contraseña').fill(buyer.password)
  await page.getByRole('button', { name: 'Ingresar' }).click()

  await expect(page.getByRole('alert')).toHaveText(
    'Tu usuario no tiene permisos para acceder al panel administrativo',
  )
  await page.goto('/pedidos')
  await expect(page).toHaveURL(/\/login$/)
})
