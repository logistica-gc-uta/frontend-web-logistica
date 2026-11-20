import { render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { adminSession } from '../../test/fixtures'
import { adminSettings } from '../../test/catalogFixtures'
import { createHttpError } from '../../test/http'
import { renderWithProviders } from '../../test/renderWithProviders'
import { shopProduct, shopSettings } from '../../test/shopFixtures'
import { catalogService } from '../catalog/catalogService'
import { formFromSettings, settingsChanges, validateSettings } from '../catalog/settingsForm'
import { OrderItemsEditor } from '../orders/OrderItemsEditor'
import { orderUnitsOf, validateOrder, INITIAL_ORDER_FORM } from '../orders/orderValidation'
import { describePurchaseError } from '../orders/purchaseErrors'
import type { Product } from '../products/types'
import { cartStorage } from './cart/cartStorage'
import { buildCartView } from './cart/cartView'
import { cartReturnState, describeCheckoutError } from './checkout/checkoutErrors'
import { checkOrderUnits } from './orderUnitsLimit'
import { ProductNotFoundError, shopService } from './shopService'
import type { ShopProduct, ShopSettings } from './types'

const ROSES = shopProduct({ id: 'p-rosas', name: 'Ramo de rosas', priceCents: 3650, stock: 20 })
const MUG = shopProduct({ id: 'p-taza', name: 'Taza', priceCents: 1000, stock: 20 })
const products = new Map<string, ShopProduct | null>([
  ['p-rosas', ROSES],
  ['p-taza', MUG],
])

/** Rechazo del backend #83 con su sobre de la tienda. */
const unitsLimitError = (requestedUnits = 6, maximumAllowed = 5) =>
  createHttpError(422, {
    data: {
      error: {
        code: 'ORDER_UNITS_LIMIT_EXCEEDED',
        message: 'x',
        details: { requestedUnits, maximumAllowed },
      },
    },
  })

afterEach(() => sessionStorage.clear())

describe('Máximo de unidades por pedido (#65) · regla', () => {
  it('N se acepta, N+1 no, y suma todas las líneas aunque sean productos distintos o repetidos', () => {
    expect(checkOrderUnits([2, 3], 5)).toEqual({ requestedUnits: 5, maximum: 5, exceeded: false })
    expect(checkOrderUnits([3, 3], 5)).toEqual({ requestedUnits: 6, maximum: 5, exceeded: true })
    expect(checkOrderUnits([1, 1, 1, 1, 1, 1], 5).exceeded).toBe(true)
    expect(checkOrderUnits([40], null)).toEqual({
      requestedUnits: 40,
      maximum: null,
      exceeded: false,
    })
  })

  it('en el carrito, dos regalos válidos por separado pueden superar el tope total y bloquean el checkout', () => {
    const settings = shopSettings({ maxUnitsPerSkuPerOrder: 10, maxUnitsPerOrder: 5 })
    const atLimit = buildCartView(
      [
        { productId: 'p-rosas', quantity: 3 },
        { productId: 'p-taza', quantity: 2 },
      ],
      products,
      settings,
    )
    expect(atLimit.lines.every((line) => line.problem === null)).toBe(true)
    expect(atLimit.canCheckout).toBe(true)

    const over = buildCartView(
      [
        { productId: 'p-rosas', quantity: 3 },
        { productId: 'p-taza', quantity: 3 },
      ],
      products,
      settings,
    )
    expect(over.lines.every((line) => line.problem === null)).toBe(true)
    expect(over.orderUnits).toEqual({ requestedUnits: 6, maximum: 5, exceeded: true })
    expect(over.canCheckout).toBe(false)
  })

  it('conserva la validación por SKU: superar el máximo por regalo sigue siendo su propio problema', () => {
    const view = buildCartView(
      [{ productId: 'p-rosas', quantity: 4 }],
      products,
      shopSettings({ maxUnitsPerSkuPerOrder: 3, maxUnitsPerOrder: 100 }),
    )
    expect(view.lines[0].problem).toEqual({ kind: 'OVER_LIMIT', limit: 3 })
    expect(view.orderUnits.exceeded).toBe(false)
    expect(view.canCheckout).toBe(false)
  })
})

describe('Máximo de unidades por pedido (#65) · tienda', () => {
  function mockShop(settings: ShopSettings) {
    vi.spyOn(shopService, 'settings').mockResolvedValue(settings)
    vi.spyOn(shopService, 'product').mockImplementation(async (id) => {
      const found = products.get(id)
      if (!found) throw new ProductNotFoundError()
      return found
    })
  }

  it('el carrito muestra el máximo y con N unidades deja continuar', async () => {
    mockShop(shopSettings({ maxUnitsPerOrder: 5 }))
    cartStorage.save([
      { productId: 'p-rosas', quantity: 3 },
      { productId: 'p-taza', quantity: 2 },
    ])
    renderWithProviders(<App />, { route: '/carrito' })

    const summary = within(await screen.findByRole('complementary', { name: 'Resumen estimado' }))
    expect(summary.getByText('Máximo por pedido')).toBeInTheDocument()
    expect(
      summary.getByText('Máximo 5 unidades por pedido (sumando todos los productos).'),
    ).toBeInTheDocument()
    expect(summary.getByRole('link', { name: /Continuar a la entrega/ })).toBeInTheDocument()
  })

  it('con N+1 avisa cuánto quitar, distinto del límite por regalo, y bloquea continuar', async () => {
    mockShop(shopSettings({ maxUnitsPerOrder: 5 }))
    cartStorage.save([
      { productId: 'p-rosas', quantity: 3 },
      { productId: 'p-taza', quantity: 3 },
    ])
    renderWithProviders(<App />, { route: '/carrito' })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El pedido suma 6 unidades y el máximo por pedido es 5 unidades (sumando todos los productos): quita 1 unidad para continuar.',
    )
    expect(screen.queryByText(/de este regalo por pedido/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Continuar a la entrega/ })).toBeDisabled()
    // El carrito no se toca: el cliente decide qué quitar.
    expect(cartStorage.load()).toEqual([
      { productId: 'p-rosas', quantity: 3 },
      { productId: 'p-taza', quantity: 3 },
    ])
  })

  it('sin límite configurado no muestra nada nuevo', async () => {
    mockShop(shopSettings({ maxUnitsPerOrder: null }))
    cartStorage.save([{ productId: 'p-rosas', quantity: 9 }])
    renderWithProviders(<App />, { route: '/carrito' })

    const summary = within(await screen.findByRole('complementary', { name: 'Resumen estimado' }))
    expect(summary.queryByText('Máximo por pedido')).not.toBeInTheDocument()
    expect(summary.getByRole('link', { name: /Continuar a la entrega/ })).toBeInTheDocument()
  })

  it('si el servidor rechaza al cotizar o pagar, vuelve al carrito con las cifras y conserva el carrito', () => {
    const problem = describeCheckoutError(unitsLimitError(6, 5), { isPayment: true })
    expect(problem).toEqual({
      action: 'cart',
      code: 'ORDER_UNITS_LIMIT_EXCEEDED',
      message:
        'El pedido suma 6 unidades y el máximo por pedido es 5 unidades (sumando todos los productos): quita 1 unidad para continuar.',
    })
    expect(cartReturnState(problem)).toEqual({ problem: problem.message })
    // Por stock se mantiene el aviso de siempre.
    expect(cartReturnState({ action: 'cart', code: 'STOCK_UNAVAILABLE', message: 'x' })).toEqual({
      stockChanged: true,
    })
  })

  it('el carrito explica el motivo con el que volvió del checkout', async () => {
    mockShop(shopSettings({ maxUnitsPerOrder: 5 }))
    cartStorage.save([{ productId: 'p-rosas', quantity: 2 }])
    renderWithProviders(<App />, {
      route: { pathname: '/carrito', state: { problem: 'El pedido suma 6 unidades…' } },
    })

    expect(await screen.findByText(/El pedido suma 6 unidades…/)).toHaveTextContent(
      'No se hizo ningún cobro y tu carrito se conserva.',
    )
  })
})

