import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import { navGroups } from '../../app/navigation'
import { paths } from '../../app/paths'
import { useAuth } from '../../features/auth/useAuth'
import { Button } from '../ui/Button'

/**
 * Estructura común de las páginas autenticadas: barra lateral con menú y usuario, y contenido.
 * En pantallas angostas la barra pasa arriba y el menú se despliega con el botón «Menú».
 */
export function AppLayout() {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)

  return (
    <div className="app-shell">
      <header className="app-header" data-open={menuOpen}>
        <div className="app-header__bar">
          <Link to={paths.home} className="brand" onClick={closeMenu}>
            <span className="brand__name">REGALÍA</span>
            <span className="brand__system">Logística</span>
          </Link>
          <Button
            variant="secondary"
            className="app-header__toggle"
            aria-expanded={menuOpen}
            aria-controls="app-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? 'Cerrar menú' : 'Menú'}
          </Button>
        </div>
        <div id="app-menu" className="app-header__panel">
          <nav aria-label="Principal" className="app-nav">
            {navGroups.map((group) => {
              const titleId = `nav-${group.title.toLowerCase().replace(/\W+/g, '-')}`
              return (
                <section key={group.title} className="app-nav__group" aria-labelledby={titleId}>
                  <p id={titleId} className="app-nav__title">
                    {group.title}
                  </p>
                  <ul className="app-nav__list">
                    {group.items.map((item) => (
                      <li key={item.to}>
                        <NavLink to={item.to} end className="app-nav__link" onClick={closeMenu}>
                          {item.label}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </nav>
          <div className="app-header__user">
            <span>{user?.name}</span>
            <Button variant="secondary" onClick={logout}>
              Cerrar sesión
            </Button>
          </div>
        </div>
      </header>
      <div className="app-content">
        <Outlet />
      </div>
    </div>
  )
}
