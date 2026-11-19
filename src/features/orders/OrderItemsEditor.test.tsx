import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { products } from '../../test/fixtures'
import { OrderItemsEditor } from './OrderItemsEditor'
import type { OrderItemFormValue } from './types'

const twoItems: OrderItemFormValue[] = [
  { productId: 'product-1', quantity: '1' },
  { productId: 'product-2', quantity: '2' },
]

const renderEditor = (items: OrderItemFormValue[], error?: string) => {
  const onChange = vi.fn()
  render(<OrderItemsEditor items={items} products={products} onChange={onChange} error={error} />)
  return { onChange }
}

describe('OrderItemsEditor', () => {
  it('muestra una fila por línea con el producto elegido y su cantidad', () => {
    renderEditor(twoItems)

    expect(screen.getByLabelText('Producto 1')).toHaveValue('Laptop HP Pavilion 15')
    expect(screen.getByLabelText('Cantidad 2')).toHaveValue(2)
  })

  it('al abrir lista los productos con precio y stock', async () => {
    renderEditor(twoItems)

    await userEvent.click(screen.getByLabelText('Producto 1'))

    const option = screen.getByRole('option', { name: /Laptop HP Pavilion 15/ })
    expect(option).toHaveTextContent(/750,00 · 15 en stock/)
    expect(option).toHaveAttribute('aria-selected', 'true')
  })

  it('filtra escribiendo, sin importar mayúsculas ni tildes, y avisa si nada coincide', async () => {
    renderEditor(twoItems)
    await userEvent.click(screen.getByLabelText('Producto 1'))

    await userEvent.type(screen.getByLabelText('Producto 1'), 'MOUSE')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.getByRole('option', { name: /Mouse/ })).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('Producto 1'))
    await userEvent.type(screen.getByLabelText('Producto 1'), 'zzz')
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    expect(screen.getByText('Ningún producto coincide')).toBeInTheDocument()
  })

  it('se elige con el teclado: flechas, Enter y Escape', async () => {
    const { onChange } = renderEditor(twoItems)
    const input = screen.getByLabelText('Producto 2')

    await userEvent.click(input)
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0][0]).toEqual(twoItems[0])

    await userEvent.click(input)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('cambia el producto de una línea sin tocar las demás', async () => {
    const { onChange } = renderEditor(twoItems)

    await userEvent.click(screen.getByLabelText('Producto 2'))
    await userEvent.click(screen.getByRole('option', { name: /Laptop HP Pavilion 15/ }))

    expect(onChange).toHaveBeenCalledWith([
      { productId: 'product-1', quantity: '1' },
      { productId: 'product-1', quantity: '2' },
    ])
  })

  it('cambia la cantidad de una línea', () => {
    const { onChange } = renderEditor(twoItems)

    fireEvent.change(screen.getByLabelText('Cantidad 1'), { target: { value: '5' } })

    expect(onChange).toHaveBeenCalledWith([
      { productId: 'product-1', quantity: '5' },
      { productId: 'product-2', quantity: '2' },
    ])
  })

  it('agrega una línea vacía con cantidad 1', async () => {
    const { onChange } = renderEditor(twoItems)

    await userEvent.click(screen.getByRole('button', { name: 'Agregar producto' }))

    expect(onChange).toHaveBeenCalledWith([...twoItems, { productId: '', quantity: '1' }])
  })

  it('quita la línea elegida', async () => {
    const { onChange } = renderEditor(twoItems)

    await userEvent.click(screen.getByRole('button', { name: 'Quitar producto 1' }))

    expect(onChange).toHaveBeenCalledWith([{ productId: 'product-2', quantity: '2' }])
  })

  it('no permite quitar la única línea', () => {
    renderEditor([twoItems[0]])

    expect(screen.getByRole('button', { name: 'Quitar producto 1' })).toBeDisabled()
  })

  it('muestra el error de las líneas', () => {
    renderEditor(twoItems, 'Producto 1: selecciona un producto')

    expect(screen.getByRole('alert')).toHaveTextContent('Producto 1: selecciona un producto')
  })
})
