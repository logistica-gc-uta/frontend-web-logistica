import { request, type APIRequestContext } from '@playwright/test'
import { API_URL, credentialsFor, type Role } from './env'

type Method = 'GET' | 'POST' | 'PATCH'

/** Error de la API real con su código HTTP, para comprobar rechazos (403, 409…). */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, body: string) {
    super(`HTTP ${status}: ${body}`)
    this.status = status
  }
}

/**
 * Cliente mínimo de la API real con el token de un usuario del seed. Las pruebas lo usan para
 * preparar datos propios y para comprobar en el servidor lo que muestra la pantalla.
 */
export interface Api {
  get<T>(path: string): Promise<T>
  post<T>(path: string, data?: unknown): Promise<T>
  patch<T>(path: string, data?: unknown): Promise<T>
  dispose(): Promise<void>
}

async function call<T>(
  context: APIRequestContext,
  token: string,
  method: Method,
  path: string,
  data?: unknown,
): Promise<T> {
  const response = await context.fetch(`${API_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    data,
  })
  const text = await response.text()
  if (!response.ok()) throw new ApiError(response.status(), text)
  return (text ? JSON.parse(text) : undefined) as T
}

export async function apiAs(role: Role): Promise<Api> {
  const context = await request.newContext()
  const login = await context.post(`${API_URL}/auth/login`, { data: credentialsFor(role) })
  if (!login.ok()) {
    throw new Error(
      `No se pudo iniciar sesión como ${role} en ${API_URL} (HTTP ${login.status()}).`,
    )
  }
  const { access_token: token } = (await login.json()) as { access_token: string }

  return {
    get: (path) => call(context, token, 'GET', path),
    post: (path, data = {}) => call(context, token, 'POST', path, data),
    patch: (path, data = {}) => call(context, token, 'PATCH', path, data),
    dispose: () => context.dispose(),
  }
}
