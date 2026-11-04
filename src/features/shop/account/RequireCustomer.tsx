import { Navigate, Outlet, useLocation } from 'react-router'
import { paths } from '../../../app/paths'
import { useCustomer } from './customerContext'

/** Estado de navegación hacia el login del Shop: a qué paso volver y por qué se pidió. */
export interface CustomerRedirectState {
  from?: string
  reason?: 'required' | 'expired'
  /** Correo recién registrado, para no tener que escribirlo otra vez. */
  email?: string
  registered?: boolean
}

/**
 * Rutas de compra y pedidos: exigen una sesión CLIENT. Sin ella llevan al login del Shop y,
 * al ingresar, se vuelve al paso exacto (ruta y parámetros) que se había pedido.
 */
export function RequireCustomer() {
  const { customer, sessionExpired } = useCustomer()
  const location = useLocation()

  if (!customer) {
    const state: CustomerRedirectState = {
      from: `${location.pathname}${location.search}`,
      reason: sessionExpired ? 'expired' : 'required',
    }
    return <Navigate to={paths.shopLogin} replace state={state} />
  }

  return <Outlet />
}
