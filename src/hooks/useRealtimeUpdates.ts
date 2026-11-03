import { useCallback, useEffect, useRef, useState } from 'react'
import type { Socket } from 'socket.io-client'
import {
  createRealtimeSocket,
  REALTIME_EVENTS,
  subscriptionKey,
  type RealtimeSubscription,
  type SubscribeAck,
} from '../lib/realtime/realtimeClient'

/**
 * - `connecting`: abriendo la conexión.
 * - `live`: conectada y suscrita.
 * - `lost`: se perdió; Socket.IO reintenta solo.
 * - `recovered`: se recuperó tras perderse (los datos ya se volvieron a consultar).
 * - `closed`: el servidor cerró la conexión (por ejemplo, sesión o permisos vencidos); no se
 *   reintenta sola, hay que pedirlo con `reconnect`.
 */
export type RealtimeStatus = 'connecting' | 'live' | 'lost' | 'recovered' | 'closed'

interface UseRealtimeUpdatesOptions {
  /** Recursos que se quieren seguir; al cambiar, se suscribe a los nuevos. */
  subscriptions: RealtimeSubscription[]
  /** Vuelve a consultar el estado por REST (la fuente de verdad). */
  onInvalidate: () => void
  /** Para pruebas: crea el socket. */
  createSocket?: () => Socket
  /** Varios eventos seguidos se agrupan en una sola consulta. */
  debounceMs?: number
}

/**
 * Sigue cambios en tiempo real. Los eventos no traen el estado: cada evento (aunque llegue
 * repetido o fuera de orden) solo provoca una nueva consulta por REST, así que nunca deshace un
 * estado más reciente. Al conectar o reconectar se suscribe de nuevo y consulta por REST, porque
 * los eventos perdidos mientras no había conexión no se repiten.
 */
export function useRealtimeUpdates({
  subscriptions,
  onInvalidate,
  createSocket = createRealtimeSocket,
  debounceMs = 300,
}: UseRealtimeUpdatesOptions) {
  const [status, setStatus] = useState<RealtimeStatus>('connecting')
  const [deniedCount, setDeniedCount] = useState(0)
  const socketRef = useRef<Socket | null>(null)
  const subscribed = useRef(new Set<string>())
  const subscriptionsRef = useRef(subscriptions)
  const onInvalidateRef = useRef(onInvalidate)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    subscriptionsRef.current = subscriptions
    onInvalidateRef.current = onInvalidate
  })

  const subscribe = useCallback((socket: Socket, subscription: RealtimeSubscription) => {
    const key = subscriptionKey(subscription)
    if (subscribed.current.has(key)) return
    subscribed.current.add(key)
    socket.emit('resource.subscribe', subscription, (ack: SubscribeAck | undefined) => {
      // Una suscripción rechazada no se reintenta ni se amplía: solo se informa.
      if (!ack?.ok) setDeniedCount((count) => count + 1)
    })
  }, [])

  useEffect(() => {
    const socket = createSocket()
    socketRef.current = socket
    let wasLost = false

    const invalidateSoon = () => {
      if (timer.current !== undefined) return
      timer.current = setTimeout(() => {
        timer.current = undefined
        onInvalidateRef.current()
      }, debounceMs)
    }

    socket.on('connect', () => {
      // Cada conexión empieza sin salas: hay que suscribirse de nuevo.
      subscribed.current.clear()
      setDeniedCount(0)
      subscriptionsRef.current.forEach((subscription) => subscribe(socket, subscription))
      onInvalidateRef.current()
      setStatus(wasLost ? 'recovered' : 'live')
    })
    socket.on('disconnect', (reason) => {
      wasLost = true
      setStatus(reason === 'io server disconnect' ? 'closed' : 'lost')
    })
    socket.on('connect_error', () => {
      wasLost = true
      setStatus('lost')
    })
    REALTIME_EVENTS.forEach((event) => socket.on(event, invalidateSoon))

    socket.connect()
    return () => {
      clearTimeout(timer.current)
      timer.current = undefined
      socket.removeAllListeners()
      socket.disconnect()
      socketRef.current = null
    }
  }, [createSocket, debounceMs, subscribe])

  // Recursos nuevos (por ejemplo, una ruta que se asignó) se suscriben sin reconectar.
  const keys = subscriptions.map(subscriptionKey).join('|')
  useEffect(() => {
    const socket = socketRef.current
    if (!socket?.connected) return
    subscriptionsRef.current.forEach((subscription) => subscribe(socket, subscription))
  }, [keys, subscribe])

  const reconnect = useCallback(() => {
    setStatus('connecting')
    socketRef.current?.connect()
  }, [])

  return { status, deniedCount, reconnect }
}
