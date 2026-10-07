import axios, { type InternalAxiosRequestConfig } from 'axios'
import { env } from '../../config/env'
import { tokenStorage } from '../auth/tokenStorage'

/** Cliente HTTP compartido por todos los servicios que consumen el backend. */
export const apiClient = axios.create({
  baseURL: env.apiUrl,
  headers: { 'Content-Type': 'application/json' },
})

/** Agrega el token JWT guardado a cada petición saliente. */
export function attachAuthToken(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  const token = tokenStorage.get()
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
}

apiClient.interceptors.request.use(attachAuthToken)
