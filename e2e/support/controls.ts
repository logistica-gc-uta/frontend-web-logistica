import type { Locator, Page } from '@playwright/test'
import { formatTime12h } from './time'

/** Selecciona una opción de un `SelectMenu` (`<button role="combobox">` + `listbox`). */
export async function pickSelectMenu(
  scope: Locator | Page,
  page: Page,
  label: string,
  optionName: string | RegExp,
) {
  await scope.getByRole('combobox', { name: label, exact: true }).click()
  await page
    .getByRole('listbox', { name: `Opciones de ${label}` })
    .getByRole('option', { name: optionName, exact: typeof optionName === 'string' })
    .click()
}

/** Completa `DeliveryDateTime` (`Fecha de entrega` + `Hora de entrega` en formato 12 h). */
export async function fillDeliveryDateTime(
  form: Locator,
  page: Page,
  day: string,
  hhmm: string,
) {
  await form.getByLabel('Fecha de entrega').fill(day)
  await pickSelectMenu(form, page, 'Hora de entrega', formatTime12h(hhmm))
}

/** Selecciona un producto en `ProductCombobox` escribiendo su nombre y eligiendo la opción. */
export async function pickOrderProduct(
  form: Locator,
  page: Page,
  productName: string,
  index = 1,
) {
  const label = `Producto ${index}`
  const input = form.getByRole('combobox', { name: label, exact: true })
  await input.click()
  await input.fill(productName)
  await page
    .getByRole('listbox', { name: `Resultados de ${label}` })
    .getByRole('option', { name: new RegExp(productName) })
    .first()
    .click()
}

/**
 * Avanza un paginador `StepNav` hasta que `target` sea visible en la página actual.
 * Si no hay paginador o ya es visible en la primera página, no hace clics extra.
 */
export async function findInStepNav(page: Page, navName: string, target: Locator) {
  const next = page.getByRole('navigation', { name: navName }).getByRole('button', { name: 'Siguiente' })
  for (let step = 0; step < 30; step += 1) {
    if (await target.isVisible()) return
    if (!(await next.isVisible()) || (await next.isDisabled())) return
    await next.click()
  }
}
