import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { paths } from '../../../app/paths'
import { useFetch } from '../../../hooks/useFetch'
import { CustomerProvider } from '../account/CustomerProvider'
import { useCustomer } from '../account/customerContext'
import { CartProvider } from '../cart/CartProvider'
import { useCart } from '../cart/cartContext'
import { catalogSearch } from '../catalogQuery'
import { shopService } from '../shopService'
import { shopDocumentTitle } from '../shopTitles'

/**
 * El pie con marca y redes va solo donde se explora (inicio, catálogo, producto). En las pantallas
 * de una tarea o de la cuenta (acceso, carrito, pago, cuenta y pedidos) se omite para no distraer.
 */
const NO_FOOTER_PREFIXES = [
  paths.shopLogin,
  paths.shopRegister,
  paths.shopCart,
  paths.shopCheckout,
  paths.shopAccount,
] as const

const hasFooter = (pathname: string) =>
  !NO_FOOTER_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))

function CartCounter() {
  const { count } = useCart()
  const label =
    count === 0 ? 'Carrito' : `Carrito: ${count} ${count === 1 ? 'unidad' : 'unidades'}`

  return (
    <Link to={paths.shopCart} className="shop-header__cart" aria-label={label} aria-live="polite">
      <svg
        className="icon"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden="true"
      >
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </svg>
      {count > 0 ? (
        <span className="shop-header__cart-count" aria-hidden="true">
          {count}
        </span>
      ) : null}
    </Link>
  )
}

/** Cuenta del cliente: ingresar/crear cuenta o, con sesión, sus pedidos y cerrar sesión. */
function AccountMenu() {
  const { customer, logout } = useCustomer()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOnOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

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
    <nav ref={menuRef} aria-label="Cuenta" className="shop-header__account">
      <div className="shop-header__account-menu">
        <button
          type="button"
          className="shop-header__customer"
          aria-expanded={open}
          aria-controls="shop-account-menu"
          onClick={() => setOpen((current) => !current)}
        >
          Hola, <span className="shop-header__customer-name">{customer.name}</span>
          <svg className="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {open ? (
          <div id="shop-account-menu" className="shop-header__account-panel">
            <NavLink to={paths.shopAccount} className="shop-header__account-link" onClick={() => setOpen(false)}>
              Mi cuenta
            </NavLink>
            <NavLink to={paths.shopOrders} className="shop-header__account-link" onClick={() => setOpen(false)}>
              Mis pedidos
            </NavLink>
            <button
              type="button"
              className="shop-header__account-link shop-header__logout"
              onClick={() => {
                setOpen(false)
                logout()
                navigate(paths.shop)
              }}
            >
              Cerrar sesión
            </button>
          </div>
        ) : null}
      </div>
    </nav>
  )
}

/** Redes de muestra: llevan a la página de inicio de sesión de cada red, en pestaña nueva. */
const SOCIAL_LINKS = [
  {
    name: 'Facebook',
    href: 'https://www.facebook.com/login/',
    path: 'M14 8.5V6.8c0-.8.2-1.3 1.4-1.3H17V2.2c-.3 0-1.3-.2-2.5-.2C12 2 10.3 3.500 10.3 6.300v2.200H8v3.300h2.300V22H14v-10.200h2.500l.4-3.300H14Z',
  },
  {
    name: 'Instagram',
    href: 'https://www.instagram.com/accounts/login/',
    path: 'M7.500 3h9A4.500 4.500 0 0 1 21 7.500v9a4.500 4.500 0 0 1-4.500 4.500h-9A4.500 4.500 0 0 1 3 16.500v-9A4.500 4.500 0 0 1 7.500 3Zm4.500 5.500a3.500 3.500 0 1 0 0 7 3.500 3.500 0 0 0 0-7Zm5.200-2.200a.8.8 0 1 0 0 1.600.8.8 0 0 0 0-1.600Z',
    outline: true,
  },
  {
    name: 'TikTok',
    href: 'https://www.tiktok.com/login',
    path: 'M16.500 3c.3 2.300 1.600 3.700 4 3.900v3.100c-1.400.1-2.700-.3-4-1.100v5.600c0 3.600-2.700 6-5.800 6-3 0-5.500-2.300-5.500-5.400 0-3.400 2.900-5.900 6.300-5.400v3.200c-1.600-.4-3.200.5-3.200 2.200 0 1.300 1 2.200 2.300 2.200 1.400 0 2.400-1 2.400-2.700V3h3.500Z',
  },
] as const

