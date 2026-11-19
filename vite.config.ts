/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    // Las pruebas con muchos clics y cobertura activa pueden pasar de los 5 s por defecto en el CI.
    testTimeout: 15000,
    include: ['src/**/*.test.{ts,tsx}'],
    // Las pruebas contra el backend real se ejecutan aparte con `pnpm test:integration`.
    exclude: ['src/integration/**'],
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/test/**',
        'src/integration/**',
        'src/**/*.test.{ts,tsx}',
      ],
    },
  },
})
