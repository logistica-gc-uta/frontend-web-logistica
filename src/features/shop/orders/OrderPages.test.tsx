import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import {
  customer,
  orderDetail,
  orderSummary,
  receipt,
  signInCustomer,
} from '../../../test/checkoutFixtures'
import { createHttpError, createHttpResponse } from '../../../test/http'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { customerApiClient } from '../account/customerApiClient'
import { cartStorage } from '../cart/cartStorage'
import { customerOrdersService, ORDER_NOT_FOUND_MESSAGE } from './customerOrdersService'

const renderShop = (route: string) => renderWithProviders(<App />, { route })

beforeEach(() => signInCustomer())
afterEach(() => sessionStorage.clear())

describe('customerOrdersService', () => {
  it('lista los pedidos propios paginados y trae detalle y comprobante por el ID del pedido', async () => {
    const get = vi.spyOn(customerApiClient, 'get').mockResolvedValue(createHttpResponse({}))
    await customerOrdersService.list(2)
    await customerOrdersService.detail('p 1')
    await customerOrdersService.receipt('p1')

    expect(get).toHaveBeenNthCalledWith(1, '/shop/orders', { params: { page: 2, pageSize: 10 } })
    expect(get).toHaveBeenNthCalledWith(2, '/shop/orders/p%201')
    expect(get).toHaveBeenNthCalledWith(3, '/shop/orders/p1/receipt')
  })

  it.each([404, 403, 400])(
    'un pedido ajeno o inexistente (%i) se informa igual',
    async (status) => {
      vi.spyOn(customerApiClient, 'get').mockRejectedValue(createHttpError(status))
      await expect(customerOrdersService.detail('x')).rejects.toThrow(ORDER_NOT_FOUND_MESSAGE)
      await expect(customerOrdersService.receipt('x')).rejects.toThrow(ORDER_NOT_FOUND_MESSAGE)
    },
  )
})