function SocialLinks() {
  return (
    <nav aria-label="Redes sociales" className="shop-social">
      {SOCIAL_LINKS.map((social) => (
        <a
          key={social.name}
          href={social.href}
          target="_blank"
          rel="noopener noreferrer"
          className="shop-social__link"
          aria-label={`${social.name} (se abre en una pestaña nueva)`}
          title={social.name}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill={'outline' in social ? 'none' : 'currentColor'}
            stroke={'outline' in social ? 'currentColor' : 'none'}
            strokeWidth="1.6"
          >
            <path d={social.path} />
          </svg>
        </a>
      ))}
    </nav>
  )
}

/**
 * Estructura pública de REGALÍA, separada del panel administrativo: sin sesión obligatoria y sin
 * accesos ADMIN. La sesión del cliente (CLIENT) es propia del Shop y no abre el panel.
 */
export function ShopLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const categories = useFetch(shopService.categories, 'No se pudieron cargar las categorías')
  const categoriesWithGifts = (categories.data ?? []).filter((category) => category.productCount > 0)

  useEffect(() => {
    document.title = shopDocumentTitle(location.pathname)
    setMenuOpen(false)
  }, [location.pathname])

  return (
    <CustomerProvider>
      <CartProvider>
        <div className="shop" data-theme="light">
          <a href="#shop-main" className="skip-link">
            Saltar al contenido
          </a>
          <header className="shop-header">
            <div className={`shop-wrap shop-header__top${menuOpen ? ' is-open' : ''}`}>
              <Link to={paths.shop} className="shop-header__brand" aria-label="REGALÍA">
                REGALÍA
              </Link>
              <nav id="shop-occasions" aria-label="Ocasiones" className="shop-occasions-nav">
                <NavLink to={paths.shop} end className="shop-header__link">
                  Inicio
                </NavLink>
                <div className="shop-nav-dropdown">
                  <NavLink to={paths.shopCatalog} end className="shop-header__link">
                    Catálogo
                    <svg className="icon shop-nav-dropdown__chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </NavLink>
                  {categoriesWithGifts.length > 0 ? (
                    <ul className="shop-nav-dropdown__panel">
                      {categoriesWithGifts.map((category) => (
                        <li key={category.id}>
                          <Link
                            to={`${paths.shopCatalog}${catalogSearch({ categoryId: category.id })}`}
                            className="shop-nav-dropdown__item"
                          >
                            {category.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </nav>
              <button
                type="button"
                className="shop-header__menu-toggle"
                aria-expanded={menuOpen}
                aria-controls="shop-occasions"
                onClick={() => setMenuOpen((open) => !open)}
              >
                {menuOpen ? 'Cerrar menú' : 'Menú'}
              </button>
              <div className="shop-tools">
                <AccountMenu />
                <CartCounter />
              </div>
            </div>
          </header>
          <main id="shop-main" className="shop-main">
            <Outlet />
          </main>
          {hasFooter(location.pathname) && (
            <footer className="shop-footer">
              <div className="shop-wrap shop-footer__content">
                <div className="shop-footer__top">
                  <div className="shop-footer__brand">
                    <span className="shop-footer__logo">REGALÍA</span>
                    <p>El arte de tener un detalle.</p>
                  </div>
                  <SocialLinks />
                </div>
                <p className="shop-footer__copy">© {new Date().getFullYear()} REGALÍA</p>
              </div>
            </footer>
          )}
        </div>
      </CartProvider>
    </CustomerProvider>
  )
}
