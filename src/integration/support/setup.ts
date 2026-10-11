import axios from 'axios'
import { afterEach, beforeAll } from 'vitest'
import { env } from '../../config/env'
import { authStorage } from '../../lib/auth/authStorage'

beforeAll(async () => {
  try {
    await axios.get(env.apiUrl, { timeout: 5_000 })
  } catch {
    throw new Error(
      `No se pudo conectar con el backend en ${env.apiUrl}. ` +
        'Levántalo con `docker compose up -d` y `pnpm run start:dev` en el repositorio backend.',
    )
  }
})

afterEach(() => {
  authStorage.clear()
})
