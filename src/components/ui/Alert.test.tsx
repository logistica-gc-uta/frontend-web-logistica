import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Alert } from './Alert'

describe('Alert', () => {
  it('anuncia los errores con role="alert"', () => {
    render(<Alert>Algo salió mal</Alert>)

    expect(screen.getByRole('alert')).toHaveTextContent('Algo salió mal')
  })

  it('anuncia los mensajes de éxito con role="status"', () => {
    render(<Alert variant="success">Guardado</Alert>)

    expect(screen.getByRole('status')).toHaveTextContent('Guardado')
  })
})
