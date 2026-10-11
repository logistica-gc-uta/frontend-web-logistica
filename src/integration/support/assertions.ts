import axios from 'axios'
import { expect } from 'vitest'
import { getErrorMessage } from '../../lib/http/apiError'

/**
 * Espera que la promesa falle con el código HTTP indicado y devuelve el mensaje
 * que el frontend mostraría al usuario (vía `getErrorMessage`).
 */
export async function expectHttpError(promise: Promise<unknown>, status: number): Promise<string> {
  const error = await promise.then(
    () => {
      throw new Error(`Se esperaba un error HTTP ${status}, pero la petición fue exitosa`)
    },
    (reason: unknown) => reason,
  )

  expect(axios.isAxiosError(error), 'el error debe provenir de una respuesta HTTP').toBe(true)
  expect(axios.isAxiosError(error) && error.response?.status).toBe(status)
  return getErrorMessage(error)
}
