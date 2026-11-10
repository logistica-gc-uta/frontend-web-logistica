import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { paths } from '../../app/paths'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { useForm } from '../../hooks/useForm'
import { RouteIllustration } from './RouteIllustration'
import { validateLogin } from './loginValidation'
import type { LoginRedirectState } from './ProtectedRoute'
import type { LoginCredentials } from './types'
import { AdminThemeToggle } from '../../components/layout/AdminThemeToggle'
import { useAdminTheme } from '../../components/layout/adminTheme'
import { useAuth } from './useAuth'

const INITIAL_VALUES: LoginCredentials = { email: '', password: '' }

export function LoginPage() {
  const { isAuthenticated, login } = useAuth()
  const { dark, toggle } = useAdminTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = (location.state as LoginRedirectState | null)?.from ?? paths.home

  const { values, fieldErrors, submitError, isSubmitting, handleChange, handleSubmit } = useForm({
    initialValues: INITIAL_VALUES,
    validate: validateLogin,
    errorMessage: 'No se pudo iniciar sesión',
    onSubmit: async ({ email, password }) => {
      await login({ email: email.trim(), password })
      navigate(redirectTo, { replace: true })
    },
  })

  if (isAuthenticated) {
    return <Navigate to={redirectTo} replace />
  }

  return (
    <main className="auth-page" data-theme={dark ? 'dark' : 'light'}>
      <div className="auth-hero">
        <p className="brand auth-hero__brand">
          <span className="brand__name">REGALÍA</span>
          <span className="brand__system">Logística</span>
        </p>
        <RouteIllustration />
        <p className="auth-hero__lead">
          Pedidos, rutas y entregas del día, desde el depósito hasta la puerta del cliente.
        </p>
      </div>
      <section className="auth-card">
        <div className="auth-card__toolbar">
          <AdminThemeToggle dark={dark} onToggle={toggle} />
        </div>
        <h1>Iniciar sesión</h1>
        <p className="text-muted">Panel administrativo de logística</p>

        {submitError && <Alert>{submitError}</Alert>}

        <form className="form" onSubmit={handleSubmit} noValidate>
          <TextField
            label="Correo electrónico"
            name="email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={handleChange}
            error={fieldErrors.email}
          />
          <TextField
            label="Contraseña"
            name="password"
            type="password"
            autoComplete="current-password"
            value={values.password}
            onChange={handleChange}
            error={fieldErrors.password}
          />
          <Button type="submit" isLoading={isSubmitting} loadingText="Ingresando...">
            Ingresar
          </Button>
        </form>

        <p className="auth-card__switch">
          ¿Compras en la tienda? <Link to={paths.shopLogin}>Ingresa en REGALÍA</Link>
        </p>
      </section>
    </main>
  )
}
