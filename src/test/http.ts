import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'

/** Crea una respuesta exitosa de axios con el cuerpo indicado (para simular `apiClient`). */
export const createHttpResponse = <T>(data: T) => ({ data }) as AxiosResponse<T>

interface HttpErrorOptions {
  /** Cuerpo de la respuesta (ej. `{ message: '...' }` de NestJS). */
  data?: unknown
  /** Headers de la petición original (ej. `Authorization`). */
  requestHeaders?: Record<string, string>
}

/** Crea un error de axios equivalente a una respuesta HTTP con el `status` indicado. */
export function createHttpError(
  status: number,
  { data = {}, requestHeaders = {} }: HttpErrorOptions = {},
) {
  const config = { headers: new AxiosHeaders(requestHeaders) }
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, undefined, {
    status,
    data,
    statusText: '',
    headers: {},
    config,
  })
}
