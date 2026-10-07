import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { AuthProvider } from '../features/auth/AuthProvider'
import { authStorage } from '../lib/auth/authStorage'
import type { Session } from '../types/auth'

interface RenderOptions {
  /** Ruta inicial del router en memoria. */
  route?: string
  /** Sesión a restaurar antes de renderizar (simula un usuario ya autenticado). */
  session?: Session
}

/** Renderiza `ui` con los mismos proveedores que la app real (router + sesión). */
export function renderWithProviders(
  ui: ReactElement,
  { route = '/', session }: RenderOptions = {},
) {
  if (session) authStorage.save(session)

  return {
    user: userEvent.setup(),
    ...render(
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>{ui}</AuthProvider>
      </MemoryRouter>,
    ),
  }
}
