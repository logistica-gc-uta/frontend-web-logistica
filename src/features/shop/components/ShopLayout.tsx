import { useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router'
import { paths } from '../../../app/paths'
import { Button } from '../../../components/ui/Button'
import { useFetch } from '../../../hooks/useFetch'
import { CustomerProvider } from '../account/CustomerProvider'
import { useCustomer } from '../account/customerContext'
import { CartProvider } from '../cart/CartProvider'
import { useCart } from '../cart/cartContext'
import { catalogSearch } from '../catalogQuery'
import { shopService } from '../shopService'
import { ShopThemeToggle } from './ShopThemeToggle'

function CartCounter() {
  const { count } = useCart()
  return (
    <Link to={paths.shopCart} className="shop-header__cart" aria-live="polite">
      <svg
        className="icon"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden="true"
      >
        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </svg>
      <span className="shop-header__cart-text">
        Carrito: {count} {count === 1 ? 'unidad' : 'unidades'}
      </span>
    </Link>
  )
}

/** Cuenta del cliente: ingresar/crear cuenta o, con sesión, sus pedidos y cerrar sesión. */
function AccountMenu() {
  const { customer, logout } = useCustomer()
  const navigate = useNavigate()

  if (!customer) {
    return (
      <nav aria-label="Cuenta" className="shop-header__account">
        <Link to={paths.shopLogin} className="shop-header__account-link" aria-label="Ingresar a Mi cuenta">
          <svg
            className="icon"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <span>Mi cuenta</span>
        </Link>
      </nav>
    )
  }

  return (
    <nav aria-label="Cuenta" className="shop-header__account">
      <span className="shop-header__customer">Hola, {customer.name}</span>
      <NavLink to={paths.shopOrders} className="shop-header__account-link">
        Mis pedidos
      </NavLink>
      <Button
        variant="secondary"
        onClick={() => {
          logout()
          navigate(paths.shop)
        }}
      >
        Cerrar sesión
      </Button>
    </nav>
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
      <svg
        className="icon shop-search__icon"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
      <input
        id="shop-search-term"
        type="search"
        className="shop-search__input field__input"
        placeholder="Busca un detalle especial…"
        maxLength={100}
        value={term}
        onChange={(event) => setTerm(event.target.value)}
      />
      <button type="submit" className="btn btn--primary shop-search__submit" aria-label="Buscar" title="Buscar">
        <span className="shop-search__submit-text">Buscar</span>
        <svg
          className="icon shop-search__submit-icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M5 12h14m-7-7 7 7-7 7" />
        </svg>
      </button>
    </form>
  )
}

/**
 * Estructura pública de REGALÍA, separada del panel administrativo: sin sesión obligatoria y sin
 * accesos ADMIN. La sesión del cliente (CLIENT) es propia del Shop y no abre el panel.
 */
export function ShopLayout() {
  const [dark, setDark] = useState(false)
  const categories = useFetch(shopService.categories, 'No se pudieron cargar las categorías')

  return (
    <CustomerProvider>
      <CartProvider>
        <div className="shop" data-theme={dark ? 'dark' : 'light'}>
          <a href="#shop-main" className="skip-link">
            Saltar al contenido
          </a>
          <header className="shop-header">
            <div className="shop-wrap shop-header__top">
              <Link to={paths.shop} className="shop-header__brand" aria-label="REGALÍA">
                REGALÍA
              </Link>
              <HeaderSearch />
              <ShopThemeToggle dark={dark} onToggle={() => setDark((current) => !current)} />
              <div className="shop-tools">
                <AccountMenu />
                <CartCounter />
              </div>
            </div>
            <div className="shop-nav-row">
              <div className="shop-wrap shop-nav">
                <nav aria-label="Ocasiones" className="shop-occasions-nav">
                  <NavLink to={paths.shop} end className="shop-header__link">
                    Inicio
                  </NavLink>
                  <NavLink to={paths.shopCatalog} end className="shop-header__link">
                    Todos los regalos
                  </NavLink>
                  {categories.data &&
                    categories.data
                      .filter((category) => category.productCount > 0)
                      .slice(0, 5)
                      .map((category) => (
                        <NavLink
                          key={category.id}
                          to={`${paths.shopCatalog}${catalogSearch({ categoryId: category.id })}`}
                          className="shop-header__link"
                        >
                          {category.name}
                        </NavLink>
                      ))}
                </nav>
              </div>
            </div>
          </header>
          <main id="shop-main" className="shop-main">
            <Outlet />
          </main>
          <footer className="shop-footer">
            <div className="shop-wrap shop-footer__content">
              <span>REGALÍA · El arte de tener un detalle.</span>
              <span>Envío gratis incluido en el precio de cada regalo.</span>
            </div>
          </footer>
        </div>
      </CartProvider>
    </CustomerProvider>
  )
}
