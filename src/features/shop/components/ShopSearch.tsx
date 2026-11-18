import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { paths } from '../../../app/paths'
import { catalogSearch } from '../catalogQuery'

/** Buscador de la portada: envía el término al catálogo y limpia el campo. */
export function ShopSearch() {
  const navigate = useNavigate()
  const [term, setTerm] = useState('')

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    navigate(`${paths.shopCatalog}${catalogSearch({ search: term.trim() })}`)
    setTerm('')
  }

  return (
    <form role="search" aria-label="Buscar regalos" className="shop-search" onSubmit={submit}>
      <label htmlFor="shop-search-term" className="visually-hidden">
        Buscar regalos
      </label>
      <input
        id="shop-search-term"
        type="search"
        className="shop-search__input"
        placeholder="¿Qué quieres regalar?"
        maxLength={100}
        value={term}
        onChange={(event) => setTerm(event.target.value)}
      />
      <button type="submit" className="shop-search__submit" aria-label="Buscar" title="Buscar">
        <svg
          className="icon"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7.5" />
          <path d="m20.5 20.5-4.2-4.2" />
        </svg>
      </button>
    </form>
  )
}
