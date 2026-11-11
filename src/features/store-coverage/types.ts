import type { GeoPoint } from '../../types/geo'

/** Polígono GeoJSON tal como lo guarda el backend: un solo anillo cerrado de `[lng, lat]`. */
export interface CoveragePolygon {
  type: 'Polygon'
  coordinates: [number, number][][]
}

/** `GET /store-coverage` cuando ADMIN todavía no guardó nada: no hay tienda ni área por defecto. */
export interface UnconfiguredStoreCoverage {
  configured: false
}

/** Configuración persistida de la tienda única y su cobertura general. */
export interface ConfiguredStoreCoverage {
  configured: true
  location: GeoPoint
  coverage: CoveragePolygon
  updatedAt: string
  updatedById: string | null
}

export type StoreCoverage = UnconfiguredStoreCoverage | ConfiguredStoreCoverage

/** Cuerpo de `PUT /admin/store-coverage`: reemplaza tienda y cobertura a la vez. */
export interface SaveStoreCoverageInput {
  location: GeoPoint
  coverage: CoveragePolygon
}

/** Dónde cae un punto respecto de la cobertura guardada. Interior y borde se aceptan. */
export type CoveragePosition = 'INTERIOR' | 'BOUNDARY' | 'EXTERIOR'

export interface CoverageEvaluation {
  accepted: boolean
  position: CoveragePosition
}

/** Lo que el ADMIN está editando en el mapa: todavía no es la configuración activa. */
export interface CoverageDraft {
  store: GeoPoint | null
  /** Vértices del área en el orden en que se recorren, sin repetir el primero al final. */
  vertices: GeoPoint[]
}
