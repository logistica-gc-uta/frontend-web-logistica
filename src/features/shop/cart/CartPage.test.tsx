import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { createHttpError } from '../../../test/http'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { shopProduct, shopSettings } from '../../../test/shopFixtures'
import { ProductNotFoundError, shopService } from '../shopService'
import type { ShopProduct, ShopSettings } from '../types'
import { cartStorage } from './cartStorage'
import { buildCartView, simulatedTaxCents } from './cartView'

const ROSES = shopProduct({ id: 'p-rosas', name: 'Ramo de rosas', priceCents: 3650, stock: 20 })
const MUG = shopProduct({ id: 'p-taza', name: 'Taza', priceCents: 1000, stock: 2 })

function mockApi(
  products: Record<string, ShopProduct | Error>,
  settings: ShopSettings = shopSettings(),
) {
  vi.spyOn(shopService, 'settings').mockResolvedValue(settings)
  return vi.spyOn(shopService, 'product').mockImplementation(async (id) => {
    const found = products[id]
    if (!found) throw new ProductNotFoundError()
    if (found instanceof Error) throw found
    return found
  })
}

const renderCart = () => renderWithProviders(<App />, { route: '/shop/carrito' })

afterEach(() => sessionStorage.clear())

describe('cálculo del resumen estimado', () => {
  it('usa el mismo redondeo HALF_UP del backend', () => {
    expect(simulatedTaxCents(7300, 1500)).toBe(1095)
    expect(simulatedTaxCents(999, 1500)).toBe(150)
    expect(simulatedTaxCents(1, 1500)).toBe(0)
    expect(simulatedTaxCents(4, 1250)).toBe(1)
  })

  it('$73,00 + IVA simulado 15 % ($10,95) + envío $0 = $83,95; con otra tasa o desactivado cambia', () => {
    const items = [{ productId: 'p-rosas', quantity: 2 }]
    const products = new Map([['p-rosas', ROSES]])

    expect(buildCartView(items, products, shopSettings()).estimate).toEqual({
      units: 2,
      subtotalCents: 7300,
      taxEnabled: true,
      taxPercent: 15,
      taxCents: 1095,
      shippingCents: 0,
      totalCents: 8395,
    })
    const twelve = shopSettings({ tax: { enabled: true, rateBps: 1200, ratePercent: 12 } })
    expect(buildCartView(items, products, twelve).estimate.totalCents).toBe(8176)
    const off = shopSettings({ tax: { enabled: false, rateBps: 1500, ratePercent: 15 } })
    expect(buildCartView(items, products, off).estimate).toEqual(
      expect.objectContaining({ taxCents: 0, totalCents: 7300 }),
    )
  })

  it('marca cada problema y no deja pasar al checkout mientras exista', () => {
    const view = buildCartView(
      [
        { productId: 'p-rosas', quantity: 11 },
        { productId: 'p-taza', quantity: 3 },
        { productId: 'p-agotado', quantity: 1 },
        { productId: 'p-borrado', quantity: 1 },
      ],
      new Map<string, ShopProduct | null>([
        ['p-rosas', ROSES],
        ['p-taza', MUG],
        ['p-agotado', shopProduct({ id: 'p-agotado', stock: 0, isAvailable: false })],
        ['p-borrado', null],
      ]),
      shopSettings(),
    )

    expect(view.lines.map((line) => line.problem?.kind)).toEqual([
      'OVER_LIMIT',
      'NOT_ENOUGH_STOCK',
      'SOLD_OUT',
      'UNAVAILABLE',
    ])
    expect(view.lines.map((line) => line.maximum)).toEqual([10, 2, 0, 0])
    expect(view.canCheckout).toBe(false)
    expect(view.estimate.subtotalCents).toBe(0)
  })
})

