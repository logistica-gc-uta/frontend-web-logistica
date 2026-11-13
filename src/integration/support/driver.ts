import axios from 'axios'
import { env } from '../../config/env'
import { credentialsFor } from './env'

/**
 * Acciones del chofer contra la API real, con su propio token (sin tocar la sesión ADMIN de la
 * prueba). Son las mismas que usa la app Flutter: iniciar, registrar entregas y visitas fallidas,
 * completar y confirmar el regreso al depósito. Por defecto entra el chofer del seed; una prueba
 * puede pasar las credenciales de un repartidor propio (#36) para no ocupar al del seed.
 */
export async function driverApi(credentials = credentialsFor('DRIVER')) {
  const { data } = await axios.post<{ access_token: string }>(
    `${env.apiUrl}/auth/login`,
    credentials,
  )
  const client = axios.create({
    baseURL: env.apiUrl,
    headers: { Authorization: `Bearer ${data.access_token}` },
  })
  return {
    start: (routeId: string) => client.post(`/routes/${routeId}/start`, {}),
    deliver: async (orderId: string) => {
      await client.patch(`/orders/${orderId}/status`, { status: 'IN_TRANSIT' })
      await client.patch(`/orders/${orderId}/status`, { status: 'DELIVERED' })
    },
    fail: (routeId: string, stopId: string) =>
      client.post(`/routes/${routeId}/stops/${stopId}/failure`, {
        reason: 'RECIPIENT_ABSENT',
        context: 'IT: nadie atendió',
        requestId: crypto.randomUUID(),
      }),
    complete: (routeId: string) => client.post(`/routes/${routeId}/complete`, {}),
    returnToDepot: (routeId: string) => client.post(`/routes/${routeId}/return`, {}),
    /** Rechazo esperado: el chofer no puede ver la bandeja administrativa. */
    inbox: () => client.get('/dispatch/inbox'),
  }
}
