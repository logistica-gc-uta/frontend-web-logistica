import { Navigate, Outlet, useLocation } from 'react-router'
import { paths } from '../../app/paths'
import { useAuth } from './useAuth'

/** Estado de navegación usado para volver a la página solicitada después del login. */
export interface LoginRedirectState {
  from?: string
}

/** Deja pasar a las rutas hijas solo si hay sesión; si no, redirige al login. */
export function ProtectedRoute() {
  const { isAuthenticated } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    const state: LoginRedirectState = { from: location.pathname }
    return <Navigate to={paths.login} replace state={state} />
  }

  return <Outlet />
}