describe('Shop · confirmación', () => {
  it('abierta a mano no vacía el carrito ni inventa un éxito si el pedido no es propio', async () => {
    cartStorage.save([{ productId: 'p1', quantity: 1 }], customer.id)
    vi.spyOn(customerOrdersService, 'detail').mockRejectedValue(new Error(ORDER_NOT_FOUND_MESSAGE))
    renderShop('/shop/confirmacion/ajeno')

    expect(await screen.findByText('No se pudo cargar el pedido')).toBeInTheDocument()
    expect(screen.queryByText('¡Compra confirmada!')).not.toBeInTheDocument()
    expect(cartStorage.load(customer.id)).toHaveLength(1)
  })

  it('muestra pedido, pago, entrega, productos e importes históricos con IVA', async () => {
    vi.spyOn(customerOrdersService, 'detail').mockResolvedValue(orderDetail())
    renderShop('/shop/confirmacion/pedido-1')

    expect(await screen.findByRole('heading', { name: '¡Compra confirmada!' })).toBeInTheDocument()
    expect(screen.getByText('RG-2030-0001')).toBeInTheDocument()
    expect(screen.getByText('aprobado')).toBeInTheDocument()
    expect(screen.getByText(/Total pagado: \$83,95/)).toBeInTheDocument()
    expect(screen.getByText('IVA 15 %')).toBeInTheDocument()
    expect(screen.getAllByText('$0,00')).toHaveLength(1)
    expect(screen.queryByText(/simulado|ficticio/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver comprobante' })).toHaveAttribute(
      'href',
      '/shop/mis-pedidos/pedido-1/comprobante',
    )
    expect(screen.queryByText(/9000/)).not.toBeInTheDocument()
  })
})

describe('Shop · mis pedidos', () => {
  it('lista cada pedido en una fila completa con enlace nativo de 5 columnas sin enlaces duplicados', async () => {
    vi.spyOn(customerOrdersService, 'list').mockResolvedValue({
      items: [
        orderSummary(),
        orderSummary({ id: 'pedido-2', number: 'RG-2', status: 'IN_TRANSIT', totalCents: 1149 }),
      ],
      total: 2,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    })
    renderShop('/shop/mis-pedidos')

    const firstLink = await screen.findByRole('link', { name: /Pedido RG-2030-0001/ })
    expect(firstLink).toHaveAttribute('href', '/shop/mis-pedidos/pedido-1')
    expect(within(firstLink).getByText('Pendiente de despacho')).toBeInTheDocument()
    expect(within(firstLink).getByText('$83,95')).toBeInTheDocument()
    // No enlaces internos duplicados en la fila
    expect(within(firstLink).queryByRole('link', { name: 'Ver detalle y seguimiento' })).not.toBeInTheDocument()
    expect(within(firstLink).queryByRole('link', { name: 'Comprobante' })).not.toBeInTheDocument()

    const secondLink = screen.getByRole('link', { name: 'Pedido RG-2' })
    expect(secondLink).toHaveAttribute('href', '/shop/mis-pedidos/pedido-2')
    expect(within(secondLink).getByText('En camino')).toBeInTheDocument()
    expect(within(secondLink).getByText('$11,49')).toBeInTheDocument()
  })

  it('filtro horizontal con botón para limpiar filtros que reinicia estado y página', async () => {
    const list = vi.spyOn(customerOrdersService, 'list').mockResolvedValue({
      items: [orderSummary()], total: 11, page: 1, pageSize: 10, totalPages: 2,
    })
    const { user } = renderShop('/shop/mis-pedidos')
    await screen.findByRole('link', { name: /Pedido RG-2030-0001/ })

    await user.selectOptions(screen.getByLabelText('Estado del pedido'), 'DELIVERED')
    expect(list).toHaveBeenLastCalledWith(1, 10, 'DELIVERED')

    const resetBtn = screen.getByRole('button', { name: 'Limpiar filtros' })
    await user.click(resetBtn)
    expect(list).toHaveBeenLastCalledWith(1, 10, undefined)
  })

  it('consulta el estado en el servidor, reinicia la página y mantiene los totales reales', async () => {
    const list = vi.spyOn(customerOrdersService, 'list').mockResolvedValue({
      items: [orderSummary()], total: 11, page: 1, pageSize: 10, totalPages: 2,
    })
    const { user } = renderShop('/shop/mis-pedidos')
    await screen.findByRole('link', { name: /Pedido RG-2030-0001/ })
    expect(list).toHaveBeenLastCalledWith(1, 10, undefined)
    expect(screen.getByText('Página 1 de 2 · 11 registros')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await screen.findByRole('link', { name: /Pedido RG-2030-0001/ })
    expect(list).toHaveBeenLastCalledWith(2, 10, undefined)
    list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 })
    await user.selectOptions(screen.getByLabelText('Estado del pedido'), 'DELIVERED')
    expect(await screen.findByText('No encontramos pedidos con ese estado')).toBeInTheDocument()
    expect(list).toHaveBeenLastCalledWith(1, 10, 'DELIVERED')
    list.mockResolvedValue({
      items: [orderSummary()], total: 11, page: 1, pageSize: 10, totalPages: 2,
    })
    await user.selectOptions(screen.getByLabelText('Estado del pedido'), '')
    await screen.findByRole('link', { name: /Pedido RG-2030-0001/ })
    expect(list).toHaveBeenLastCalledWith(1, 10, undefined)
  })

  it('sin pedidos invita a explorar; si falla permite reintentar', async () => {
    const list = vi
      .spyOn(customerOrdersService, 'list')
      .mockRejectedValueOnce(createHttpError(500))
      .mockResolvedValueOnce({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 })
    const { user } = renderShop('/shop/mis-pedidos')

    await user.click(await screen.findByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Tu próximo detalle empieza aquí')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Explorar regalos' })).toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
  })
})

