import { useState, type FormEvent } from 'react'
import { Button } from '../../../components/ui/Button'
import { SelectField } from '../../../components/ui/SelectField'
import { TextField } from '../../../components/ui/TextField'
import { validateFilters, type CatalogFilters, type FilterErrors } from '../catalogQuery'
import type { ShopCategory } from '../types'

interface CatalogFiltersFormProps {
  /** Filtros aplicados (los de la URL); el formulario edita una copia hasta pulsar «Aplicar». */
  applied: CatalogFilters
  categories: ShopCategory[]
  onApply: (filters: CatalogFilters) => void
  onClear: () => void
}

/**
 * Búsqueda y filtros combinables. Se aplican al enviar el formulario (no en cada tecla), así no se
 * consulta la API de más.
 */
export function CatalogFiltersForm({
  applied,
  categories,
  onApply,
  onClear,
}: CatalogFiltersFormProps) {
  const [draft, setDraft] = useState(applied)
  const [errors, setErrors] = useState<FilterErrors>({})

  const set = <K extends keyof CatalogFilters>(key: K, value: CatalogFilters[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    if (key === 'minPrice' || key === 'maxPrice') setErrors({})
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const found = validateFilters(draft)
    setErrors(found)
    if (Object.keys(found).length === 0) {
      onApply({
        ...draft,
        search: draft.search.trim(),
        minPrice: draft.minPrice.trim(),
        maxPrice: draft.maxPrice.trim(),
      })
    }
  }

  return (
    <form className="catalog-filters" aria-label="Filtrar regalos" noValidate onSubmit={submit}>
      <TextField
        label="Buscar por nombre o descripción"
        type="search"
        maxLength={100}
        value={draft.search}
        onChange={(event) => set('search', event.target.value)}
      />
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
      <div className="catalog-filters__prices">
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
      <label className="catalog-filters__check">
        <input
          type="checkbox"
          checked={draft.inStock}
          onChange={(event) => set('inStock', event.target.checked)}
        />
        Solo disponibles
      </label>
      <div className="catalog-filters__actions">
        <Button type="submit">Aplicar filtros</Button>
        <Button variant="secondary" onClick={onClear}>
          Quitar filtros
        </Button>
      </div>
    </form>
  )
}
