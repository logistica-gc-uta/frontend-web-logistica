import type { Locator, Page } from '@playwright/test'

const EVIDENCE_DIR = 'docs/evidencias/capturas/10-e2e-playwright'

/**
 * Guarda una captura para la evidencia del issue solo si se pide con `E2E_CAPTURAS=1`; en una
 * ejecución normal no escribe nada en el repositorio. Con un locator captura solo esos elementos
 * (uno por archivo), así la imagen no depende de cuántos datos tenga la base local.
 */
export async function evidence(target: Page | Locator, name: string): Promise<void> {
  if (process.env.E2E_CAPTURAS !== '1') return
  if ('goto' in target) {
    await target.screenshot({ path: `${EVIDENCE_DIR}/${name}.png` })
    return
  }
  const count = await target.count()
  for (let index = 0; index < count; index += 1) {
    const suffix = count > 1 ? `-${index + 1}` : ''
    await target.nth(index).screenshot({ path: `${EVIDENCE_DIR}/${name}${suffix}.png` })
  }
}
