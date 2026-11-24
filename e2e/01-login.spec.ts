import { expect, test, type Page } from '@playwright/test'
import { credentialsFor } from './support/env'

// Estas pruebas parten sin sesión.
test.use({ storageState: { cookies: [], origins: [] } })

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Ingresar' }).click()
}

test.describe('Login del panel administrativo', () => {
  test('sin sesión, una página protegida lleva al login', async ({ page }) => {
    await page.goto('/pedidos')

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
  })

  test('el ADMIN ingresa, ve el menú y puede cerrar sesión', async ({ page }) => {
    const { email, password } = credentialsFor('ADMIN')
    await login(page, email, password)

    await expect(page.getByRole('heading', { name: 'Sistema de Logística' })).toBeVisible()
    for (const item of ['Pedidos', 'Planificación', 'Urgencias', 'Entregas fallidas']) {
      await expect(page.getByRole('link', { name: item })).toBeVisible()
    }

    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
  })

  test('una contraseña incorrecta se rechaza y no abre el panel', async ({ page }) => {
    await login(page, credentialsFor('ADMIN').email, 'contraseña-incorrecta-e2e')

    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('un CLIENT no puede entrar al panel administrativo', async ({ page }) => {
    const { email, password } = credentialsFor('CLIENT')
    await login(page, email, password)

    await expect(page.getByRole('alert')).toHaveText(
      'Tu usuario no tiene permisos para acceder al panel administrativo',
    )
    await expect(page).toHaveURL(/\/login$/)
  })
})

test.describe('Ingreso del cliente en el Shop', () => {
  test('sin sesión, Mi cuenta redirige al ingreso del cliente', async ({ page }) => {
    await page.goto('/mi-cuenta')

    await expect(page).toHaveURL(/\/ingresar/)
    await expect(page.getByRole('heading', { name: 'Qué bueno verte.' })).toBeVisible()
  })

  test('el CLIENT ingresa en el Shop, ve su cuenta y puede cerrar sesión', async ({ page }) => {
    const { email, password } = credentialsFor('CLIENT')
    await page.goto('/ingresar')
    await page.getByLabel('Correo electrónico').fill(email)
    await page.getByLabel('Contraseña', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Ingresar' }).click()

    await expect(page).not.toHaveURL(/\/ingresar/)
    await page.goto('/mi-cuenta')
    await expect(page.getByRole('heading', { name: 'Mi cuenta', level: 1 })).toBeVisible()
    await expect(page.getByText(email)).toBeVisible()

    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    await expect(page).toHaveURL(/\/ingresar/)
  })

  test('en el Shop, una contraseña incorrecta se rechaza y no abre la cuenta', async ({ page }) => {
    await page.goto('/ingresar')
    await page.getByLabel('Correo electrónico').fill(credentialsFor('CLIENT').email)
    await page.getByLabel('Contraseña', { exact: true }).fill('contraseña-incorrecta-e2e')
    await page.getByRole('button', { name: 'Ingresar' }).click()

    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page).toHaveURL(/\/ingresar/)
  })
})
