import axios from 'axios'
import { shopErrorInfo } from '../shop/shopError'

/** Mensajes por código del backend (nunca por el texto) para la tienda y su cobertura. */
const MESSAGES: Record<string, string> = {
  STORE_LOCATION_INVALID: 'La ubicación de la tienda no es válida: vuelve a colocarla en el mapa.',
  STORE_COVERAGE_INVALID:
    'El área no es válida: revisa que tenga al menos 3 puntos distintos, que sus lados no se crucen y que no supere 256 puntos.',
  VALIDATION_ERROR: 'El servidor rechazó los datos enviados. Revisa la tienda y el área.',
  STORE_NOT_CONFIGURED:
    'Todavía no hay tienda ni cobertura guardadas: guárdalas antes de probar un punto.',
}

export function describeCoverageError(error: unknown, fallback: string): string {
  const { status, code } = shopErrorInfo(error)
  if (code && MESSAGES[code]) return MESSAGES[code]
  if (status === 401) return 'Tu sesión venció. Vuelve a iniciar sesión.'
  if (status === 403) return 'Solo un ADMIN puede cambiar la tienda y la cobertura.'
  if (axios.isAxiosError(error) && !error.response) return 'No se pudo conectar con el servidor.'
  return fallback
}
