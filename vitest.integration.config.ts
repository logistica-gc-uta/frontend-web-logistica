/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'

/**
 * Pruebas de integración contra el backend real (NestJS + PostgreSQL), sin mocks.
 * Requieren el backend levantado y las variables de `.env.integration.local`.
 * Se ejecutan con `pnpm test:integration`; no forman parte de `pnpm test` ni del CI.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/integration/**/*.int.test.ts'],
    env: loadEnv('integration', process.cwd(), ['VITE_', 'IT_']),
    setupFiles: ['./src/integration/support/setup.ts'],
    // Comparten la misma base de datos: se ejecutan en serie para que los resultados sean deterministas.
    fileParallelism: false,
    testTimeout: 15_000,
  },
})
