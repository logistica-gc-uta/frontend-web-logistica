import { fireEvent, render, screen, within } from '@testing-library/react'
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
  it('muestra una fila por línea con sus opciones de producto y el stock', () => {
    renderEditor(twoItems)

    expect(screen.getByLabelText('Producto 1')).toHaveValue('product-1')
    expect(screen.getByLabelText('Cantidad 2')).toHaveValue(2)
    expect(
      within(screen.getByLabelText('Producto 1')).getByRole('option', {
        name: /Laptop HP Pavilion 15 · .*750,00 · 15 en stock/,
      }),
    ).toBeInTheDocument()
  })

  it('cambia el producto de una línea sin tocar las demás', async () => {
    const { onChange } = renderEditor(twoItems)

    await userEvent.selectOptions(screen.getByLabelText('Producto 2'), 'product-1')

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
