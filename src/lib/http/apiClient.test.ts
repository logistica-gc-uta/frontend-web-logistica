import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminSession } from '../../test/fixtures'
import { createHttpError } from '../../test/http'
import { authStorage } from '../auth/authStorage'
import { attachAuthToken, handleResponseError, setUnauthorizedHandler } from './apiClient'

const withToken = { requestHeaders: { Authorization: 'Bearer token' } }

describe('attachAuthToken', () => {
  const createConfig = (): InternalAxiosRequestConfig => ({ headers: new AxiosHeaders() })

  it('agrega el header Authorization cuando hay un token guardado', () => {
    authStorage.save(adminSession)

    const config = attachAuthToken(createConfig())

    expect(config.headers.get('Authorization')).toBe(`Bearer ${adminSession.token}`)
  })

  it('no agrega Authorization cuando no hay token', () => {
    const config = attachAuthToken(createConfig())

    expect(config.headers.has('Authorization')).toBe(false)
  })
})

describe('handleResponseError', () => {
  const onUnauthorized = vi.fn()
  let removeHandler: () => void

  const registerHandler = () => {
    removeHandler = setUnauthorizedHandler(onUnauthorized)
  }

  afterEach(() => {
    removeHandler?.()
    onUnauthorized.mockReset()
  })

  it('notifica la sesión inválida cuando una petición autenticada recibe 401', async () => {
    registerHandler()
    const error = createHttpError(401, withToken)

    await expect(handleResponseError(error)).rejects.toBe(error)
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })

  it('no notifica cuando el 401 viene de una petición sin token (credenciales incorrectas)', async () => {
    registerHandler()

    await expect(handleResponseError(createHttpError(401))).rejects.toBeDefined()
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('no notifica para otros códigos de error', async () => {
    registerHandler()

    await expect(handleResponseError(createHttpError(500, withToken))).rejects.toBeDefined()
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('deja de notificar después de quitar el registro', async () => {
    registerHandler()
    removeHandler()

    await expect(handleResponseError(createHttpError(401, withToken))).rejects.toBeDefined()
    expect(onUnauthorized).not.toHaveBeenCalled()
  })
})
