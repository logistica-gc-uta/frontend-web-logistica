import { act, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { productsService } from '../features/products/productsService'
import { zonesService } from '../features/zones/zonesService'
import { authStorage } from '../lib/auth/authStorage'
import { handleResponseError } from '../lib/http/apiClient'
import { adminSession } from '../test/fixtures'
import { createHttpError } from '../test/http'
import { renderWithProviders } from '../test/renderWithProviders'
import { App } from './App'
import { paths } from './paths'

const homeHeading = () => screen.queryByRole('heading', { name: 'Sistema de Logística' })
const loginHeading = () => screen.queryByRole('heading', { name: 'Iniciar sesión' })

describe('App', () => {
  it('redirige al login cuando no hay sesión', () => {
    renderWithProviders(<App />, { route: paths.home })

    expect(loginHeading()).toBeInTheDocument()
    expect(homeHeading()).not.toBeInTheDocument()
  })

  it('muestra el inicio con el encabezado del usuario cuando hay sesión', () => {
    renderWithProviders(<App />, { route: paths.home, session: adminSession })

    expect(homeHeading()).toBeInTheDocument()
    expect(screen.getByRole('banner')).toHaveTextContent(adminSession.user.name)
  })

  it('cierra sesión desde el encabezado y vuelve al login', async () => {
    const { user } = renderWithProviders(<App />, { route: paths.home, session: adminSession })

    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(loginHeading()).toBeInTheDocument()
    expect(authStorage.getSession()).toBeNull()
  })

  it('cierra sesión automáticamente cuando el backend rechaza el token', async () => {
    renderWithProviders(<App />, { route: paths.home, session: adminSession })
    const expiredToken = createHttpError(401, {
      requestHeaders: { Authorization: `Bearer ${adminSession.token}` },
    })

    await act(() => handleResponseError(expiredToken).catch(() => undefined))

    expect(loginHeading()).toBeInTheDocument()
    expect(authStorage.getSession()).toBeNull()
  })

  it.each([
    { link: 'Zonas', heading: 'Zonas de entrega' },
    { link: 'Productos', heading: 'Productos' },
  ])(
    'navega a $link desde el menú principal y marca la opción activa',
    async ({ link, heading }) => {
      vi.spyOn(zonesService, 'list').mockResolvedValue([])
      vi.spyOn(productsService, 'list').mockResolvedValue([])
      const { user } = renderWithProviders(<App />, { route: paths.home, session: adminSession })
      const nav = screen.getByRole('navigation', { name: 'Principal' })

      await user.click(within(nav).getByRole('link', { name: link }))

      expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
      expect(within(nav).getByRole('link', { name: link })).toHaveAttribute('aria-current', 'page')
    },
  )

  it('muestra la página 404 en rutas desconocidas', () => {
    renderWithProviders(<App />, { route: '/ruta-inexistente' })

    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
  })
})
