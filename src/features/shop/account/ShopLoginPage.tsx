import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { paths } from '../../../app/paths'
import { Alert } from '../../../components/ui/Alert'
import { Button } from '../../../components/ui/Button'
import { TextField } from '../../../components/ui/TextField'
import { useForm } from '../../../hooks/useForm'
import { validateLogin } from '../../auth/loginValidation'
import type { LoginCredentials } from '../../auth/types'
import { useCustomer } from './customerContext'
import type { CustomerRedirectState } from './RequireCustomer'

const NOTICES: Record<NonNullable<CustomerRedirectState['reason']>, string> = {
  required: 'Inicia sesión o crea una cuenta para continuar con tu compra.',
  expired: 'Tu sesión terminó. Vuelve a iniciar sesión para continuar.',
}

/** Login CLIENT del Shop: al ingresar vuelve al paso de compra pendiente. */
export function ShopLoginPage() {
  const { customer, login } = useCustomer()
  const navigate = useNavigate()
  const state = (useLocation().state as CustomerRedirectState | null) ?? {}
  const redirectTo = state.from ?? paths.shop

  const { values, fieldErrors, submitError, isSubmitting, handleChange, handleSubmit } = useForm({
    initialValues: { email: state.email ?? '', password: '' } satisfies LoginCredentials,
    validate: validateLogin,
    errorMessage: 'No se pudo iniciar sesión',
    onSubmit: async ({ email, password }) => {
      await login({ email: email.trim(), password })
      navigate(redirectTo, { replace: true })
    },
  })

  if (customer) return <Navigate to={redirectTo} replace />

  return (
    <div className="shop-page account-page">
      <section className="card account-card" aria-labelledby="shop-login-title">
        <h1 id="shop-login-title">Iniciar sesión</h1>
        {state.registered && (
          <Alert variant="success">Tu cuenta se creó. Ingresa con tu correo y contraseña.</Alert>
        )}
        {state.reason && !state.registered && <p role="note">{NOTICES[state.reason]}</p>}
        {submitError && <Alert>{submitError}</Alert>}

        <form className="form" onSubmit={handleSubmit} noValidate aria-label="Iniciar sesión">
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

        <p>
          ¿No tienes cuenta?{' '}
          <Link
            to={paths.shopRegister}
            state={{ from: state.from } satisfies CustomerRedirectState}
          >
            Crear una cuenta
          </Link>
        </p>
      </section>
    </div>
  )
}
