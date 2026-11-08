import { expect, test, type Locator, type Page } from '@playwright/test'
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
let product: { id: string; name: string }

const TOMORROW = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Guayaquil' }).format(
  new Date(Date.now() + 24 * 60 * 60 * 1000),
)

test.beforeAll(async () => {
  admin = await apiAs('ADMIN')
  product = await createShopProduct(admin, {
    name: `E2E Regalo ${uniqueSuffix()}`,
    priceCents: 150,
    stock: 20,
  })
})

test.afterAll(async () => admin?.dispose())

async function addToCart(page: Page, quantity = 1) {
  await page.goto(`/shop/productos/${product.id}`)
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
  await form.getByLabel('Zona').selectOption({ index: 1 })
  await form.getByLabel('Dirección de entrega').fill('Av. Cevallos y Montalvo')
  const map = form.locator('.location-picker__canvas')
  const box = (await map.boundingBox())!
  await map.click({ position: { x: box.width / 2 + 30, y: box.height / 2 + 20 } })
  await form.getByRole('button', { name: 'Confirmar ubicación' }).click()
  await form.getByLabel('Día de entrega').fill(TOMORROW)
  await form.getByLabel('Hora de entrega').fill(time)
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
    await page.getByRole('link', { name: 'Crear una cuenta' }).click()
    await page.getByLabel('Nombre completo').fill('E2E Compradora')
    await page.getByLabel('Correo electrónico').fill(email)
    await page.getByLabel(/^Contraseña \(/).fill('Clave12345')
    await page.getByLabel('Confirmar contraseña').fill('Clave12345')
    await page.getByRole('button', { name: 'Crear cuenta' }).click()
    await expect(page.getByText('Tu cuenta se creó')).toBeVisible()
    await page.getByLabel('Contraseña').fill('Clave12345')
    await page.getByRole('button', { name: 'Ingresar' }).click()
    await expect(page.getByRole('heading', { name: 'Checkout: datos de entrega' })).toBeVisible()
    await expect(page.locator('.shop-header__cart')).toContainText('2 unidades')
  })

  const form = page.getByRole('form', { name: 'Datos de entrega' })
  await test.step('la hora 17:01 se rechaza; con 17:00 el servidor cotiza', async () => {
    await fillDelivery(form, '17:01')
    await expect(
      form.getByText('La entrega debe ser entre 07:00 y 17:00 (hora de Ecuador)'),
    ).toBeVisible()

    await form.getByLabel('Hora de entrega').fill('17:00')
    const summary = page.getByRole('region', { name: 'Total a pagar' })
    await expect(summary).toContainText('IVA simulado')
    await expect(summary).toContainText('Envío gratis $0,00')
    await evidence(page, 'e2e-02-checkout-cotizado', FOLDER)
    await page.getByRole('button', { name: /Continuar al pago/ }).click()
  })

  const payment = page.getByRole('form', { name: 'Pago con tarjeta ficticia' })
  await test.step('07A · la tarjeta sin saldo se rechaza y el carrito se conserva', async () => {
    await expect(page.getByRole('note')).toHaveText(/Solo tarjetas ficticias de demostración/)
    await fillCard(payment, CARDS.empty)
    await payment.getByRole('button', { name: /Pagar/ }).click()
    await expect(page.getByRole('alert')).toHaveText(
      'Pago rechazado: la tarjeta de demostración no tiene saldo suficiente.',
    )
    await expect(page.locator('.shop-header__cart')).toContainText('2 unidades')
    await evidence(page, 'e2e-03-pago-rechazado', FOLDER)
  })

  await test.step('la tarjeta aprobada confirma la compra y recién entonces se vacía el carrito', async () => {
    await fillCard(payment, CARDS.approved)
    await payment.getByRole('button', { name: /Pagar/ }).dblclick()
    await expect(page.getByRole('heading', { name: '¡Compra confirmada!' })).toBeVisible()
    await expect(page.getByText(/Total pagado \(incluye IVA simulado\)/)).toBeVisible()
    await expect(page.locator('.shop-header__cart')).toContainText('0 unidades')
    await evidence(page, 'e2e-04-confirmacion', FOLDER)
  })

  await test.step('comprobante simulado e historial con seguimiento', async () => {
    await page.getByRole('link', { name: 'Ver comprobante' }).click()
    await expect(page.getByRole('note')).toHaveText(
      'COMPROBANTE DE COMPRA SIMULADO — SIN VALIDEZ TRIBUTARIA',
    )
    await expect(page.getByText(/tarjeta terminada en 0001/)).toBeVisible()
    await evidence(page.locator('.receipt'), 'e2e-05-comprobante', FOLDER)

    await page.getByRole('button', { name: /^Hola,/ }).click()
    await page.getByRole('link', { name: 'Mis pedidos' }).click()
    await expect(page.getByRole('listitem', { name: /^Pedido / })).toHaveCount(1)
    await evidence(page, 'e2e-06-mis-pedidos', FOLDER)
    await page.getByRole('link', { name: 'Ver detalle y seguimiento' }).click()
    await expect(page.getByRole('region', { name: 'Seguimiento' })).toContainText(
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
  await page.goto('/shop/checkout')
  const form = page.getByRole('form', { name: 'Datos de entrega' })
  await fillDelivery(form, '10:00')
  await page.getByRole('button', { name: /Continuar al pago/ }).click()
  const payment = page.getByRole('form', { name: 'Pago con tarjeta ficticia' })
  await fillCard(payment, CARDS.approved)
  await payment.getByRole('button', { name: /Pagar/ }).click()

  await expect(page.getByRole('heading', { name: '¡Compra confirmada!' })).toBeVisible({
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
