import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('ejecuta onClick y por defecto no envía formularios', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Guardar</Button>)

    const button = screen.getByRole('button', { name: 'Guardar' })
    await userEvent.click(button)

    expect(onClick).toHaveBeenCalledOnce()
    expect(button).toHaveAttribute('type', 'button')
    expect(button).toHaveClass('btn', 'btn--primary')
  })

  it('muestra el texto de carga y se deshabilita mientras carga', () => {
    render(
      <Button isLoading loadingText="Guardando...">
        Guardar
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Guardando...' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })

  it('aplica la variante secundaria', () => {
    render(<Button variant="secondary">Cancelar</Button>)

    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveClass('btn--secondary')
  })
})
