import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { paths } from '../../../app/paths'
import { Alert } from '../../../components/ui/Alert'
import { Button } from '../../../components/ui/Button'
import { TextField } from '../../../components/ui/TextField'
import { useForm } from '../../../hooks/useForm'
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  validateRegister,
  type RegisterForm,
} from './accountValidation'
import { useCustomer } from './customerContext'
import { customerService } from './customerService'
import type { CustomerRedirectState } from './RequireCustomer'

const INITIAL: RegisterForm = { name: '', email: '', password: '', confirmation: '' }

/**
 * Registro público del Shop. Envía solo nombre, correo y contraseña (sin rol): el backend crea
 * la cuenta CLIENT. Después lleva al login conservando el paso de compra pendiente.
 */
export function ShopRegisterPage() {
  const { customer } = useCustomer()
  const navigate = useNavigate()
  const from = (useLocation().state as CustomerRedirectState | null)?.from

  const { values, fieldErrors, submitError, isSubmitting, handleChange, handleSubmit } = useForm({
    initialValues: INITIAL,
    validate: validateRegister,
    errorMessage: 'No se pudo crear la cuenta',
    onSubmit: async ({ name, email, password }) => {
      const normalizedEmail = email.trim()
      await customerService.register({ name: name.trim(), email: normalizedEmail, password })
      const state: CustomerRedirectState = { from, email: normalizedEmail, registered: true }
      navigate(paths.shopLogin, { replace: true, state })
    },
  })

  if (customer) return <Navigate to={from ?? paths.shop} replace />

  return (
    <div className="shop-page account-page">
      <section className="card account-card" aria-labelledby="shop-register-title">
        <h1 id="shop-register-title">Crear una cuenta</h1>
        {submitError && <Alert>{submitError}</Alert>}

        <form className="form" onSubmit={handleSubmit} noValidate aria-label="Crear una cuenta">
          <TextField
            label="Nombre completo"
            name="name"
            autoComplete="name"
            value={values.name}
            onChange={handleChange}
            error={fieldErrors.name}
          />
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
            label={`Contraseña (${PASSWORD_MIN} a ${PASSWORD_MAX} caracteres)`}
            name="password"
            type="password"
            autoComplete="new-password"
            value={values.password}
            onChange={handleChange}
            error={fieldErrors.password}
          />
          <TextField
            label="Confirmar contraseña"
            name="confirmation"
            type="password"
            autoComplete="new-password"
            value={values.confirmation}
            onChange={handleChange}
            error={fieldErrors.confirmation}
          />
          <Button type="submit" isLoading={isSubmitting} loadingText="Creando cuenta...">
            Crear cuenta
          </Button>
        </form>

        <p>
          ¿Ya tienes cuenta?{' '}
          <Link to={paths.shopLogin} state={{ from } satisfies CustomerRedirectState}>
            Iniciar sesión
          </Link>
        </p>
      </section>
    </div>
  )
}
