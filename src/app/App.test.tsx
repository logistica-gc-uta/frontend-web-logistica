import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '../test/renderWithRouter'
import { App } from './App'
import { paths } from './paths'

describe('App', () => {
  it('muestra la página de inicio en la ruta principal', () => {
    renderWithRouter(<App />, { route: paths.home })

    expect(screen.getByRole('heading', { name: 'Sistema de Logística' })).toBeInTheDocument()
  })

  it('muestra la página 404 en rutas desconocidas y permite volver al inicio', async () => {
    const { user } = renderWithRouter(<App />, { route: '/ruta-inexistente' })

    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Volver al inicio' }))

    expect(screen.getByRole('heading', { name: 'Sistema de Logística' })).toBeInTheDocument()
  })
})
