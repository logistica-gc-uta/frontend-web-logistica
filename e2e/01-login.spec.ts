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