describe('Máximo de unidades por pedido (#65) · configuración ADMIN', () => {
  it('valida 1–1000 o vacío (sin límite) y solo envía el máximo que cambió', () => {
    const base = formFromSettings(adminSettings({ maxUnitsPerOrder: null }))
    expect(base.maxOrderUnits).toBe('')
    expect(validateSettings(base).maxOrderUnits).toBeUndefined()
    for (const bad of ['0', '1001', '2.5', '-3', 'abc']) {
      expect(validateSettings({ ...base, maxOrderUnits: bad }).maxOrderUnits).toBeDefined()
    }
    expect(validateSettings({ ...base, maxOrderUnits: '1000' }).maxOrderUnits).toBeUndefined()

    const saved = adminSettings({ maxUnitsPerOrder: null })
    expect(settingsChanges({ ...base, maxOrderUnits: '5' }, saved)).toEqual({
      limits: { maxUnitsPerOrder: 5 },
    })
    expect(settingsChanges(base, saved)).toEqual({})
    const limited = adminSettings({ maxUnitsPerOrder: 5 })
    expect(settingsChanges({ ...formFromSettings(limited), maxOrderUnits: '' }, limited)).toEqual({
      limits: { maxUnitsPerOrder: null },
    })
    expect(
      settingsChanges({ ...formFromSettings(limited), maxUnits: '4', maxOrderUnits: '8' }, limited),
    ).toEqual({ limits: { maxUnitsPerSkuPerOrder: 4, maxUnitsPerOrder: 8 } })
  })

  it('el ADMIN ve y guarda el máximo vigente en Configuración Shop', async () => {
    vi.spyOn(catalogService, 'getSettings').mockResolvedValue(
      adminSettings({ maxUnitsPerOrder: 12 }),
    )
    const update = vi
      .spyOn(catalogService, 'saveSettings')
      .mockResolvedValue(adminSettings({ version: 6, maxUnitsPerOrder: 8 }))
    const { user } = renderWithProviders(<App />, {
      route: '/admin/configuracion-shop',
      session: adminSession,
    })

    const field = await screen.findByLabelText(
      'Unidades máximas por pedido (sumando todos los productos)',
    )
    expect(field).toHaveValue('12')
    await user.clear(field)
    await user.type(field, '8')
    await user.click(screen.getByRole('button', { name: /Guardar/ }))

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update).toHaveBeenCalledWith(5, { limits: { maxUnitsPerOrder: 8 } })
  })
})

