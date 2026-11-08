import { Link } from 'react-router'
import { paths } from '../../../app/paths'

export function ShopNotFoundPage() {
  return (
    <div className="shop-page shop-not-found">
      <h1>Página no encontrada</h1>
      <p>Esa dirección no existe en la tienda. Puedes volver al inicio o al catálogo.</p>
      <p>
        <Link to={paths.shop}>Volver al inicio</Link>
        {' · '}
        <Link to={paths.shopCatalog}>Ver el catálogo</Link>
      </p>
    </div>
  )
}
