import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SelectField } from './SelectField'

describe('SelectField', () => {
  it('asocia la etiqueta con la lista y muestra sus opciones', () => {
    render(
      <SelectField label="Zona" defaultValue="">
        <option value="">Selecciona</option>
        <option value="z1">Ficoa</option>
      </SelectField>,
    )

    const select = screen.getByLabelText('Zona')
    expect(select).toHaveRole('combobox')
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Selecciona',
      'Ficoa',
    ])
    expect(select).not.toHaveAttribute('aria-invalid')
  })

  it('notifica la opción elegida', async () => {
    const onChange = vi.fn()
    render(
      <SelectField label="Zona" value="" onChange={onChange}>
        <option value="">Selecciona</option>
        <option value="z1">Ficoa</option>
      </SelectField>,
    )

    await userEvent.selectOptions(screen.getByLabelText('Zona'), 'z1')

    expect(onChange).toHaveBeenCalledOnce()
  })

  it('muestra el error y lo vincula a la lista de forma accesible', () => {
    render(
      <SelectField label="Zona" error="Selecciona una zona">
        <option value="">Selecciona</option>
      </SelectField>,
    )

    const select = screen.getByLabelText('Zona')
    expect(select).toHaveAttribute('aria-invalid', 'true')
    expect(select).toHaveAccessibleDescription('Selecciona una zona')
  })
})
