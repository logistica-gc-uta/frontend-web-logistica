import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '../../../components/ui/Button'
import { SelectField } from '../../../components/ui/SelectField'
import { TextField } from '../../../components/ui/TextField'
import { validateFilters, type CatalogFilters, type FilterErrors } from '../catalogQuery'
import type { ShopCategory } from '../types'

interface CatalogFiltersFormProps {
  applied: CatalogFilters
  categories: ShopCategory[]
  onApply: (filters: CatalogFilters) => void
  onClear: () => void
}

function commit(draft: CatalogFilters): CatalogFilters {
  return {
    ...draft,
    search: draft.search.trim(),
    minPrice: draft.minPrice.trim(),
    maxPrice: draft.maxPrice.trim(),
  }
}

/**
 * Búsqueda y filtros combinables. Categoría y disponibilidad se aplican al cambiar; búsqueda y
 * precios, al pausar la escritura si el rango es válido.
 */
export function CatalogFiltersForm({
  applied,
  categories,
  onApply,
  onClear,
}: CatalogFiltersFormProps) {
  const [draft, setDraft] = useState(applied)
  const [errors, setErrors] = useState<FilterErrors>({})

  useEffect(() => {
    setDraft(applied)
  }, [applied.search, applied.categoryId, applied.minPrice, applied.maxPrice, applied.inStock])

  const applyIfValid = (next: CatalogFilters) => {
    const found = validateFilters(next)
    setErrors(found)
    if (Object.keys(found).length === 0) onApply(commit(next))
  }

  const set = <K extends keyof CatalogFilters>(key: K, value: CatalogFilters[K]) => {
    setDraft((current) => {
      const next = { ...current, [key]: value }
      if (key === 'categoryId' || key === 'inStock') applyIfValid(next)
      return next
    })
  }

  useEffect(() => {
    const next = commit(draft)
    if (
      next.search === applied.search &&
      next.minPrice === applied.minPrice &&
      next.maxPrice === applied.maxPrice
    ) {
      return
    }
    const timer = window.setTimeout(() => applyIfValid(draft), 400)
    return () => window.clearTimeout(timer)
  }, [applied.maxPrice, applied.minPrice, applied.search, draft])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    applyIfValid(draft)
  }

  return (
    <form className="filters catalog-filters" aria-label="Filtrar regalos" noValidate onSubmit={submit}>
      <h2>Encuentra tu detalle</h2>
      <p className="filters__intro">Combina categorías, precio y disponibilidad.</p>

      <fieldset className="filter-group">
        <TextField
          label="Buscar por nombre o descripción"
          type="search"
          maxLength={100}
          value={draft.search}
          onChange={(event) => set('search', event.target.value)}
        />
      </fieldset>

      <fieldset className="filter-group">
        <SelectField
          label="Categoría"
          value={draft.categoryId}
          onChange={(event) => set('categoryId', event.target.value)}
        >
          <option value="">Todas las categorías</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </SelectField>
      </fieldset>

      <fieldset className="filter-group">
        <legend>Precio (USD)</legend>
        <div className="price-fields catalog-filters__prices">
          <TextField
            label="Precio mínimo (USD)"
            inputMode="decimal"
            placeholder="0,00"
            value={draft.minPrice}
            error={errors.minPrice}
            onChange={(event) => set('minPrice', event.target.value)}
          />
          <TextField
            label="Precio máximo (USD)"
            inputMode="decimal"
            placeholder="0,00"
            value={draft.maxPrice}
            error={errors.maxPrice}
            onChange={(event) => set('maxPrice', event.target.value)}
          />
        </div>
        <p className="price-help">Rango inclusivo. Puedes dejarlo vacío.</p>
      </fieldset>

      <fieldset className="filter-group">
        <label className="check catalog-filters__check">
          <input
            type="checkbox"
            checked={draft.inStock}
            onChange={(event) => set('inStock', event.target.checked)}
          />
          Solo disponibles
        </label>
      </fieldset>

      <div className="catalog-filters__actions">
        <Button variant="secondary" onClick={onClear}>
          Quitar filtros
        </Button>
      </div>
    </form>
  )
}
