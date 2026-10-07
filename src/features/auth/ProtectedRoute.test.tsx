import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { paths } from '../../app/paths'
import { adminSession } from '../../test/fixtures'
import { renderWithProviders } from '../../test/renderWithProviders'
import { authService } from './authService'
import { LoginPage } from './LoginPage'
import { ProtectedRoute } from './ProtectedRoute'

const PRIVATE_PATH = '/privada'

const renderRoutes = (session?: typeof adminSession) =>
  renderWithProviders(
    <Routes>
      <Route path={paths.login} element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path={PRIVATE_PATH} element={<h1>Página privada</h1>} />
      </Route>
    </Routes>,
    { route: PRIVATE_PATH, session },
  )

describe('ProtectedRoute', () => {
  it('muestra el contenido cuando hay sesión', () => {
    renderRoutes(adminSession)

    expect(screen.getByRole('heading', { name: 'Página privada' })).toBeInTheDocument()
  })

  it('redirige al login y, tras autenticarse, vuelve a la página solicitada', async () => {
    vi.spyOn(authService, 'login').mockResolvedValue(adminSession)
    const { user } = renderRoutes()

    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Correo electrónico'), 'admin@delivery.com')
    await user.type(screen.getByLabelText('Contraseña'), 'admin123')
    await user.click(screen.getByRole('button', { name: 'Ingresar' }))

    expect(await screen.findByRole('heading', { name: 'Página privada' })).toBeInTheDocument()
  })
})
