import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { paths } from '../../app/paths'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { getErrorMessage } from '../../lib/http/apiError'
import { validateLogin, type LoginErrors } from './loginValidation'
import type { LoginRedirectState } from './ProtectedRoute'
import type { LoginCredentials } from './types'
import { useAuth } from './useAuth'

const INITIAL_VALUES: LoginCredentials = { email: '', password: '' }

export function LoginPage() {
  const { isAuthenticated, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = (location.state as LoginRedirectState | null)?.from ?? paths.home

  const [values, setValues] = useState<LoginCredentials>(INITIAL_VALUES)
  const [fieldErrors, setFieldErrors] = useState<LoginErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (isAuthenticated) {
    return <Navigate to={redirectTo} replace />
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    setFieldErrors((current) => ({ ...current, [name]: undefined }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitError(null)

    const errors = validateLogin(values)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setIsSubmitting(true)
    try {
      await login({ email: values.email.trim(), password: values.password })
      navigate(redirectTo, { replace: true })
    } catch (error) {
      setSubmitError(getErrorMessage(error, 'No se pudo iniciar sesión'))
      setIsSubmitting(false)
    }
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
