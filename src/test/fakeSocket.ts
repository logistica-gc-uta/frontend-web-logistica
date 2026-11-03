import type { Socket } from 'socket.io-client'
import { vi } from 'vitest'
import type { SubscribeAck } from '../lib/realtime/realtimeClient'

type Handler = (...args: unknown[]) => void

/**
 * Socket.IO simulado para pruebas: permite disparar conexión, desconexión y eventos del servidor,
 * y decidir qué responde el backend a cada suscripción.
 */
export function createFakeSocket(
  ackFor: (payload: unknown) => SubscribeAck = () => ({ ok: true }),
) {
  const handlers = new Map<string, Handler[]>()
  const fake = {
    connected: false,
    subscriptions: [] as unknown[],
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler])
      return fake
    }),
    emit: vi.fn((event: string, payload: unknown, ack?: (response: SubscribeAck) => void) => {
      if (event === 'resource.subscribe') {
        fake.subscriptions.push(payload)
        ack?.(ackFor(payload))
      }
      return fake
    }),
    connect: vi.fn(() => fake),
    disconnect: vi.fn(() => {
      fake.connected = false
      return fake
    }),
    removeAllListeners: vi.fn(() => {
      handlers.clear()
      return fake
    }),
    /** Simula un evento recibido del servidor (o `connect`/`disconnect`). */
    fire(event: string, ...args: unknown[]) {
      if (event === 'connect') fake.connected = true
      if (event === 'disconnect') fake.connected = false
      handlers.get(event)?.forEach((handler) => handler(...args))
    },
  }
  return fake as typeof fake & Socket
}
