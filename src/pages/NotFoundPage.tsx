import { Link } from 'react-router'
import { paths } from '../app/paths'

export function NotFoundPage() {
  return (
    <main className="page">
      <h1>Página no encontrada</h1>
      <Link to={paths.home}>Volver al inicio</Link>
    </main>
  )
}
