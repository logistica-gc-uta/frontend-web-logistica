import axios, { HttpStatusCode } from 'axios'
import { env } from '../../../config/env'
import { customerStorage } from './customerStorage'

type ExpiredHandler = () => void

let expiredHandler: ExpiredHandler | null = null

/**
 * Cliente HTTP de las operaciones del cliente (checkout, pedidos, comprobantes). Envía SOLO el
 * token CLIENT del Shop; el del panel administrativo nunca viaja en estas peticiones.
 */
export const customerApiClient = axios.create({
  baseURL: env.apiUrl,
  headers: { 'Content-Type': 'application/json' },
})

/** Registra qué hacer si el backend rechaza el token del cliente (401). */
export function setCustomerExpiredHandler(handler: ExpiredHandler): () => void {
  expiredHandler = handler
  return () => {
    if (expiredHandler === handler) expiredHandler = null
  }
}

customerApiClient.interceptors.request.use((config) => {
  const token = customerStorage.getToken()
  if (token) config.headers.set('Authorization', `Bearer ${token}`)
  return config
})

customerApiClient.interceptors.response.use(undefined, (error: unknown) => {
  if (
    axios.isAxiosError(error) &&
    error.response?.status === HttpStatusCode.Unauthorized &&
    error.config?.headers.has('Authorization')
  ) {
    expiredHandler?.()
  }
  return Promise.reject(error)
})
