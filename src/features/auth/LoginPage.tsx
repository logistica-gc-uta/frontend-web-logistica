import { Navigate, useLocation, useNavigate } from 'react-router'
import { paths } from '../../app/paths'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { useForm } from '../../hooks/useForm'
import { validateLogin } from './loginValidation'
import type { LoginRedirectState } from './ProtectedRoute'
import type { LoginCredentials } from './types'
import { useAuth } from './useAuth'

const INITIAL_VALUES: LoginCredentials = { email: '', password: '' }

export function LoginPage() {
  const { isAuthenticated, login } = useAuth()
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
    <main className="auth-page">
      <section className="card auth-card">
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
      </section>
    </main>
  )
}
