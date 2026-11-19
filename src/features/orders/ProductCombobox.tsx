import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { formatCurrency } from '../../lib/format/formatCurrency'
import type { Product } from '../products/types'

/** Cuántos resultados se dibujan a la vez: con miles de productos se sigue escribiendo para acotar. */
const MAX_RESULTS = 50

/** Minúsculas y sin tildes, para que «cafe» encuentre «Café». */
const normalize = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

interface ProductComboboxProps {
  id: string
  label: string
  products: Product[]
  /** Id del producto elegido, o cadena vacía. */
  value: string
  onChange: (productId: string) => void
  error?: string
}

/** Elige un producto escribiendo para filtrar: pensado para catálogos grandes. */
export function ProductCombobox({
  id,
  label,
  products,
  value,
  onChange,
  error,
}: ProductComboboxProps) {
  const listId = useId()
  const listRef = useRef<HTMLUListElement>(null)
  const selected = products.find((product) => product.id === value)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const matches = useMemo(() => {
    const needle = normalize(query.trim())
    const found =
      needle === ''
        ? products
        : products.filter((product) => normalize(product.name).includes(needle))
    return found
  }, [products, query])
  const visible = matches.slice(0, MAX_RESULTS)

  // El elemento activo siempre queda a la vista al moverse con el teclado.
  useEffect(() => {
    if (!open) return
    listRef.current?.children[active]?.scrollIntoView?.({ block: 'nearest' })
  }, [active, open])

  const openList = () => {
    if (open) return
    setQuery('')
    const index = products.findIndex((product) => product.id === value)
    setActive(Math.max(index, 0))
    setOpen(true)
  }

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  const choose = (product: Product) => {
    onChange(product.id)
    close()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) return openList()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((current) => Math.min(Math.max(current + step, 0), visible.length - 1))
    } else if (event.key === 'Enter' && open) {
      event.preventDefault()
      if (visible[active]) choose(visible[active])
    } else if (event.key === 'Escape' && open) {
      event.preventDefault()
      close()
    }
  }

  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <div className="combo">
        <input
          id={id}
          className="field__input combo__input"
          role="combobox"
          type="text"
          autoComplete="off"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && visible[active] ? `${listId}-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          placeholder="Busca un producto por nombre"
          value={open ? query : (selected?.name ?? '')}
          onFocus={openList}
          onClick={openList}
          onBlur={close}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
            setOpen(true)
          }}
          onKeyDown={onKeyDown}
        />
        <svg
          className="combo__chevron"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
        {open && (
          <ul
            id={listId}
            ref={listRef}
            className="combo__list"
            role="listbox"
            aria-label={`Resultados de ${label}`}
          >
            {visible.map((product, index) => (
              <li
                key={product.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={product.id === value}
                data-active={index === active || undefined}
                className="combo__option"
                // mousedown evita que el campo pierda el foco (y cierre la lista) antes del clic.
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(product)}
              >
                <span className="combo__name">{product.name}</span>
                <span className="combo__meta">
                  {formatCurrency(product.price)} · {product.stock} en stock
                </span>
              </li>
            ))}
            {visible.length === 0 && <li className="combo__empty">Ningún producto coincide</li>}
            {matches.length > visible.length && (
              <li className="combo__more">
                Hay {matches.length - visible.length} más: sigue escribiendo para acotar
              </li>
            )}
          </ul>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="field__error">
          {error}
        </p>
      )}
    </div>
  )
}
