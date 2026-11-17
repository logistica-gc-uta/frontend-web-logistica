import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { OrderFilters } from './OrderFilters'
import { NO_FILTERS, type OrderFiltersValue } from './orderFilterValue'

const renderFilters = (value: OrderFiltersValue = NO_FILTERS) => {
  const onChange = vi.fn()
  render(<OrderFilters value={value} onChange={onChange} />)
  return { onChange }
}

describe('OrderFilters', () => {
  it('ofrece los estados sin selector de zonas', () => {
    renderFilters()

    expect(screen.queryByLabelText('Zona')).not.toBeInTheDocument()
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Todos',
      'Pendiente',
      'Asignado a ruta',
      'En camino',
      'Entregado',
      'Cancelado',
    ])
  })

  it('combina el filtro cambiado con los que ya estaban activos', async () => {
    const { onChange } = renderFilters({ date: '2030-02-14', status: '' })

    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'PENDING')
    expect(onChange).toHaveBeenLastCalledWith({ date: '2030-02-14', status: 'PENDING' })

    fireEvent.change(screen.getByLabelText('Fecha de entrega'), { target: { value: '2030-03-01' } })
    expect(onChange).toHaveBeenLastCalledWith({ date: '2030-03-01', status: '' })
  })

  it('sin filtros activos no ofrece limpiarlos', () => {
    renderFilters()

    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeDisabled()
  })

  it('con filtros activos permite limpiarlos', async () => {
    const { onChange } = renderFilters({ date: '', status: 'PENDING' })

    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))

    expect(onChange).toHaveBeenCalledWith(NO_FILTERS)
  })
})
