import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { describe, expect, it } from 'vitest'
import { tokenStorage } from '../auth/tokenStorage'
import { attachAuthToken } from './apiClient'

const createConfig = (): InternalAxiosRequestConfig => ({ headers: new AxiosHeaders() })

describe('attachAuthToken', () => {
  it('agrega el header Authorization cuando hay un token guardado', () => {
    tokenStorage.set('token-de-prueba')

    const config = attachAuthToken(createConfig())

    expect(config.headers.get('Authorization')).toBe('Bearer token-de-prueba')
  })

  it('no agrega Authorization cuando no hay token', () => {
    const config = attachAuthToken(createConfig())

    expect(config.headers.has('Authorization')).toBe(false)
  })
})
