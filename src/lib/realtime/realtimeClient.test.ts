import { describe, expect, it, vi } from 'vitest'
import { authStorage } from '../auth/authStorage'
import { adminSession } from '../../test/fixtures'
import { createRealtimeSocket, subscriptionKey } from './realtimeClient'

const { io } = vi.hoisted(() => ({ io: vi.fn(() => ({ fake: true })) }))
vi.mock('socket.io-client', () => ({ io }))

type AuthCallback = (send: (data: object) => void) => void

describe('createRealtimeSocket', () => {
  it('apunta a /realtime del mismo origen que la API y no abre la conexión todavía', () => {
    createRealtimeSocket()

    expect(io).toHaveBeenCalledWith('http://localhost:3000/realtime', {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: false,
      auth: expect.any(Function),
    })
  })

  it('envía el token vigente solo en el handshake (nunca en la URL), leído en cada conexión', () => {
    createRealtimeSocket()
    const [url, options] = io.mock.lastCall as unknown as [string, { auth: AuthCallback }]
    const send = vi.fn()

    authStorage.save(adminSession)
    options.auth(send)
    authStorage.save({ ...adminSession, token: 'token-renovado' })
    options.auth(send)

    expect(url).not.toContain(adminSession.token)
    expect(send).toHaveBeenNthCalledWith(1, { token: adminSession.token })
    expect(send).toHaveBeenNthCalledWith(2, { token: 'token-renovado' })
  })

  it('sin sesión envía un token vacío (el servidor rechazará la conexión)', () => {
    authStorage.clear()
    createRealtimeSocket()
    const [, options] = io.mock.lastCall as unknown as [string, { auth: AuthCallback }]
    const send = vi.fn()

    options.auth(send)

    expect(send).toHaveBeenCalledWith({ token: '' })
  })
})

describe('subscriptionKey', () => {
  it('identifica cada suscripción por recurso e id', () => {
    expect(subscriptionKey({ resource: 'route', id: 'r1' })).toBe('route:r1')
    expect(subscriptionKey({ resource: 'incidents' })).toBe('incidents')
  })
})
