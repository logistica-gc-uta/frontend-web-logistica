import { useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router'
import { paths } from '../../../app/paths'
import { Button } from '../../../components/ui/Button'
import { CartProvider } from '../cart/CartProvider'
import { useCart } from '../cart/cartContext'
import { catalogSearch } from '../catalogQuery'

function CartCounter() {
  const { count } = useCart()
  return (
    <p className="shop-header__cart" aria-live="polite">
      <span aria-hidden="true">🛒</span> Carrito: {count} {count === 1 ? 'unidad' : 'unidades'}
    </p>
  )
}

function HeaderSearch() {
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
        className="field__input"
        placeholder="Buscar regalos"
        maxLength={100}
        value={term}
        onChange={(event) => setTerm(event.target.value)}
      />
      <Button type="submit">Buscar</Button>
    </form>
  )
}

/**
 * Estructura pública de REGALÍA, separada del panel administrativo: sin sesión obligatoria y sin
 * accesos ADMIN. La cuenta del cliente (login CLIENT y su menú) se agrega con el checkout (#20).
 */
export function ShopLayout() {
  return (
    <CartProvider>
      <div className="shop">
        <a href="#shop-main" className="skip-link">
          Saltar al contenido
        </a>
        <header className="shop-header">
          <Link to={paths.shop} className="shop-header__brand">
            REGALÍA
          </Link>
          <nav aria-label="Tienda" className="shop-header__nav">
            <NavLink to={paths.shop} end className="shop-header__link">
              Inicio
            </NavLink>
            <NavLink to={paths.shopCatalog} className="shop-header__link">
              Catálogo
            </NavLink>
          </nav>
          <HeaderSearch />
          <CartCounter />
        </header>
        <main id="shop-main" className="shop-main">
          <Outlet />
        </main>
        <footer className="shop-footer">
          <p>Envío gratis — incluido en el precio de cada regalo.</p>
        </footer>
      </div>
    </CartProvider>
  )
}
