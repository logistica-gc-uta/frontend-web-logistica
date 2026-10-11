import { afterEach, describe, expect, it, vi } from 'vitest'
import { authService, FORBIDDEN_ROLE_MESSAGE } from '../features/auth/authService'
import { zonesService } from '../features/zones/zonesService'
import { authStorage } from '../lib/auth/authStorage'
import { setUnauthorizedHandler } from '../lib/http/apiClient'
import { expectHttpError } from './support/assertions'
import { credentialsFor } from './support/env'
import { saveInvalidToken } from './support/session'

describe('Integración real · autenticación (POST /auth/login)', () => {
  let removeHandler: () => void = () => {}

  afterEach(() => removeHandler())

  it('ADMIN inicia sesión y recibe un token JWT con su rol', async () => {
    const credentials = credentialsFor('ADMIN')

    const session = await authService.login(credentials)

    expect(session.user.role).toBe('ADMIN')
    expect(session.user.email).toBe(credentials.email)
    expect(session.token.split('.')).toHaveLength(3)
  })

  it('rechaza una contraseña incorrecta con 401 y el mensaje del backend', async () => {
    const { email } = credentialsFor('ADMIN')

    const message = await expectHttpError(
      authService.login({ email, password: 'contraseña-incorrecta' }),
      401,
    )

    expect(message).toBe('Credenciales inválidas')
  })

  it.each(['DRIVER', 'CLIENT'] as const)(
    'el backend autentica a %s, pero el panel web le niega el acceso',
    async (role) => {
      await expect(authService.login(credentialsFor(role))).rejects.toThrow(FORBIDDEN_ROLE_MESSAGE)
      expect(authStorage.getSession()).toBeNull()
    },
  )

  it('un token inválido recibe 401 y dispara el cierre de sesión automático', async () => {
    const onUnauthorized = vi.fn()
    removeHandler = setUnauthorizedHandler(onUnauthorized)
    saveInvalidToken()

    await expectHttpError(zonesService.create({ name: 'No debe crearse', code: 'NO-CREAR' }), 401)

    expect(onUnauthorized).toHaveBeenCalledOnce()
  })
})
