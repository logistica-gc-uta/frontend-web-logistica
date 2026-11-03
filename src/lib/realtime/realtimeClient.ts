import { io, type Socket } from 'socket.io-client'
import { env } from '../../config/env'
import { authStorage } from '../auth/authStorage'

/**
 * Recursos a los que se puede suscribir un ADMIN. Los eventos solo avisan que algo cambió: el
 * estado real siempre se vuelve a consultar por REST (el backend no repite eventos perdidos).
 */
export type RealtimeSubscription =
  { resource: 'order' | 'route' | 'driver'; id: string } | { resource: 'incidents' }

/** Eventos de la versión 1 del protocolo (todos son avisos de invalidación). */
export const REALTIME_EVENTS = [
  'order.status.updated',
  'route.updated',
  'dispatch.incident.updated',
  'driver.availability.updated',
] as const

/** Respuesta del backend a `resource.subscribe`; nunca trae datos del recurso. */
export type SubscribeAck = { ok: true } | { ok: false; error: string }

export const subscriptionKey = (subscription: RealtimeSubscription): string =>
  subscription.resource === 'incidents'
    ? 'incidents'
    : `${subscription.resource}:${subscription.id}`

/** El servidor de tiempo real comparte origen con la API (sin el prefijo `/api/v1`). */
const realtimeUrl = (): string => `${new URL(env.apiUrl).origin}/realtime`

/**
 * Crea la conexión (sin abrirla). El token viaja solo en el `auth` del handshake y se lee en cada
 * conexión o reconexión, así siempre se envía el vigente; nunca va en la URL ni en registros.
 */
export function createRealtimeSocket(): Socket {
  return io(realtimeUrl(), {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    autoConnect: false,
    auth: (send) => send({ token: authStorage.getToken() ?? '' }),
  })
}