describe('Shop · carrito', () => {
  it('usa la copia de bolsa del boceto aprobado', async () => {
    cartStorage.save([{ productId: 'p-rosas', quantity: 1 }])
    mockApi({ 'p-rosas': ROSES })
    renderCart()

    expect(await screen.findByRole('heading', { name: 'Tu bolsa de regalos' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Continuar a la entrega/ })).toHaveAttribute(
      'href',
      '/shop/checkout',
    )
    expect(screen.getByRole('button', { name: 'Quitar Ramo de rosas' })).toBeInTheDocument()
  })

  it('06A · vacío: sin líneas, resumen en cero y sin checkout', async () => {
    vi.spyOn(shopService, 'settings').mockResolvedValue(shopSettings())
    const { user } = renderCart()

    expect(screen.getByRole('heading', { name: 'Tu bolsa espera un detalle.' })).toBeInTheDocument()
    const summary = screen.getByRole('complementary', { name: 'Resumen estimado' })
    expect(within(summary).getAllByText(/0,00/)).toHaveLength(4)
    expect(within(summary).getByRole('button', { name: 'Continuar a la entrega' })).toBeDisabled()

    await user.click(screen.getByRole('link', { name: 'Explorar el catálogo' }))
    expect(await screen.findByRole('heading', { name: 'Catálogo de regalos' })).toBeInTheDocument()
  })

  it('06 · revalida con la API, muestra el resumen estimado y permite cambiar cantidades', async () => {
    cartStorage.save([
      { productId: 'p-rosas', quantity: 2 },
      { productId: 'p-taza', quantity: 1 },
    ])
    const product = mockApi({ 'p-rosas': ROSES, 'p-taza': MUG })
    const { user } = renderCart()

    const roses = await screen.findByRole('listitem', { name: 'Ramo de rosas' })
    expect(within(roses).getByText(/\$36,50 \/ unidad/)).toBeInTheDocument()
    expect(product).toHaveBeenCalledWith('p-rosas')
    const summary = screen.getByRole('complementary', { name: 'Resumen estimado' })
    expect(within(summary).getByText('3')).toBeInTheDocument()
    expect(within(summary).getByText('$83,00')).toBeInTheDocument()
    expect(within(summary).getByText('IVA 15 %')).toBeInTheDocument()
    expect(within(summary).queryByText(/simulado|servidor|checkout\./i)).not.toBeInTheDocument()
    expect(within(summary).getByText('$12,45')).toBeInTheDocument()
    expect(within(summary).getByText('$95,45')).toBeInTheDocument()
    expect(within(summary).getByText(/El total se confirma antes de pagar/)).toBeInTheDocument()
    expect(within(summary).getByRole('link', { name: /Continuar a la entrega/ })).toHaveAttribute(
      'href',
      '/shop/checkout',
    )

    // La taza tiene 2 en stock: el selector no deja pedir más.
    const mug = screen.getByRole('listitem', { name: 'Taza' })
    await user.click(within(mug).getByRole('button', { name: 'Agregar una unidad de Taza' }))
    expect(within(mug).getByRole('button', { name: 'Agregar una unidad de Taza' })).toBeDisabled()
    expect(within(mug).getByLabelText('Cantidad · Taza', { selector: 'select' })).toHaveValue('2')

    await user.click(within(roses).getByRole('button', { name: 'Quitar Ramo de rosas' }))
    expect(screen.queryByRole('listitem', { name: 'Ramo de rosas' })).not.toBeInTheDocument()
    expect(cartStorage.load()).toEqual([{ productId: 'p-taza', quantity: 2 }])
  })

  it.each([
    { enabled: true, rateBps: 1200, ratePercent: 12, label: 'IVA 12 %', amount: '$4,38' },
    { enabled: false, rateBps: 1500, ratePercent: 15, label: 'IVA', amount: '$0,00' },
  ])('presenta la configuración real del impuesto: $label', async ({ label, amount, ...tax }) => {
    cartStorage.save([{ productId: 'p-rosas', quantity: 1 }])
    mockApi({ 'p-rosas': ROSES }, shopSettings({ tax }))
    renderCart()

    await screen.findByRole('listitem', { name: 'Ramo de rosas' })
    const summary = screen.getByRole('complementary', { name: 'Resumen estimado' })
    const row = within(summary).getByText(label).closest('div')!
    expect(within(row).getByText(amount)).toBeInTheDocument()
    expect(within(summary).queryByText(/simulado/)).not.toBeInTheDocument()
  })

  it('06B · un regalo agotado o con poco stock se marca, conserva el resto y bloquea el checkout', async () => {
    cartStorage.save([
      { productId: 'p-rosas', quantity: 1 },
      { productId: 'p-agotado', quantity: 1 },
      { productId: 'p-taza', quantity: 5 },
    ])
    mockApi({
      'p-rosas': ROSES,
      'p-agotado': shopProduct({ id: 'p-agotado', name: 'Peluche', stock: 0, isAvailable: false }),
      'p-taza': MUG,
    })
    const { user } = renderCart()

    const soldOut = await screen.findByRole('listitem', { name: 'Peluche' })
    expect(within(soldOut).getByRole('alert')).toHaveTextContent('Agotado por ahora.')
    const mug = screen.getByRole('listitem', { name: 'Taza' })
    expect(within(mug).getByRole('alert')).toHaveTextContent(
      'Solo quedan 2 unidades: ajusta la cantidad.',
    )
    expect(screen.getByRole('note')).toHaveTextContent('Corrige o elimina las líneas marcadas')
    expect(screen.getByRole('button', { name: 'Continuar a la entrega' })).toBeDisabled()

    await user.selectOptions(
      within(mug).getByLabelText('Cantidad · Taza', { selector: 'select' }),
      '2',
    )
    await user.click(within(soldOut).getByRole('button', { name: 'Quitar Peluche' }))

    expect(screen.getByRole('link', { name: /Continuar a la entrega/ })).toBeInTheDocument()
    expect(screen.getByRole('listitem', { name: 'Ramo de rosas' })).toBeInTheDocument()
  })

  it('un regalo despublicado se marca como no disponible', async () => {
    cartStorage.save([{ productId: 'p-borrado', quantity: 1 }])
    mockApi({})
    renderCart()

    const line = await screen.findByRole('listitem', { name: 'Regalo no disponible' })
    expect(within(line).getByRole('alert')).toHaveTextContent('ya no está disponible')
    expect(screen.getByRole('button', { name: 'Continuar a la entrega' })).toBeDisabled()
  })

  it('un límite por SKU más bajo, configurado por el ADMIN, se aplica a la línea', async () => {
    cartStorage.save([{ productId: 'p-rosas', quantity: 4 }])
    mockApi({ 'p-rosas': ROSES }, shopSettings({ maxUnitsPerSkuPerOrder: 3 }))
    renderCart()

    const line = await screen.findByRole('listitem', { name: 'Ramo de rosas' })
    expect(within(line).getByRole('alert')).toHaveTextContent(
      'Máximo 3 unidades de este regalo por pedido',
    )
  })

  it('si no se puede revisar el carrito no deja continuar y permite reintentar', async () => {
    cartStorage.save([{ productId: 'p-rosas', quantity: 1 }])
    const product = mockApi({ 'p-rosas': createHttpError(503) })
    const { user } = renderCart()

    expect(
      await screen.findByText(/No se pudieron revisar los regalos del carrito/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Continuar a la entrega/ })).not.toBeInTheDocument()

    product.mockResolvedValue(ROSES)
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('link', { name: /Continuar a la entrega/ })).toBeInTheDocument()
  })
})
