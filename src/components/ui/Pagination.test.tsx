import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Pagination } from './Pagination'

const renderPagination = (page: number, total: number) => {
  const onPageChange = vi.fn()
  render(<Pagination page={page} pageSize={10} total={total} onPageChange={onPageChange} />)
  return { onPageChange }
}

describe('Pagination', () => {
  it('muestra la página actual, el total de páginas y de registros', () => {
    renderPagination(2, 25)

    expect(screen.getByText('Página 2 de 3 · 25 registros')).toBeInTheDocument()
  })

  it('usa el singular con un solo registro', () => {
    renderPagination(1, 1)

    expect(screen.getByText('Página 1 de 1 · 1 registro')).toBeInTheDocument()
  })

  it('en la primera página no permite retroceder', async () => {
    const { onPageChange } = renderPagination(1, 25)

    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('en la última página no permite avanzar', async () => {
    const { onPageChange } = renderPagination(3, 25)

    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }))

    expect(onPageChange).toHaveBeenCalledWith(2)
  })
})
