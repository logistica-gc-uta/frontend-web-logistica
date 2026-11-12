import { useEffect, useState } from 'react'
import { shopService } from '../shop/shopService'
import { shopErrorInfo } from '../shop/shopError'
import type { GeoPoint } from '../../types/geo'
import type { CoveragePosition } from './types'

/** Verificación de un punto contra la cobertura guardada (la respuesta es del servidor). */
export type CoverageCheck =
  | { state: 'checking' }
  | { state: 'done'; position: CoveragePosition }
  | { state: 'failed'; message: string }

type Stored = { key: string } & CoverageCheck

const keyOf = (point: GeoPoint | null): string => (point ? `${point.lat},${point.lng}` : '')

export const COVERAGE_STATUS_TEXT: Record<Exclude<CoveragePosition, 'EXTERIOR'>, string> = {
  INTERIOR: 'Dentro de la zona de entrega.',
  BOUNDARY: 'En el borde de la zona de entrega: sí entregamos ahí.',
}
export const COVERAGE_OUTSIDE_TEXT =
  'Ese punto está fuera de la zona de entrega. Coloca el marcador dentro del área marcada.'

/**
 * Consulta `POST /store-coverage/evaluate` cada vez que cambia el punto. Una respuesta de un punto
 * anterior nunca vale para el actual: mientras llega la nueva, el estado es «verificando».
 */
export function useCoverageCheck(point: GeoPoint | null): CoverageCheck | null {
  const key = keyOf(point)
  const [stored, setStored] = useState<Stored | null>(null)

  useEffect(() => {
    if (!key) return
    const [lat, lng] = key.split(',').map(Number)
    let cancelled = false
    shopService
      .evaluateCoverage({ lat, lng })
      .then(({ position }) => {
        if (!cancelled) setStored({ key, state: 'done', position })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const message =
          shopErrorInfo(error).code === 'STORE_NOT_CONFIGURED'
            ? 'La tienda todavía no definió su zona de entrega.'
            : 'No se pudo verificar si entregamos en ese punto. Mueve el marcador para intentar de nuevo.'
        setStored({ key, state: 'failed', message })
      })
    return () => {
      cancelled = true
    }
  }, [key])

  if (!key) return null
  return stored?.key === key ? stored : { state: 'checking' }
}
