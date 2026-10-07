import { useAuth } from '../features/auth/useAuth'

export function HomePage() {
  const { user } = useAuth()

  return (
    <main className="page">
      <h1>Sistema de Logística</h1>
      <p>Bienvenido/a, {user?.name}. Panel administrativo de entregas y rutas.</p>
    </main>
  )
}
