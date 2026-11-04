import { useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router'
import { paths } from '../../../app/paths'
import { Button } from '../../../components/ui/Button'
import { CustomerProvider } from '../account/CustomerProvider'
import { useCustomer } from '../account/customerContext'
import { CartProvider } from '../cart/CartProvider'
import { useCart } from '../cart/cartContext'
import { catalogSearch } from '../catalogQuery'

function CartCounter() {
  const { count } = useCart()
  return (
    <Link to={paths.shopCart} className="shop-header__cart" aria-live="polite">
      <span aria-hidden="true">🛒</span> Carrito: {count} {count === 1 ? 'unidad' : 'unidades'}
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
        <Link to={paths.shopLogin}>Ingresar</Link>
        <Link to={paths.shopRegister}>Crear cuenta</Link>
      </nav>
    )
  }

  return (
    <nav aria-label="Cuenta" className="shop-header__account">
      <span className="shop-header__customer">Hola, {customer.name}</span>
      <NavLink to={paths.shopOrders}>Mis pedidos</NavLink>
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
 * accesos ADMIN. La sesión del cliente (CLIENT) es propia del Shop y no abre el panel.
 */
export function ShopLayout() {
  return (
    <CustomerProvider>
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
            <AccountMenu />
          </header>
          <main id="shop-main" className="shop-main">
            <Outlet />
          </main>
          <footer className="shop-footer">
            <p>Envío gratis — incluido en el precio de cada regalo.</p>
          </footer>
        </div>
      </CartProvider>
    </CustomerProvider>
  )
}