describe('Shop · detalle y seguimiento', () => {
  it('muestra banner de entrega, Para quién, Dónde, pago y seguimiento con fechas del backend', async () => {
    vi.spyOn(customerOrdersService, 'detail').mockResolvedValue(
      orderDetail({
        status: 'IN_TRANSIT',
        timeline: [
          { code: 'PENDING', label: 'Pedido registrado', at: '2030-02-10T15:00:00Z' },
          { code: 'ASSIGNED', label: 'Asignado a una ruta', at: '2030-02-11T13:00:00Z' },
          { code: 'IN_TRANSIT', label: 'En camino', at: '2030-02-15T14:00:00Z' },
        ],
      }),
    )
    renderShop('/shop/mis-pedidos/pedido-1')

    // Banner de entrega
    expect(await screen.findByText(/Entrega programada/)).toBeInTheDocument()
    expect(screen.getByText(/Ecuador/)).toBeInTheDocument()

    // Para quién / Dónde
    expect(screen.getByRole('heading', { level: 3, name: 'Para quién' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Dónde' })).toBeInTheDocument()
    expect(screen.getByText(/Ana Regalo · 0991234567/)).toBeInTheDocument()
    expect(screen.getByText(/Av. Cevallos y Montalvo · Centro/)).toBeInTheDocument()

    // Recorrido
    const timeline = screen.getByRole('region', { name: 'Recorrido del pedido' })
    expect(within(timeline).getAllByRole('listitem')).toHaveLength(3)
    expect(within(timeline).getByText('Asignado a una ruta')).toBeInTheDocument()

    // Pago
    expect(screen.getByText(/Pago aprobado/)).toBeInTheDocument()

    // Enlaces de productos e importes
    expect(screen.getByText(/\$36,50 c\/u al comprar/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver Ramo de rosas' })).toHaveAttribute(
      'href',
      '/shop/productos/p-rosas',
    )
    expect(screen.queryByRole('button', { name: /estado/i })).not.toBeInTheDocument()
  })

  it('un pedido ajeno o inexistente no expone información', async () => {
    vi.spyOn(customerOrdersService, 'detail').mockRejectedValue(new Error('x'))
    renderShop('/shop/mis-pedidos/ajeno')
    expect(await screen.findByText('No se pudo cargar el pedido')).toBeInTheDocument()
    expect(screen.queryByText('Ana Regalo')).not.toBeInTheDocument()
  })
})

describe('Shop · importes históricos', () => {
  it('no llama gratis a un envío con importe y conserva el IVA desactivado', async () => {
    vi.spyOn(customerOrdersService, 'detail').mockResolvedValue(orderDetail({
      taxEnabled: false, taxAmountCents: 0, shippingAmountCents: 450, totalCents: 7750,
    }))
    renderShop('/shop/mis-pedidos/pedido-1')
    expect(await screen.findByText('IVA no aplicado')).toBeInTheDocument()
    expect(screen.getByText('$4,50')).toBeInTheDocument()
    expect(screen.getByText('$77,50')).toBeInTheDocument()
    expect(within(screen.getByRole('main')).queryByText(/gratis|simulado/i)).not.toBeInTheDocument()
  })
})

describe('Shop · comprobante de compra', () => {
  it('omite la leyenda en pantalla e impresión y conserva los importes históricos sin la tarjeta completa', async () => {
    vi.spyOn(customerOrdersService, 'receipt').mockResolvedValue(
      receipt({ tax: { enabled: true, ratePercent: 12, amountCents: 876 }, totalCents: 8176 }),
    )
    vi.spyOn(customerOrdersService, 'detail').mockResolvedValue(orderDetail())
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    const { user } = renderShop('/shop/mis-pedidos/pedido-1/comprobante')

    expect(
      await screen.findByRole('heading', { name: 'Comprobante de compra' }),
    ).toBeInTheDocument()
    expect(screen.getByText('CMP-RG-2030-0001')).toBeInTheDocument()
    expect(screen.queryByText(/SIN VALIDEZ TRIBUTARIA|simulado/i)).not.toBeInTheDocument()
    // La tasa es la del momento de la compra (12 %), no la vigente.
    expect(screen.getByText('IVA 12 % (tasa al comprar)')).toBeInTheDocument()
    expect(screen.getByText('$8,76')).toBeInTheDocument()
    expect(screen.getByText('$81,76')).toBeInTheDocument()
    expect(screen.getByText(/PAY-DEMO-1 · tarjeta terminada en 0001/)).toBeInTheDocument()
    expect(await screen.findByText(/Av. Cevallos y Montalvo/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Imprimir' }))
    expect(print).toHaveBeenCalled()
    expect(screen.queryByText(receipt().disclaimer)).not.toBeInTheDocument()
  })
})
