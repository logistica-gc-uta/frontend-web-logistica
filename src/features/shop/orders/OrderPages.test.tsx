import { screen, waitFor, within } from '@testing-library/react'
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
import { shopProduct } from '../../../test/shopFixtures'
import { customerApiClient } from '../account/customerApiClient'
import { cartStorage } from '../cart/cartStorage'
import { shopService } from '../shopService'
import {
  customerOrdersService,
  ORDER_NOT_FOUND_MESSAGE,
  RECEIPT_UNAVAILABLE_MESSAGE,
  ReceiptUnavailableError,
} from './customerOrdersService'

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
    renderShop('/checkout/confirmacion/ajeno')

    expect(await screen.findByText('No se pudo cargar el pedido')).toBeInTheDocument()
    expect(screen.queryByText('Ya es un detalle nuestro.')).not.toBeInTheDocument()
    expect(cartStorage.load(customer.id)).toHaveLength(1)
  })

  it('muestra pedido, pago, entrega, productos e importes históricos con IVA', async () => {
    vi.spyOn(customerOrdersService, 'detail').mockResolvedValue(orderDetail())
    renderShop('/checkout/confirmacion/pedido-1')

    expect(
      await screen.findByRole('heading', { name: 'Ya es un detalle nuestro.' }),
    ).toBeInTheDocument()
    expect(screen.getByText('RG-2030-0001')).toBeInTheDocument()
    expect(screen.getByText('aprobado')).toBeInTheDocument()
    expect(screen.getByText(/Total pagado: \$83,95/)).toBeInTheDocument()
    expect(screen.getByText('IVA 15 %')).toBeInTheDocument()
    expect(screen.getAllByText('$0,00')).toHaveLength(1)
    expect(screen.queryByText(/simulado|ficticio/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver comprobante' })).toHaveAttribute(
      'href',
      '/mi-cuenta/pedidos/pedido-1/comprobante',
    )
    expect(screen.queryByText(/9000/)).not.toBeInTheDocument()
  })

  it('si el pedido no congeló foto, muestra la del catálogo dentro del recuadro', async () => {
    vi.spyOn(customerOrdersService, 'detail').mockResolvedValue(orderDetail())
    vi.spyOn(shopService, 'product').mockResolvedValue(shopProduct())
    renderShop('/checkout/confirmacion/pedido-1')

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Ramo de rosas' })).toHaveAttribute(
        'src',
        shopProduct().primaryImageUrl,
      )
    })
    expect(screen.queryByText('Imagen no disponible')).not.toBeInTheDocument()
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
    renderShop('/mi-cuenta/pedidos')

    const firstLink = await screen.findByRole('link', { name: /Pedido RG-2030-0001/ })
    expect(firstLink).toHaveAttribute('href', '/mi-cuenta/pedidos/pedido-1')
    expect(within(firstLink).getByText('Pendiente de despacho')).toBeInTheDocument()
    expect(within(firstLink).getByText('$83,95')).toBeInTheDocument()
    // No enlaces internos duplicados en la fila
    expect(
      within(firstLink).queryByRole('link', { name: 'Ver detalle y seguimiento' }),
    ).not.toBeInTheDocument()
    expect(within(firstLink).queryByRole('link', { name: 'Comprobante' })).not.toBeInTheDocument()

    const secondLink = screen.getByRole('link', { name: 'Pedido RG-2 · Compra en la web' })
    expect(secondLink).toHaveAttribute('href', '/mi-cuenta/pedidos/pedido-2')
    expect(within(secondLink).getByText('En camino')).toBeInTheDocument()
    expect(within(secondLink).getByText('$11,49')).toBeInTheDocument()
  })

  it('si el listado no trae foto, muestra la del catálogo en la miniatura', async () => {
    vi.spyOn(customerOrdersService, 'list').mockResolvedValue({
      items: [orderSummary()],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    })
    vi.spyOn(shopService, 'product').mockResolvedValue(shopProduct())
    renderShop('/mi-cuenta/pedidos')

    const row = await screen.findByRole('link', { name: /Pedido RG-2030-0001/ })
    await waitFor(() => {
      expect(row.querySelector('img')).toHaveAttribute('src', shopProduct().primaryImageUrl)
    })
    expect(within(row).queryByText('Imagen no disponible')).not.toBeInTheDocument()
  })

  it('filtro horizontal con botón para limpiar filtros que reinicia estado y página', async () => {
    const list = vi.spyOn(customerOrdersService, 'list').mockResolvedValue({
      items: [orderSummary()],
      total: 11,
      page: 1,
      pageSize: 10,
      totalPages: 2,
    })
    const { user } = renderShop('/mi-cuenta/pedidos')
    await screen.findByRole('link', { name: /Pedido RG-2030-0001/ })

    await user.selectOptions(screen.getByLabelText('Estado del pedido'), 'DELIVERED')
    expect(list).toHaveBeenLastCalledWith(1, 10, 'DELIVERED')

    const resetBtn = screen.getByRole('button', { name: 'Limpiar filtros' })
    await user.click(resetBtn)
    expect(list).toHaveBeenLastCalledWith(1, 10, undefined)
  })

  it('consulta el estado en el servidor, reinicia la página y mantiene los totales reales', async () => {
    const list = vi.spyOn(customerOrdersService, 'list').mockResolvedValue({
      items: [orderSummary()],
      total: 11,
      page: 1,
      pageSize: 10,
      totalPages: 2,
    })
    const { user } = renderShop('/mi-cuenta/pedidos')
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
      items: [orderSummary()],
      total: 11,
      page: 1,
      pageSize: 10,
      totalPages: 2,
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
    const { user } = renderShop('/mi-cuenta/pedidos')

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
    renderShop('/mi-cuenta/pedidos/pedido-1')

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
      '/productos/p-rosas',
    )
    expect(screen.queryByRole('button', { name: /estado/i })).not.toBeInTheDocument()
  })

  it('un pedido con cobertura de tienda (sin zona) muestra solo la dirección', async () => {
    const detail = orderDetail()
    vi.spyOn(customerOrdersService, 'detail').mockResolvedValue({
      ...detail,
      delivery: { ...detail.delivery, zoneName: null },
    })
    renderShop('/mi-cuenta/pedidos/pedido-1')

    const where = await screen.findByText('Av. Cevallos y Montalvo')
    expect(where).toHaveTextContent(/^Av\. Cevallos y Montalvo$/)
    expect(screen.queryByText(/· null/)).not.toBeInTheDocument()
  })

  it('un pedido ajeno o inexistente no expone información', async () => {
    vi.spyOn(customerOrdersService, 'detail').mockRejectedValue(new Error('x'))
    renderShop('/mi-cuenta/pedidos/ajeno')
    expect(await screen.findByText('No se pudo cargar el pedido')).toBeInTheDocument()
    expect(screen.queryByText('Ana Regalo')).not.toBeInTheDocument()
  })
})

