import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TextField } from './TextField'

describe('TextField', () => {
  it('asocia la etiqueta con el campo', () => {
    render(<TextField label="Nombre" />)

    const input = screen.getByLabelText('Nombre')
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(input).not.toHaveAttribute('aria-describedby')
  })

  it('muestra el error y lo vincula al campo de forma accesible', () => {
    render(<TextField label="Nombre" error="El nombre es obligatorio" />)

    const input = screen.getByLabelText('Nombre')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('El nombre es obligatorio')
  })

  it('respeta un id proporcionado', () => {
    render(<TextField label="Código" id="zone-code" />)

    expect(screen.getByLabelText('Código')).toHaveAttribute('id', 'zone-code')
  })
})
