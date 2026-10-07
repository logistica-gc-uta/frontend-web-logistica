import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'

/** Renderiza un componente dentro de un router en memoria, iniciando en `route`. */
export function renderWithRouter(ui: ReactElement, { route = '/' } = {}) {
  return {
    user: userEvent.setup(),
    ...render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>),
  }
}
