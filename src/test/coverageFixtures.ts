import type { ConfiguredStoreCoverage } from '../features/store-coverage/types'
import type { GeoPoint } from '../types/geo'

/** Tienda y cobertura de prueba (un rectángulo en Ambato), como las devuelve el backend. */
export const STORE: GeoPoint = { lat: -1.24908, lng: -78.61675 }

export const AREA: GeoPoint[] = [
  { lat: -1.27, lng: -78.63 },
  { lat: -1.27, lng: -78.6 },
  { lat: -1.23, lng: -78.6 },
  { lat: -1.23, lng: -78.63 },
]

export const savedCoverage = (
  overrides: Partial<ConfiguredStoreCoverage> = {},
): ConfiguredStoreCoverage => ({
  configured: true,
  location: STORE,
  coverage: {
    type: 'Polygon',
    coordinates: [
      [
        [-78.63, -1.27],
        [-78.6, -1.27],
        [-78.6, -1.23],
        [-78.63, -1.23],
        [-78.63, -1.27],
      ],
    ],
  },
  updatedAt: '2026-11-11T15:30:00.000Z',
  updatedById: 'admin-1',
  ...overrides,
})
