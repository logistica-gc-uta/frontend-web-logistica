import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { paths } from '../../app/paths'
import { authStorage } from '../../lib/auth/authStorage'
import { AppError } from '../../lib/errors/AppError'
import { adminSession } from '../../test/fixtures'
import { createHttpError } from '../../test/httpErrors'
import { renderWithProviders } from '../../test/renderWithProviders'
import { authService } from './authService'

const renderLogin = () => renderWithProviders(<App />, { route: paths.login })

const getEmailInput = () => screen.getByLabelText('Correo electrónico')
const getPasswordInput = () => screen.getByLabelText('Contraseña')
const getSubmitButton = () => screen.getByRole('button', { name: 'Ingresar' })

const invalidCredentialsError = () =>
  createHttpError(401, { data: { message: 'Credenciales inválidas', statusCode: 401 } })

describe('LoginPage', () => {
  it('muestra el formulario de inicio de sesión', () => {
    renderLogin()

    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(getEmailInput()).toBeInTheDocument()
    expect(getPasswordInput()).toBeInTheDocument()
    expect(getSubmitButton()).toBeEnabled()
  })

  it('valida los campos obligatorios sin llamar al backend', async () => {
    const login = vi.spyOn(authService, 'login')
    const { user } = renderLogin()

    await user.click(getSubmitButton())

    expect(screen.getByText('El correo electrónico es obligatorio')).toBeInTheDocument()
    expect(screen.getByText('La contraseña es obligatoria')).toBeInTheDocument()
    expect(getEmailInput()).toHaveAttribute('aria-invalid', 'true')
    expect(login).not.toHaveBeenCalled()
  })

  it('valida el formato del correo', async () => {
    const { user } = renderLogin()

    await user.type(getEmailInput(), 'admin')
    await user.type(getPasswordInput(), 'admin123')
    await user.click(getSubmitButton())

    expect(screen.getByText('El correo electrónico no es válido')).toBeInTheDocument()
  })

  it('limpia el error de un campo cuando el usuario lo corrige', async () => {
    const { user } = renderLogin()

    await user.click(getSubmitButton())
    await user.type(getEmailInput(), 'a')

    expect(screen.queryByText('El correo electrónico es obligatorio')).not.toBeInTheDocument()
    expect(screen.getByText('La contraseña es obligatoria')).toBeInTheDocument()
  })

  it('inicia sesión, guarda el token y redirige al inicio', async () => {
    const login = vi.spyOn(authService, 'login').mockResolvedValue(adminSession)
    const { user } = renderLogin()

    await user.type(getEmailInput(), '  admin@delivery.com ')
    await user.type(getPasswordInput(), 'admin123')
    await user.click(getSubmitButton())

    expect(await screen.findByRole('heading', { name: 'Sistema de Logística' })).toBeInTheDocument()
    expect(login).toHaveBeenCalledWith({ email: 'admin@delivery.com', password: 'admin123' })
    expect(authStorage.getSession()).toEqual(adminSession)
  })

  it('deshabilita el botón mientras se envía la solicitud', async () => {
    vi.spyOn(authService, 'login').mockReturnValue(new Promise(() => {}))
    const { user } = renderLogin()

    await user.type(getEmailInput(), 'admin@delivery.com')
    await user.type(getPasswordInput(), 'admin123')
    await user.click(getSubmitButton())

    expect(screen.getByRole('button', { name: 'Ingresando...' })).toBeDisabled()
  })

  it('muestra el mensaje del backend cuando las credenciales son incorrectas', async () => {
    vi.spyOn(authService, 'login').mockRejectedValue(invalidCredentialsError())
    const { user } = renderLogin()

    await user.type(getEmailInput(), 'admin@delivery.com')
    await user.type(getPasswordInput(), 'incorrecta')
    await user.click(getSubmitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales inválidas')
    expect(getSubmitButton()).toBeEnabled()
    expect(authStorage.getSession()).toBeNull()
  })

  it('muestra un mensaje cuando el rol no tiene acceso', async () => {
    vi.spyOn(authService, 'login').mockRejectedValue(new AppError('Sin permisos'))
    const { user } = renderLogin()

    await user.type(getEmailInput(), 'driver1@delivery.com')
    await user.type(getPasswordInput(), 'driver123')
    await user.click(getSubmitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('Sin permisos')
  })

  it('redirige al inicio si ya hay una sesión activa', () => {
    renderWithProviders(<App />, { route: paths.login, session: adminSession })

    expect(screen.getByRole('heading', { name: 'Sistema de Logística' })).toBeInTheDocument()
  })
})