describe('Shop · importes históricos', () => {
  it('no llama gratis a un envío con importe y conserva el IVA desactivado', async () => {
    vi.spyOn(customerOrdersService, 'detail').mockResolvedValue(
      orderDetail({
        taxEnabled: false,
        taxAmountCents: 0,
        shippingAmountCents: 450,
        totalCents: 7750,
      }),
    )
    renderShop('/mi-cuenta/pedidos/pedido-1')
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
    const { user } = renderShop('/mi-cuenta/pedidos/pedido-1/comprobante')

    expect(
      await screen.findByRole('heading', { name: 'Comprobante de compra' }),
    ).toBeInTheDocument()
    expect(screen.getByText('CMP-RG-2030-0001')).toBeInTheDocument()
    expect(screen.queryByText(/SIN VALIDEZ TRIBUTARIA|simulado/i)).not.toBeInTheDocument()
    // La tasa es la del momento de la compra (12 %), no la vigente.
    expect(screen.getByText('IVA 12 % (tasa al comprar)')).toBeInTheDocument()
    expect(screen.getByText('$8,76')).toBeInTheDocument()
    expect(screen.getByText('$81,76')).toBeInTheDocument()
    expect(
      screen.getByText(/PAY-DEMO-1 · tarjeta de demostración terminada en 0001/),
    ).toBeInTheDocument()
    expect(await screen.findByText(/Av. Cevallos y Montalvo/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Imprimir comprobante' }))
    expect(print).toHaveBeenCalled()
    expect(screen.queryByText(receipt().disclaimer)).not.toBeInTheDocument()
  })
})

describe('Shop · historial unificado (#35)', () => {
  /** Pedido antiguo que se conserva sin comprobante: sin número, importes, productos ni fotos. */
  const withoutReceipt = {
    receiptAvailable: false,
    number: null,
    receiptId: null,
    paymentStatus: null,
    itemsCount: null,
    primaryImageUrl: null,
    primaryProductId: null,
    subtotalCents: null,
    taxAmountCents: null,
    taxRateBps: null,
    taxEnabled: null,
    shippingAmountCents: null,
    totalCents: null,
  } as const

  it('una sola lista con compras de la web y de la tienda, cada una con su origen', async () => {
    vi.spyOn(customerOrdersService, 'list').mockResolvedValue({
      items: [
        orderSummary({ id: 'tienda-1', number: 'RG-T1', source: 'ADMIN', totalCents: 2300 }),
        orderSummary({ id: 'web-1', number: 'RG-W1', source: 'SHOP' }),
        orderSummary({ id: 'antiguo-1', source: 'SHOP', ...withoutReceipt }),
      ],
      total: 3,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    })
    renderShop('/mi-cuenta/pedidos')

    const store = await screen.findByRole('link', { name: 'Pedido RG-T1 · Registrada en tienda' })
    expect(within(store).getByText('Registrada en tienda')).toBeInTheDocument()
    expect(within(store).getByText('$23,00')).toBeInTheDocument()
    const web = screen.getByRole('link', { name: 'Pedido RG-W1 · Compra en la web' })
    expect(within(web).getByText('Compra en la web')).toBeInTheDocument()

    // El pedido sin comprobante sigue visible, sin número ni importe inventados.
    const old = screen.getByRole('link', { name: 'Pedido sin comprobante · Compra en la web' })
    expect(old).toHaveAttribute('href', '/mi-cuenta/pedidos/antiguo-1')
    expect(within(old).getByText('Sin comprobante')).toBeInTheDocument()
    expect(within(old).getByText('Importe no disponible')).toBeInTheDocument()
    expect(within(old).getByText('Productos no disponibles')).toBeInTheDocument()
    expect(within(old).queryByText(/\$/)).not.toBeInTheDocument()
    // Se respeta el orden del servidor (más recientes primero).
    const links = screen.getAllByRole('link', { name: /^Pedido / })
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/mi-cuenta/pedidos/tienda-1',
      '/mi-cuenta/pedidos/web-1',
      '/mi-cuenta/pedidos/antiguo-1',
    ])
  })

  it('una compra registrada en tienda no se presenta como pago con tarjeta', async () => {
    vi.spyOn(customerOrdersService, 'detail').mockResolvedValue(
      orderDetail({ source: 'ADMIN', paymentStatus: 'APPROVED' }),
    )
    renderShop('/mi-cuenta/pedidos/pedido-1')

    expect(await screen.findByText('Pago registrado en la tienda')).toBeInTheDocument()
    expect(screen.getByText(/no es una verificación bancaria/)).toBeInTheDocument()
    expect(screen.getByText('Registrada en tienda')).toBeInTheDocument()
    expect(screen.queryByText(/tarjeta/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver comprobante' })).toBeInTheDocument()
  })

  it('una compra de la web dice que se pagó con la tarjeta de demostración', async () => {
    vi.spyOn(customerOrdersService, 'detail').mockResolvedValue(orderDetail())
    renderShop('/mi-cuenta/pedidos/pedido-1')

    expect(await screen.findByText('Pago aprobado con tarjeta de demostración')).toBeInTheDocument()
    expect(screen.getByText('Compra en la web')).toBeInTheDocument()
  })

  it('un pedido sin comprobante muestra su seguimiento real sin reconstruir productos ni importes', async () => {
    vi.spyOn(customerOrdersService, 'detail').mockResolvedValue(
      orderDetail({
        ...withoutReceipt,
        items: [],
        recipient: null,
        timeline: [{ code: 'PENDING', label: 'Pedido registrado', at: '2030-02-10T15:00:00Z' }],
      }),
    )
    renderShop('/mi-cuenta/pedidos/pedido-1')

    expect(
      await screen.findByRole('heading', { name: 'Pedido sin comprobante', level: 1 }),
    ).toBeInTheDocument()
    expect(screen.getByText('Pedido registrado')).toBeInTheDocument()
    expect(
      screen.getByText('El detalle de productos e importes no está disponible para este pedido.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Datos de quien recibe no disponibles')).toBeInTheDocument()
    expect(screen.getByText('Pago sin comprobante disponible')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Ver comprobante' })).not.toBeInTheDocument()
    expect(screen.getByText(RECEIPT_UNAVAILABLE_MESSAGE)).toBeInTheDocument()
    expect(within(screen.getByRole('main')).queryByText(/\$\d/)).not.toBeInTheDocument()
  })

  it('el comprobante de una compra en tienda muestra el pago declarado, sin tarjeta', async () => {
    vi.spyOn(customerOrdersService, 'receipt').mockResolvedValue(
      receipt({
        buyer: { name: customer.name, email: customer.email, phone: '0991234567' },
        recipient: { name: 'Ana Regalo', phone: '0987654321' },
        payment: {
          kind: 'ADMIN_DECLARED_EXTERNAL',
          status: 'DECLARED',
          method: 'TRANSFER',
          declaredAt: '2030-02-10T15:00:00Z',
        },
      }),
    )
    vi.spyOn(customerOrdersService, 'detail').mockResolvedValue(orderDetail({ source: 'ADMIN' }))
    renderShop('/mi-cuenta/pedidos/pedido-1/comprobante')

    expect(
      await screen.findByText(/Pago declarado en la tienda: transferencia/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Registrado en la tienda/)).toBeInTheDocument()
    expect(screen.getByText('Ana Regalo · 0987654321')).toBeInTheDocument()
    expect(screen.queryByText(/tarjeta/i)).not.toBeInTheDocument()
  })

  it('sin comprobante lo dice y lleva al detalle del pedido', async () => {
    vi.spyOn(customerOrdersService, 'receipt').mockRejectedValue(new ReceiptUnavailableError())
    vi.spyOn(customerOrdersService, 'detail').mockResolvedValue(orderDetail())
    renderShop('/mi-cuenta/pedidos/pedido-1/comprobante')

    expect(await screen.findByText(RECEIPT_UNAVAILABLE_MESSAGE)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver el detalle del pedido' })).toHaveAttribute(
      'href',
      '/mi-cuenta/pedidos/pedido-1',
    )
  })

  it('el comprobante de un pedido ajeno no revela nada ni ofrece su detalle', async () => {
    vi.spyOn(customerOrdersService, 'receipt').mockRejectedValue(new Error(ORDER_NOT_FOUND_MESSAGE))
    vi.spyOn(customerOrdersService, 'detail').mockRejectedValue(new Error(ORDER_NOT_FOUND_MESSAGE))
    renderShop('/mi-cuenta/pedidos/ajeno/comprobante')

    expect(await screen.findByRole('link', { name: 'Ver mis pedidos' })).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Ver el detalle del pedido' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Ana Regalo')).not.toBeInTheDocument()
  })
})
