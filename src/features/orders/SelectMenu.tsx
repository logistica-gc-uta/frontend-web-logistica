import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

export interface SelectMenuOption {
  value: string
  label: string
  /** No se puede elegir (por ejemplo, una categoría inactiva). */
  disabled?: boolean
}

interface SelectMenuProps {
  id: string
  label: string
  value: string
  options: SelectMenuOption[]
  placeholder: string
  onChange: (value: string) => void
  error?: string
  errorId?: string
}

/**
 * Lista desplegable propia: siempre se abre hacia abajo (la nativa se abre hacia arriba cerca del
 * borde de la pantalla) y usa el estilo de los demás desplegables.
 */
export function SelectMenu({
  id,
  label,
  value,
  options,
  placeholder,
  onChange,
  error,
  errorId,
}: SelectMenuProps) {
  const listId = useId()
  const ownErrorId = `${listId}-error`
  const describedBy = error ? (errorId ?? ownErrorId) : undefined
  const listRef = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const selected = options.find((option) => option.value === value)

  // Al abrir y al moverse con el teclado, la opción activa queda a la vista dentro de la lista.
  useEffect(() => {
    if (!open) return
    listRef.current?.children[active]?.scrollIntoView?.({ block: 'nearest' })
  }, [active, open])

  const openList = () => {
    setActive(
      Math.max(
        options.findIndex((option) => option.value === value),
        0,
      ),
    )
    setOpen(true)
  }

  const choose = (option: SelectMenuOption) => {
    if (option.disabled) return
    onChange(option.value)
    setOpen(false)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) return openList()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((current) => Math.min(Math.max(current + step, 0), options.length - 1))
    } else if ((event.key === 'Enter' || event.key === ' ') && open) {
      event.preventDefault()
      if (options[active]) choose(options[active])
    } else if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <div className="combo">
        <button
          id={id}
          type="button"
          role="combobox"
          className="field__input combo__input combo__button"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={listId}
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          data-placeholder={selected ? undefined : true}
          onClick={() => (open ? setOpen(false) : openList())}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        >
          {selected?.label ?? placeholder}
        </button>
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
            aria-label={`Opciones de ${label}`}
          >
            {options.map((option, index) => (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled || undefined}
                data-active={index === active || undefined}
                className="combo__option"
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option)}
              >
                {option.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && !errorId && (
        <p id={ownErrorId} className="field__error">
          {error}
        </p>
      )}
    </div>
  )
}
