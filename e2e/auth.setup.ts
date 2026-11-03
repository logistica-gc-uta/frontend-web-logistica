import { expect, test as setup } from '@playwright/test'
import { ADMIN_STATE, credentialsFor } from './support/env'

/** Inicia sesión como ADMIN por la pantalla y guarda la sesión para el resto de las pruebas. */
setup('sesión ADMIN', async ({ page }) => {
  const { email, password } = credentialsFor('ADMIN')

  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Ingresar' }).click()

  await expect(page.getByRole('heading', { name: 'Sistema de Logística' })).toBeVisible()
  await page.context().storageState({ path: ADMIN_STATE })
})
