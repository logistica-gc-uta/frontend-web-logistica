import { Link } from 'react-router'
import { paths } from '../../../app/paths'
import { useCustomer } from './customerContext'

export function ShopAccountPage() {
  const { customer, logout } = useCustomer()
  if (!customer) return null

  return (
    <div className="shop-page account-page">
      <h1>Mi cuenta</h1>
      <p>
        {customer.name} · {customer.email}
      </p>
      <ul>
        <li>
          <Link to={paths.shopOrders}>Mis pedidos</Link>
        </li>
        <li>
          <Link to={paths.shopCart}>Ver carrito</Link>
        </li>
      </ul>
      <button type="button" className="btn btn--secondary" onClick={logout}>
        Cerrar sesión
      </button>
    </div>
  )
}
