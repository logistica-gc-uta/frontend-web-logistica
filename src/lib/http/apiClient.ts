import axios, { HttpStatusCode, type InternalAxiosRequestConfig } from 'axios'
import { env } from '../../config/env'
import { authStorage } from '../auth/authStorage'

type UnauthorizedHandler = () => void

let unauthorizedHandler: UnauthorizedHandler | null = null

/** Cliente HTTP compartido por todos los servicios que consumen el backend. */
export const apiClient = axios.create({
  baseURL: env.apiUrl,
  headers: { 'Content-Type': 'application/json' },
})

/**
 * Registra la acción a ejecutar cuando el backend rechaza el token (401).
 * Devuelve una función para quitar el registro.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler): () => void {
  unauthorizedHandler = handler
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null
  }
}

/** Agrega el token JWT guardado a cada petición saliente. */
export function attachAuthToken(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  const token = authStorage.getToken()
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
}

/**
 * Si una petición autenticada recibe 401 (token vencido o inválido) se notifica para cerrar sesión.
 * Un 401 sin token (por ejemplo, credenciales incorrectas en el login) no cierra sesión.
 */
export function handleResponseError(error: unknown): Promise<never> {
  if (
    axios.isAxiosError(error) &&
    error.response?.status === HttpStatusCode.Unauthorized &&
    error.config?.headers.has('Authorization')
  ) {
    unauthorizedHandler?.()
  }
  return Promise.reject(error)
}

apiClient.interceptors.request.use(attachAuthToken)
apiClient.interceptors.response.use(undefined, handleResponseError)
