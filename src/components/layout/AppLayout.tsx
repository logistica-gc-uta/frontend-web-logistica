import { Link, Outlet } from 'react-router'
import { paths } from '../../app/paths'
import { useAuth } from '../../features/auth/useAuth'
import { Button } from '../ui/Button'

/** Estructura común de las páginas autenticadas: encabezado con usuario y contenido. */
export function AppLayout() {
  const { user, logout } = useAuth()

  return (
    <>
      <header className="app-header">
        <Link to={paths.home} className="app-header__brand">
          Logística UTA
        </Link>
        <div className="app-header__user">
          <span>{user?.name}</span>
          <Button variant="secondary" onClick={logout}>
            Cerrar sesión
          </Button>
        </div>
      </header>
      <Outlet />
    </>
  )
}
