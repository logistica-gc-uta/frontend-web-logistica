import { describe, expect, it, vi } from 'vitest'
import { AppError } from '../../lib/errors/AppError'
import { apiClient } from '../../lib/http/apiClient'
import { adminUser, driverUser } from '../../test/fixtures'
import { createHttpResponse } from '../../test/http'
import type { AuthUser } from '../../types/auth'
import { authService, FORBIDDEN_ROLE_MESSAGE } from './authService'
import type { LoginResponse } from './types'

const credentials = { email: 'admin@delivery.com', password: 'admin123' }

const mockLoginResponse = (user: AuthUser) =>
  vi
    .spyOn(apiClient, 'post')
    .mockResolvedValue(createHttpResponse<LoginResponse>({ access_token: 'jwt', user }))

describe('authService.login', () => {
  it('envía las credenciales al endpoint de login y devuelve la sesión', async () => {
    const post = mockLoginResponse(adminUser)

    const session = await authService.login(credentials)

    expect(post).toHaveBeenCalledWith('/auth/login', credentials)
    expect(session).toEqual({ token: 'jwt', user: adminUser })
  })

  it('rechaza usuarios cuyo rol no tiene acceso al panel web', async () => {
    mockLoginResponse(driverUser)

    const promise = authService.login(credentials)

    await expect(promise).rejects.toBeInstanceOf(AppError)
    await expect(promise).rejects.toThrow(FORBIDDEN_ROLE_MESSAGE)
  })

  it('propaga el error del backend', async () => {
    const backendError = new Error('401')
    vi.spyOn(apiClient, 'post').mockRejectedValue(backendError)

    await expect(authService.login(credentials)).rejects.toBe(backendError)
  })
})