describe('Máximo de unidades por pedido (#65) · venta del panel', () => {
  const product = (id: string, name: string): Product =>
    ({ id, name, stock: 20, priceCents: 1000, isActive: true }) as unknown as Product
  const PRODUCTS = [product('a', 'Rosas'), product('b', 'Taza')]
  const items = (a: string, b: string) => [
    { productId: 'a', quantity: a },
    { productId: 'b', quantity: b },
  ]
  const schedule = { timeZone: 'America/Guayaquil', startTime: '07:00', endTime: '17:00' }

  it('antes de enviar, N pasa y N+1 se marca en Productos con el máximo', () => {
    expect(orderUnitsOf(items('3', '2'), 5).exceeded).toBe(false)
    expect(orderUnitsOf(items('3', '3'), 5)).toEqual({
      requestedUnits: 6,
      maximum: 5,
      exceeded: true,
    })

    const values = { ...INITIAL_ORDER_FORM, items: items('3', '3') }
    expect(validateOrder(values, PRODUCTS, schedule, undefined, new Date(), 5).items).toBe(
      'El pedido suma 6 unidades y el máximo por pedido es 5 unidades (sumando todos los productos): quita 1 unidad para continuar.',
    )
    expect(
      validateOrder(
        { ...values, items: items('3', '2') },
        PRODUCTS,
        schedule,
        undefined,
        new Date(),
        5,
      ).items,
    ).toBeUndefined()
    expect(
      validateOrder(values, PRODUCTS, schedule, undefined, new Date(), null).items,
    ).toBeUndefined()
  })

  it('el editor muestra el máximo y la suma en vivo, y avisa al superarlo', () => {
    const { rerender } = render(
      <OrderItemsEditor
        items={items('3', '2')}
        products={PRODUCTS}
        onChange={vi.fn()}
        maxUnitsPerOrder={5}
      />,
    )
    expect(
      screen.getByText(
        'Máximo 5 unidades por pedido (sumando todos los productos). Esta venta suma 5.',
      ),
    ).toBeInTheDocument()

    rerender(
      <OrderItemsEditor
        items={items('3', '3')}
        products={PRODUCTS}
        onChange={vi.fn()}
        maxUnitsPerOrder={5}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('quita 1 unidad para continuar')
  })

  it('si el límite cambió con el formulario abierto, el rechazo se explica para corregir sin perder datos', () => {
    expect(describePurchaseError(unitsLimitError(7, 5))).toEqual({
      action: 'fix',
      message:
        'No se registró la venta. El pedido suma 7 unidades y el máximo por pedido es 5 unidades (sumando todos los productos): quita 2 unidades para continuar.',
    })
  })
})
