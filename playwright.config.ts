import { defineConfig, devices } from '@playwright/test'
import { loadEnv } from 'vite'
import { ADMIN_STATE } from './e2e/support/env'

/**
 * Pruebas E2E en el navegador contra el backend real (NestJS + PostgreSQL), sin mocks de la API.
 * Usan las mismas variables que las pruebas de integración (`.env.integration.local`, ignorado por
 * git). Se ejecutan con `pnpm test:e2e`; no forman parte de `pnpm test` ni del CI.
 */
Object.assign(process.env, loadEnv('integration', process.cwd(), ['VITE_', 'IT_']))

/**
 * Entorno aislado (#69): con `E2E_AISLADO=1` el panel se levanta en su propio puerto (5181) contra el
 * backend descartable de `VITE_API_URL` y nunca reutiliza un servidor ya abierto (el de desarrollo
 * apunta a la base local). Ver docs/evidencias/69-e2e-aislado.md.
 */
const ISOLATED = process.env.E2E_AISLADO === '1'
const PORT = ISOLATED ? 5181 : 5173
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  // Comparten la misma base de datos y el mismo chofer del seed: una prueba a la vez.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    locale: 'es-EC',
    timezoneId: 'America/Guayaquil',
    // Ante un fallo queda la traza (pasos, red y DOM), la captura y el video para el issue.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: ADMIN_STATE },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: ISOLATED ? `pnpm dev --port ${PORT} --strictPort` : 'pnpm dev',
    url: BASE_URL,
    reuseExistingServer: !ISOLATED,
    timeout: 60_000,
  },
})
