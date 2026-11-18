import { useCustomer } from './customerContext'

const iconProps = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  'aria-hidden': true,
} as const

export function ShopAccountPage() {
  const { customer, logout } = useCustomer()
  if (!customer) return null

  return (
    <div className="shop-page account-page account-home">
      <h1>Mi cuenta</h1>

      <div className="account-home__profile">
        <p className="account-home__name">{customer.name}</p>
        <p className="account-home__email">{customer.email}</p>
      </div>

      <button type="button" className="account-home__logout" onClick={logout}>
        <svg {...iconProps} width={16} height={16}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="m16 17 5-5-5-5M21 12H9" />
        </svg>
        Cerrar sesión
      </button>
    </div>
  )
}
