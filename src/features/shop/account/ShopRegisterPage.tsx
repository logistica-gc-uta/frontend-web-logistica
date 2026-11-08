import { useState } from 'react'
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
import { AccountGiftArt } from './AccountGiftArt'
import './account-presentation.css'

const INITIAL: RegisterForm = { name: '', email: '', password: '', confirmation: '' }

/**
 * Registro público del Shop. Envía solo nombre, correo y contraseña (sin rol): el backend crea
 * la cuenta CLIENT. Después lleva al login conservando el paso de compra pendiente.
 */
export function ShopRegisterPage() {
  const { customer } = useCustomer()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
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
    <div className="shop-page account-page account-presentation">
      <Link to={paths.shopCatalog} className="account__back">
        ← Volver al catálogo
      </Link>
      <div className="account__access">
        <aside className="account__context" aria-labelledby="account-context-title">
          <p className="account__eyebrow">Mi cuenta · REGALÍA</p>
          <h2 id="account-context-title">Tu primer detalle.</h2>
          <p>Crea tu cuenta y encuentra una nueva forma de estar cerca.</p>
          <AccountGiftArt />
          <div className="account__info">
            <p>Guarda tus regalos en el carrito y continúa con tu compra.</p>
            <p>Revisa el estado de tus pedidos en un solo lugar.</p>
          </div>
        </aside>
        <section className="card account-card" aria-labelledby="shop-register-title">
          <nav className="account__tabs" aria-label="Acceso de cliente">
            <Link to={paths.shopLogin} state={{ from }}>Iniciar sesión</Link>
            <Link to={paths.shopRegister} state={{ from }} aria-current="page">Crear cuenta</Link>
          </nav>
          <h1 id="shop-register-title">Crear una cuenta</h1>
          <p className="account__lead">Todos los campos son obligatorios.</p>
          {submitError && <Alert>{submitError}</Alert>}

          <form className="form" onSubmit={handleSubmit} noValidate aria-label="Crear una cuenta">
            <TextField
              label="Nombre completo"
              name="name"
              autoComplete="name"
              required
              value={values.name}
              onChange={handleChange}
              error={fieldErrors.name}
            />
            <TextField
              label="Correo electrónico"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={values.email}
              onChange={handleChange}
              error={fieldErrors.email}
            />
            <div className="account__password">
              <TextField
                id="shop-register-password"
                label={`Contraseña (${PASSWORD_MIN} a ${PASSWORD_MAX} caracteres)`}
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={values.password}
                onChange={handleChange}
                error={fieldErrors.password}
              />
              <button
                className="account__reveal"
                type="button"
                aria-controls="shop-register-password"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            <div className="account__password">
              <TextField
                id="shop-register-confirmation"
                label="Confirmar contraseña"
                name="confirmation"
                type={showConfirmation ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={values.confirmation}
                onChange={handleChange}
                error={fieldErrors.confirmation}
              />
              <button
                className="account__reveal"
                type="button"
                aria-controls="shop-register-confirmation"
                aria-label={showConfirmation ? 'Ocultar confirmación' : 'Mostrar confirmación'}
                aria-pressed={showConfirmation}
                onClick={() => setShowConfirmation((visible) => !visible)}
              >
                {showConfirmation ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
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
    </div>
  )
}
