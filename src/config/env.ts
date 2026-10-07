/**
 * Punto único de acceso a las variables de entorno.
 * El resto de la app importa desde aquí en lugar de leer import.meta.env directamente.
 */
export const env = {
  apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1',
} as const
