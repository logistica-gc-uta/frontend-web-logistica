import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { paths } from '../../../app/paths'
import { safeShopNext } from './shopNext'
import { Alert } from '../../../components/ui/Alert'
import { Button } from '../../../components/ui/Button'
import { TextField } from '../../../components/ui/TextField'
import { useForm } from '../../../hooks/useForm'
import { validateLogin } from '../../auth/loginValidation'
import type { LoginCredentials } from '../../auth/types'
import { useCustomer } from './customerContext'
import type { CustomerRedirectState } from './RequireCustomer'
import { AccountGiftArt } from './AccountGiftArt'
import './account-presentation.css'

const NOTICES: Record<NonNullable<CustomerRedirectState['reason']>, string> = {
  required: 'Inicia sesión o crea una cuenta para continuar con tu compra.',
  expired: 'Tu sesión terminó. Vuelve a iniciar sesión para continuar.',
}

function locationSearch(params: URLSearchParams): string {
  const query = params.toString()
  return query ? `?${query}` : ''
}

/** Login CLIENT del Shop: al ingresar vuelve al paso de compra pendiente. */
export function ShopLoginPage() {
  const { customer, login } = useCustomer()
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const state = (useLocation().state as CustomerRedirectState | null) ?? {}
  const aviso = params.get('aviso')
  const reason =
    state.reason ?? (aviso === 'expired' || aviso === 'required' ? aviso : undefined)
  const redirectTo = safeShopNext(params.get('next') ?? state.from)

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
    <div className="shop-page account-page account-presentation">
      <Link to={paths.shopCatalog} className="account__back">
        ← Volver al catálogo
      </Link>
      <div className="account__access">
        <aside className="account__context" aria-labelledby="account-context-title">
          <p className="account__eyebrow">Mi cuenta · REGALÍA</p>
          <h1 id="account-context-title">Un detalle empieza contigo.</h1>
          <p>Vuelve a tus regalos y continúa con ese detalle especial.</p>
          <AccountGiftArt />
          <div className="account__info">
            <p>Tu carrito te acompaña al iniciar sesión.</p>
            <p>Consulta tus pedidos y sus detalles desde tu cuenta.</p>
          </div>
        </aside>
        <section className="card account-card" aria-labelledby="shop-login-title">
          <nav className="account__tabs" aria-label="Acceso de cliente">
            <Link to={`${paths.shopLogin}${locationSearch(params)}`} aria-current="page">
              Iniciar sesión
            </Link>
            <Link to={`${paths.shopRegister}${locationSearch(params)}`}>Crear cuenta</Link>
          </nav>
          <h2 id="shop-login-title">Qué bueno verte.</h2>
          <p className="account__lead">Todos los campos son obligatorios.</p>
          {state.registered && (
            <Alert variant="success">Tu cuenta se creó. Ingresa con tu correo y contraseña.</Alert>
          )}
          {reason && !state.registered && <p role="note">{NOTICES[reason]}</p>}
          {submitError && <Alert>{submitError}</Alert>}

          <form className="form" onSubmit={handleSubmit} noValidate aria-label="Iniciar sesión">
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
                id="shop-login-password"
                label="Contraseña"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={values.password}
                onChange={handleChange}
                error={fieldErrors.password}
              />
              <button
                className="account__reveal"
                type="button"
                aria-controls="shop-login-password"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            <Button type="submit" isLoading={isSubmitting} loadingText="Ingresando...">
              Ingresar
            </Button>
          </form>
        </section>
      </div>
    </div>
  )
}
