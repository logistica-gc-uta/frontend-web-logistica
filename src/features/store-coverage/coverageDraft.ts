import type { GeoPoint } from '../../types/geo'
import type { CoverageDraft, CoveragePolygon, SaveStoreCoverageInput, StoreCoverage } from './types'

/** Límite del backend: como máximo 256 vértices distintos en el anillo. */
export const MAX_VERTICES = 256
/** Un área necesita al menos tres vértices distintos. */
export const MIN_VERTICES = 3

const COORDINATE_DECIMALS = 6 // ≈ 0,1 m: suficiente para una dirección o un límite de barrio.

const round = (value: number): number => {
  const factor = 10 ** COORDINATE_DECIMALS
  return Math.round(value * factor) / factor
}

/** Redondea un punto a 6 decimales para que el borrador y lo guardado se comparen igual. */
export const roundPoint = ({ lat, lng }: GeoPoint): GeoPoint => ({
  lat: round(lat),
  lng: round(lng),
})

const samePoint = (a: GeoPoint, b: GeoPoint): boolean => a.lat === b.lat && a.lng === b.lng

/** Vértices del borrador → polígono GeoJSON: `[lng, lat]` y anillo cerrado (último = primero). */
export function toPolygon(vertices: readonly GeoPoint[]): CoveragePolygon {
  const ring = vertices.map(({ lat, lng }) => [lng, lat] as [number, number])
  if (ring.length > 0) ring.push([...ring[0]] as [number, number])
  return { type: 'Polygon', coordinates: [ring] }
}

/** Polígono GeoJSON del backend → vértices del borrador, sin el punto de cierre repetido. */
export function fromPolygon(polygon: CoveragePolygon): GeoPoint[] {
  const ring = polygon.coordinates[0] ?? []
  const points = ring.map(([lng, lat]) => roundPoint({ lat, lng }))
  if (points.length > 1 && samePoint(points[0], points[points.length - 1])) points.pop()
  return points
}

/** Borrador inicial: lo que está guardado, o vacío si nunca se configuró (sin pin inventado). */
export function draftFrom(coverage: StoreCoverage): CoverageDraft {
  if (!coverage.configured) return { store: null, vertices: [] }
  return { store: roundPoint(coverage.location), vertices: fromPolygon(coverage.coverage) }
}

/** Si el borrador difiere de lo guardado (o hay algo dibujado cuando no hay nada guardado). */
export function hasChanges(draft: CoverageDraft, saved: StoreCoverage): boolean {
  const base = draftFrom(saved)
  if ((draft.store === null) !== (base.store === null)) return true
  if (draft.store && base.store && !samePoint(draft.store, base.store)) return true
  if (draft.vertices.length !== base.vertices.length) return true
  return draft.vertices.some((vertex, index) => !samePoint(vertex, base.vertices[index]))
}

/**
 * Revisión mínima antes de enviar, solo para no mandar algo incompleto. La validación definitiva
 * (cruces, área cero, puntos repetidos) la hace el backend.
 */
export function draftProblem(draft: CoverageDraft): string | null {
  if (!draft.store) return 'Ubica la tienda en el mapa antes de guardar.'
  if (draft.vertices.length < MIN_VERTICES)
    return `El área necesita al menos ${MIN_VERTICES} puntos; ahora tiene ${draft.vertices.length}.`
  if (draft.vertices.length > MAX_VERTICES)
    return `El área admite como máximo ${MAX_VERTICES} puntos; quita ${draft.vertices.length - MAX_VERTICES}.`
  return null
}

/** Cuerpo del `PUT` a partir de un borrador ya revisado con `draftProblem`. */
export function toSaveInput(draft: CoverageDraft): SaveStoreCoverageInput {
  if (!draft.store) throw new Error('El borrador no tiene tienda')
  return { location: roundPoint(draft.store), coverage: toPolygon(draft.vertices) }
}

/** «-1.249080, -78.616750» con 6 decimales, para listas y avisos. */
export const formatPoint = ({ lat, lng }: GeoPoint): string =>
  `${lat.toFixed(COORDINATE_DECIMALS)}, ${lng.toFixed(COORDINATE_DECIMALS)}`
