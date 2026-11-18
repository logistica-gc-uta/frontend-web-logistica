import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { navGroups } from '../../app/navigation'
import { paths } from '../../app/paths'
import { useAuth } from '../../features/auth/useAuth'
import { Button } from '../ui/Button'

const COLLAPSE_KEY = 'regalia.admin-menu-collapsed'
const GROUPS_KEY = 'regalia.admin-menu-groups'

/** Grupos del menú que la persona abrió o cerró a mano; el resto sigue la página actual. */
function readGroups(): Record<string, boolean> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(GROUPS_KEY) ?? '{}')
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

/** Preferencia de menú contraído: se recuerda en el navegador, sin romper si no hay almacenamiento. */
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Estructura común de las páginas autenticadas: barra lateral con menú y usuario, y contenido.
 * En pantallas angostas la barra pasa arriba y el menú se despliega con el botón «Menú».
 */
export function AppLayout() {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const { pathname } = useLocation()
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(readGroups)
  const activeGroup = navGroups.find((group) => group.items.some((item) => item.to === pathname))?.title
  const [seenGroup, setSeenGroup] = useState(activeGroup)

  // Al llegar a una página de otro grupo, ese grupo se abre (sin necesidad de un efecto).
  if (activeGroup !== seenGroup) {
    setSeenGroup(activeGroup)
    if (activeGroup) setOpenGroups((current) => ({ ...current, [activeGroup]: true }))
  }
  // Sin elección previa, solo el grupo de la página actual está abierto.
  const isGroupOpen = (title: string) => openGroups[title] ?? title === activeGroup

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
    } catch {
      // Sin almacenamiento: la preferencia vive solo mientras la página está abierta.
    }
  }, [collapsed])

  useEffect(() => {
    try {
      localStorage.setItem(GROUPS_KEY, JSON.stringify(openGroups))
    } catch {
      // Sin almacenamiento: la elección vive solo mientras la página está abierta.
    }
  }, [openGroups])

  const closeMenu = () => setMenuOpen(false)

  return (
    <div className="app-shell" data-theme="light" data-collapsed={collapsed}>
      <a href="#admin-main" className="app-skip">
        Saltar al contenido
      </a>
      <header className="app-header" data-open={menuOpen}>
        <div className="app-header__bar">
          <Link to={paths.home} className="brand" onClick={closeMenu}>
            <span className="brand__name">REGALÍA</span>
            <span className="brand__system">Logística</span>
          </Link>
          <button
            type="button"
            className="app-header__collapse"
            aria-expanded={!collapsed}
            aria-controls="app-menu"
            aria-label={collapsed ? 'Mostrar menú' : 'Ocultar menú'}
            title={collapsed ? 'Mostrar menú' : 'Ocultar menú'}
            onClick={() => setCollapsed((current) => !current)}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {collapsed ? <path d="m6 17 5-5-5-5M13 17l5-5-5-5" /> : <path d="m18 17-5-5 5-5M11 17l-5-5 5-5" />}
            </svg>
          </button>
          <div className="app-header__tools">
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
        </div>
        <div id="app-menu" className="app-header__panel">
          <nav aria-label="Principal" className="app-nav">
            {navGroups.map((group) => {
              const titleId = `nav-${group.title.toLowerCase().replace(/\W+/g, '-')}`
              const listId = `${titleId}-list`
              const open = isGroupOpen(group.title)
              return (
                <section
                  key={group.title}
                  className="app-nav__group"
                  aria-labelledby={titleId}
                  data-open={open}
                >
                  <p className="app-nav__title">
                    <button
                      type="button"
                      id={titleId}
                      className="app-nav__toggle"
                      aria-expanded={open}
                      aria-controls={listId}
                      onClick={() =>
                        setOpenGroups((current) => ({ ...current, [group.title]: !open }))
                      }
                    >
                      <span>{group.title}</span>
                      <svg
                        className="app-nav__chevron"
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
                    </button>
                  </p>
                  <ul id={listId} className="app-nav__list">
                    {group.items.map((item) => (
                      <li key={item.to}>
                        <NavLink
                          to={item.to}
                          end
                          className="app-nav__link"
                          title={item.label}
                          onClick={closeMenu}
                        >
                          <span className="app-nav__label">{item.label}</span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </nav>
          <div className="app-header__user">
            <span className="app-header__greeting">Hola, {user?.name}</span>
            <Button variant="secondary" onClick={logout} title="Cerrar sesión">
              <svg
                className="app-header__logout-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
              <span className="app-header__logout-label">Cerrar sesión</span>
            </Button>
          </div>
        </div>
      </header>
      <div id="admin-main" className="app-content">
        <Outlet />
      </div>
    </div>
  )
}
