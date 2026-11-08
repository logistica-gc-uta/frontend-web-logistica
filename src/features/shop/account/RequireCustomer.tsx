import { Navigate, Outlet, useLocation } from 'react-router'
import { shopLoginSearch } from './shopNext'
import { useCustomer } from './customerContext'

/** Estado de navegación hacia el login del Shop: aviso y correo recién registrado. */
export interface CustomerRedirectState {
  from?: string
  reason?: 'required' | 'expired'
  /** Correo recién registrado, para no tener que escribirlo otra vez. */
  email?: string
  registered?: boolean
}

/**
 * Rutas de compra y pedidos: exigen una sesión CLIENT. Sin ella llevan al login del Shop con
 * `?next=` para volver al paso exacto (ruta y parámetros) que se había pedido.
 */
export function RequireCustomer() {
  const { customer, sessionExpired } = useCustomer()
  const location = useLocation()

  if (!customer) {
    const from = `${location.pathname}${location.search}`
    return (
      <Navigate
        to={shopLoginSearch(from, { reason: sessionExpired ? 'expired' : 'required' })}
        replace
      />
    )
  }

  return <Outlet />
}
