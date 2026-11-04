import { dollarsToCents } from './money'
import type { CatalogApiQuery, CatalogSort } from './types'

/** Regalos por página del catálogo (la API admite hasta 48). */
export const CATALOG_PAGE_SIZE = 12

export const SORT_OPTIONS: { value: CatalogSort; label: string }[] = [
  { value: 'featured', label: 'Destacados primero' },
  { value: 'recent', label: 'Más recientes' },
  { value: 'price_asc', label: 'Precio: menor a mayor' },
  { value: 'price_desc', label: 'Precio: mayor a menor' },
]

/** Filtros tal como los escribe el visitante (los precios en dólares, como texto). */
export interface CatalogFilters {
  search: string
  categoryId: string
  minPrice: string
  maxPrice: string
  inStock: boolean
}

export interface CatalogState extends CatalogFilters {
  sort: CatalogSort
  page: number
}

/** Nombres de los parámetros en la URL: así un enlace o volver desde el detalle conserva todo. */
const PARAM = {
  search: 'q',
  categoryId: 'categoria',
  minPrice: 'min',
  maxPrice: 'max',
  inStock: 'disponibles',
  sort: 'orden',
  page: 'pagina',
} as const

const isSort = (value: string | null): value is CatalogSort =>
  SORT_OPTIONS.some((option) => option.value === value)

export function parseCatalogParams(params: URLSearchParams): CatalogState {
  const page = Number(params.get(PARAM.page))
  const sort = params.get(PARAM.sort)
  return {
    search: params.get(PARAM.search)?.trim() ?? '',
    categoryId: params.get(PARAM.categoryId) ?? '',
    minPrice: params.get(PARAM.minPrice) ?? '',
    maxPrice: params.get(PARAM.maxPrice) ?? '',
    inStock: params.get(PARAM.inStock) === '1',
    sort: isSort(sort) ? sort : 'featured',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
}

/** Solo escribe en la URL lo que difiere de los valores por defecto. */
export function toCatalogParams(state: CatalogState): URLSearchParams {
  const params = new URLSearchParams()
  if (state.search) params.set(PARAM.search, state.search)
  if (state.categoryId) params.set(PARAM.categoryId, state.categoryId)
  if (state.minPrice) params.set(PARAM.minPrice, state.minPrice)
  if (state.maxPrice) params.set(PARAM.maxPrice, state.maxPrice)
  if (state.inStock) params.set(PARAM.inStock, '1')
  if (state.sort !== 'featured') params.set(PARAM.sort, state.sort)
  if (state.page > 1) params.set(PARAM.page, String(state.page))
  return params
}

export type FilterErrors = Partial<Record<'minPrice' | 'maxPrice', string>>

/** Valida los precios antes de aplicarlos: montos válidos en dólares y mínimo ≤ máximo. */
export function validateFilters({ minPrice, maxPrice }: CatalogFilters): FilterErrors {
  const errors: FilterErrors = {}
  const min = minPrice.trim() ? dollarsToCents(minPrice) : undefined
  const max = maxPrice.trim() ? dollarsToCents(maxPrice) : undefined
  if (min === null) errors.minPrice = 'Escribe un monto válido, por ejemplo 15 o 15,50'
  if (max === null) errors.maxPrice = 'Escribe un monto válido, por ejemplo 40 o 40,00'
  if (min != null && max != null && min > max) {
    errors.maxPrice = 'El precio máximo debe ser mayor o igual al mínimo'
  }
  return errors
}

/**
 * Consulta para la API. Un precio inválido escrito a mano en la URL se ignora en lugar de
 * enviarse; con mínimo mayor que máximo se descartan ambos.
 */
export function toApiQuery(state: CatalogState): CatalogApiQuery {
  const min = state.minPrice ? dollarsToCents(state.minPrice) : null
  const max = state.maxPrice ? dollarsToCents(state.maxPrice) : null
  const pricesAreConsistent = min === null || max === null || min <= max
  return {
    page: state.page,
    pageSize: CATALOG_PAGE_SIZE,
    sort: state.sort,
    ...(state.search && { search: state.search }),
    ...(state.categoryId && { categoryId: state.categoryId }),
    ...(pricesAreConsistent && min !== null && { minPriceCents: min }),
    ...(pricesAreConsistent && max !== null && { maxPriceCents: max }),
    ...(state.inStock && { inStock: true }),
  }
}

/** Hay algún criterio aplicado además del orden. */
export const hasActiveFilters = (state: CatalogFilters): boolean =>
  Boolean(state.search || state.categoryId || state.minPrice || state.maxPrice || state.inStock)

/** Enlace al catálogo con filtros (por ejemplo, desde una categoría o el buscador). */
export const catalogSearch = (filters: Partial<CatalogFilters>): string => {
  const params = toCatalogParams({
    search: '',
    categoryId: '',
    minPrice: '',
    maxPrice: '',
    inStock: false,
    sort: 'featured',
    page: 1,
    ...filters,
  }).toString()
  return params ? `?${params}` : ''
}
