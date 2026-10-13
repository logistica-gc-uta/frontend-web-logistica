import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { zones } from '../../test/fixtures'
import { OrderFilters } from './OrderFilters'
import { NO_FILTERS, type OrderFiltersValue } from './orderFilterValue'

const renderFilters = (value: OrderFiltersValue = NO_FILTERS) => {
  const onChange = vi.fn()
  render(<OrderFilters value={value} zones={zones} onChange={onChange} />)
  return { onChange }
}

describe('OrderFilters', () => {
  it('ofrece todas las zonas y todos los estados', () => {
    renderFilters()

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Todas',
      'FIC-02 · Ficoa',
      'HUA-03 · Huachi',
      'Todos',
      'Pendiente',
      'Asignado a ruta',
      'En camino',
      'Entregado',
      'Cancelado',
    ])
  })

  it('combina el filtro cambiado con los que ya estaban activos', async () => {
    const { onChange } = renderFilters({ date: '2030-02-14', zoneId: '', status: '' })

    await userEvent.selectOptions(screen.getByLabelText('Zona'), 'zone-1')
    expect(onChange).toHaveBeenLastCalledWith({ date: '2030-02-14', zoneId: 'zone-1', status: '' })

    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'PENDING')
    expect(onChange).toHaveBeenLastCalledWith({ date: '2030-02-14', zoneId: '', status: 'PENDING' })

    fireEvent.change(screen.getByLabelText('Fecha de entrega'), { target: { value: '2030-03-01' } })
    expect(onChange).toHaveBeenLastCalledWith({ date: '2030-03-01', zoneId: '', status: '' })
  })

  it('sin filtros activos no ofrece limpiarlos', () => {
    renderFilters()

    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeDisabled()
  })

  it('con filtros activos permite limpiarlos', async () => {
    const { onChange } = renderFilters({ date: '', zoneId: 'zone-1', status: '' })

    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))

    expect(onChange).toHaveBeenCalledWith(NO_FILTERS)
  })
})
