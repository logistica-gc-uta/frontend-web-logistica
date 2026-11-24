import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StepNav } from './StepNav'

const renderNav = (props: Partial<Parameters<typeof StepNav>[0]> = {}) => {
  const onChange = vi.fn()
  render(
    <StepNav
      noun="Pedidos"
      singular="Pedido"
      label="Páginas de pedidos"
      position={0}
      total={25}
      pageSize={4}
      onChange={onChange}
      {...props}
    />,
  )
  return { onChange, nav: () => screen.getByRole('navigation', { name: 'Páginas de pedidos' }) }
}

describe('StepNav', () => {
  it('no se muestra si todo cabe en una pantalla', () => {
    renderNav({ total: 4 })
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('muestra el rango de la página y desactiva «Anterior» en la primera', async () => {
    const { onChange, nav } = renderNav()

    expect(nav()).toHaveTextContent('Pedidos 1–4 de 25')
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('en la última pantalla usa el singular y desactiva «Siguiente»', async () => {
    const { onChange, nav } = renderNav({ position: 6 })

    expect(nav()).toHaveTextContent('Pedido 25 de 25')
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }))
    expect(onChange).toHaveBeenCalledWith(5)
  })

  it('se maneja con el teclado y anuncia el cambio de página', async () => {
    const { onChange, nav } = renderNav({ position: 1 })

    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Anterior' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toHaveFocus()
    await userEvent.keyboard('{Enter}')

    expect(onChange).toHaveBeenCalledWith(2)
    expect(nav().querySelector('[aria-live="polite"]')).toHaveTextContent('Pedidos 5–8 de 25')
  })
})
