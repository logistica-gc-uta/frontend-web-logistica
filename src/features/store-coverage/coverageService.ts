import { apiClient } from '../../lib/http/apiClient'
import type {
  ConfiguredStoreCoverage,
  CoverageEvaluation,
  SaveStoreCoverageInput,
  StoreCoverage,
} from './types'
import type { GeoPoint } from '../../types/geo'

/** Contrato del backend #41 (`docs/store-coverage-contract.md`). */
export const coverageService = {
  /** Lectura pública; `{ configured: false }` si ADMIN todavía no guardó nada. */
  async get(): Promise<StoreCoverage> {
    const { data } = await apiClient.get<StoreCoverage>('/store-coverage')
    return data
  },

  /** Reemplaza tienda y cobertura (solo ADMIN). Devuelve lo que quedó persistido. */
  async save(input: SaveStoreCoverageInput): Promise<ConfiguredStoreCoverage> {
    const { data } = await apiClient.put<ConfiguredStoreCoverage>('/admin/store-coverage', input)
    return data
  },

  /** Clasifica un punto contra la cobertura guardada (no contra el borrador del mapa). */
  async evaluate(point: GeoPoint): Promise<CoverageEvaluation> {
    const { data } = await apiClient.post<CoverageEvaluation>('/store-coverage/evaluate', point)
    return data
  },
}
