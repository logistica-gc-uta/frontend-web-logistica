import { screen, waitFor, within } from '@testing-library/react'
import { AxiosError } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import {
  checkoutDraft,
  checkoutSuccess,
  customer,
  orderDetail,
  signInCustomer,
} from '../../../test/checkoutFixtures'
import { createHttpError } from '../../../test/http'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { shopProduct, shopSettings } from '../../../test/shopFixtures'
import { cartStorage } from '../cart/cartStorage'
import { customerOrdersService } from '../orders/customerOrdersService'
import { shopService } from '../shopService'
import { checkoutService } from './checkoutService'
import { checkoutStorage } from './checkoutStorage'

const shopError = (status: number, code: string) =>
  createHttpError(status, { data: { error: { code, message: code, details: {} } } })

const networkError = () => new AxiosError('Network Error', 'ERR_NETWORK')

beforeEach(() => {
  signInCustomer()
  cartStorage.save([{ productId: 'p-rosas', quantity: 2 }], customer.id)
  checkoutStorage.save(checkoutDraft())
  vi.spyOn(customerOrdersService, 'detail').mockResolvedValue(orderDetail())
  vi.spyOn(shopService, 'settings').mockResolvedValue(shopSettings())
  vi.spyOn(shopService, 'product').mockResolvedValue(shopProduct())
})

afterEach(() => {
  sessionStorage.clear()
  vi.useRealTimers()
})

async function openPayment() {
  const view = renderWithProviders(<App />, { route: '/checkout/pago' })
  const form = within(await screen.findByRole('form', { name: 'Pago con tarjeta' }))
  return { ...view, form }
}

async function fillCard(
  form: Awaited<ReturnType<typeof openPayment>>['form'],
  user: Awaited<ReturnType<typeof openPayment>>['user'],
  number = '9000 0000 0000 0001',
  cvv = '111',
) {
  await user.clear(form.getByLabelText('Número de tarjeta'))
  await user.type(form.getByLabelText('Número de tarjeta'), number)
  await user.clear(form.getByLabelText('Nombre en la tarjeta'))
  await user.type(form.getByLabelText('Nombre en la tarjeta'), 'PRUEBA APROBADA')
  await user.clear(form.getByLabelText('Mes de vencimiento'))
  await user.type(form.getByLabelText('Mes de vencimiento'), '12')
  await user.clear(form.getByLabelText('Año de vencimiento'))
  await user.type(form.getByLabelText('Año de vencimiento'), '2030')
  await user.clear(form.getByLabelText('CVV'))
  await user.type(form.getByLabelText('CVV'), cvv)
}

const allStoredText = () =>
  [
    ...Object.keys(localStorage).map((key) => localStorage.getItem(key)),
    ...Object.keys(sessionStorage).map((key) => sessionStorage.getItem(key)),
  ].join('|')

describe('Shop · pago ficticio', () => {
  it('recupera las fotos por ID al abrir pago con una cotización guardada', async () => {
    const lookup = vi.mocked(shopService.product).mockResolvedValue(shopProduct({
      name: 'Nombre actual del catálogo',
      priceCents: 99999,
    }))
    await openPayment()
    const summary = screen.getByRole('region', { name: 'Resumen del pago' })
    expect(await within(summary).findByRole('img', { name: 'Ramo de rosas' }))
      .toHaveAttribute('src', shopProduct().primaryImageUrl)
    expect(lookup).toHaveBeenCalledWith('p-rosas')
    expect(within(summary).getByText('$83,95')).toBeInTheDocument()
    expect(within(summary).queryByText('Nombre actual del catálogo')).not.toBeInTheDocument()
    expect(checkoutStorage.load(customer.id)).toEqual(checkoutDraft())
  })

  it('la falta de metadatos de imagen no bloquea una cotización válida', async () => {
    vi.mocked(shopService.product).mockRejectedValue(new Error('Imagen no disponible'))
    await openPayment()
    const summary = screen.getByRole('region', { name: 'Resumen del pago' })
    expect(await within(summary).findByRole('img', { name: 'Ramo de rosas' }))
      .toHaveTextContent('Imagen no disponible')
    expect(within(summary).getByText('$83,95')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar pago · $83,95' })).toBeEnabled()
    expect(checkoutStorage.load(customer.id)).toEqual(checkoutDraft())
  })

  it('simulador deshabilitado: conserva pedido y cotización sin fingir aprobación', async () => {
    const pay = vi.spyOn(checkoutService, 'pay')
      .mockRejectedValue(shopError(503, 'PAYMENT_SIMULATION_DISABLED'))
    const attempt = vi.spyOn(checkoutService, 'attempt')
    const { user, form } = await openPayment()
    await fillCard(form, user)
    await user.click(form.getByRole('button', { name: /Confirmar pago/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El simulador de pagos no está habilitado en este momento. No se hizo ningún cobro.',
    )
    expect(pay).toHaveBeenCalledTimes(1)
    expect(attempt).not.toHaveBeenCalled()
    expect(cartStorage.load(customer.id)).toEqual([{ productId: 'p-rosas', quantity: 2 }])
    expect(checkoutStorage.load(customer.id)).toEqual(checkoutDraft())
    expect(screen.queryByText('Ya es un detalle nuestro.')).not.toBeInTheDocument()
    expect(form.getByLabelText('CVV')).toHaveValue('')
  })

  it('presenta el pago y conserva la ayuda de tarjetas dentro del desplegable', async () => {
    const { user } = await openPayment()

    expect(screen.getByRole('heading', { name: 'Tarjeta', level: 2 })).toBeInTheDocument()
    const steps = screen.getByRole('navigation', { name: 'Pasos de compra' })
    expect(within(steps).getByText('Pago')).toHaveAttribute('aria-current', 'step')
    const help = screen.getByText('Ayuda con tarjetas de prueba')
    expect(help.closest('details')).not.toHaveAttribute('open')
    await user.click(help)
    expect(screen.getByRole('note')).toHaveTextContent(
      'Solo tarjetas ficticias de demostración. No ingreses datos bancarios reales.',
    )
    const summary = screen.getByRole('region', { name: 'Resumen del pago' })
    expect(within(summary).getByText('$83,95')).toBeInTheDocument()
    expect(within(summary).getByText('IVA 15 %')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar pago · $83,95' })).toBeEnabled()
  })

  it('muestra la entrega y los importes actuales de la cotización, incluso sin IVA', async () => {
    const draft = checkoutDraft()
    draft.quote = {
      ...draft.quote,
      tax: { enabled: false, rateBps: 0, ratePercent: 0, amountCents: 0 },
      totalCents: 7300,
      settingsVersion: 9,
    }
    checkoutStorage.save(draft)
    await openPayment()

    expect(screen.getByText(draft.delivery.recipient.name)).toBeInTheDocument()
    expect(screen.getByText(draft.delivery.deliveryAddress)).toBeInTheDocument()
    const summary = screen.getByRole('region', { name: 'Resumen del pago' })
    expect(within(summary).getByText('IVA no aplicado')).toBeInTheDocument()
    expect(within(summary).getByText(/Total vigente hasta las/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar pago · $73,00' })).toBeEnabled()
  })

  it('valida la tarjeta antes de enviar', async () => {
    const pay = vi.spyOn(checkoutService, 'pay')
    const { user, form } = await openPayment()
    await user.type(form.getByLabelText('Número de tarjeta'), '1234')
    await user.click(form.getByRole('button', { name: /Confirmar pago/ }))

    expect(
      form.getByText('Escribe los 16 dígitos de la tarjeta de demostración'),
    ).toBeInTheDocument()
    expect(form.getByText('CVV de 3 dígitos')).toBeInTheDocument()
    expect(pay).not.toHaveBeenCalled()
  })

  it('aprobado: paga una sola vez aunque se haga doble clic, confirma y recién ahí vacía el carrito', async () => {
    let release: (value: typeof checkoutSuccess) => void = () => undefined
    const pay = vi
      .spyOn(checkoutService, 'pay')
      .mockImplementation(() => new Promise((resolve) => (release = resolve)))
    const { user, form } = await openPayment()
    await fillCard(form, user)

    await user.dblClick(form.getByRole('button', { name: /Confirmar pago/ }))
    expect(pay).toHaveBeenCalledTimes(1)
    const [key, body] = pay.mock.calls[0]
    expect(key).toMatch(/^[0-9a-f-]{36}$/)
    expect(body).toEqual({
      items: [{ productId: 'p-rosas', quantity: 2 }],
      delivery: checkoutDraft().delivery,
      quoteToken: 'qtk_v1.prueba',
      paymentCard: {
        number: '9000 0000 0000 0001',
        holderName: 'PRUEBA APROBADA',
        expiresMonth: 12,
        expiresYear: 2030,
        cvv: '111',
      },
    })
    // Mientras se procesa, la clave queda guardada; la tarjeta, nunca.
    expect(checkoutStorage.load(customer.id)?.pendingKey).toBe(key)
    expect(allStoredText()).not.toContain('9000')
    expect(allStoredText()).not.toContain('111"')
    expect(cartStorage.load(customer.id)).toHaveLength(1)

    release(checkoutSuccess)

    expect(await screen.findByRole('heading', { name: 'Ya es un detalle nuestro.' })).toBeInTheDocument()
    expect(customerOrdersService.detail).toHaveBeenCalledWith('pedido-1')
    await waitFor(() => expect(cartStorage.load(customer.id)).toEqual([]))
    expect(checkoutStorage.load(customer.id)).toBeNull()
  })

  it('07A · rechazado: conserva el carrito y el formulario, y el siguiente intento usa otra clave', async () => {
    const pay = vi
      .spyOn(checkoutService, 'pay')
      .mockRejectedValueOnce(shopError(422, 'INSUFFICIENT_DEMO_FUNDS'))
      .mockResolvedValueOnce(checkoutSuccess)
    const { user, form } = await openPayment()
    await fillCard(form, user, '9000 0000 0000 0003', '333')
    await user.click(form.getByRole('button', { name: /Confirmar pago/ }))

    expect(
      await screen.findByText(
        'Pago rechazado: la tarjeta de demostración no tiene saldo suficiente.',
      ),
    ).toBeInTheDocument()
    expect(form.getByLabelText('Número de tarjeta')).toHaveValue('9000 0000 0000 0003')
    expect(form.getByLabelText('CVV')).toHaveValue('')
    expect(cartStorage.load(customer.id)).toHaveLength(1)
    expect(checkoutStorage.load(customer.id)?.pendingKey).toBeUndefined()
    expect(screen.queryByText('Ya es un detalle nuestro.')).not.toBeInTheDocument()

    await fillCard(form, user)
    await user.click(form.getByRole('button', { name: /Confirmar pago/ }))
    expect(await screen.findByRole('heading', { name: 'Ya es un detalle nuestro.' })).toBeInTheDocument()
    expect(pay.mock.calls[1][0]).not.toBe(pay.mock.calls[0][0])
  })

  it.each([
    ['CARD_INVALID', 'Pago rechazado: los datos de la tarjeta no son válidos.'],
    ['CARD_EXPIRED', 'Pago rechazado: la tarjeta está vencida.'],
  ])('07A · %s se explica por su código', async (code, message) => {
    vi.spyOn(checkoutService, 'pay').mockRejectedValue(shopError(422, code))
    const { user, form } = await openPayment()
    await fillCard(form, user)
    await user.click(form.getByRole('button', { name: /Confirmar pago/ }))
    expect(await screen.findByText(message)).toBeInTheDocument()
  })

  it.each(['PRICE_CHANGED', 'SHOP_SETTINGS_CHANGED', 'QUOTE_EXPIRED'])(
    '%s vuelve al checkout para cotizar y aceptar el nuevo total',
    async (code) => {
      vi.spyOn(checkoutService, 'pay').mockRejectedValue(shopError(409, code))
      const { user, form } = await openPayment()
      await fillCard(form, user)
      await user.click(form.getByRole('button', { name: /Confirmar pago/ }))

      expect(
        await screen.findByRole('heading', { name: 'Un lugar para la sorpresa.' }),
      ).toBeInTheDocument()
      expect(await screen.findByRole('alert')).toHaveTextContent(/total/)
    },
  )

  it('06B · STOCK_UNAVAILABLE al pagar lleva al carrito sin cobro y lo conserva', async () => {
    vi.spyOn(checkoutService, 'pay').mockRejectedValue(shopError(409, 'STOCK_UNAVAILABLE'))
    const { user, form } = await openPayment()
    await fillCard(form, user)
    await user.click(form.getByRole('button', { name: /Confirmar pago/ }))

    expect(await screen.findByText(/no se hizo ningún cobro/)).toBeInTheDocument()
    expect(cartStorage.load(customer.id)).toHaveLength(1)
  })

  it('07B · sin respuesta verifica el MISMO intento, sin pagar otra vez, hasta confirmarlo', async () => {
    const pay = vi.spyOn(checkoutService, 'pay').mockRejectedValue(networkError())
    const attempt = vi.spyOn(checkoutService, 'attempt').mockResolvedValue({
      status: 'SUCCEEDED',
      orderId: 'pedido-1',
      errorCode: null,
    })
    const { user, form } = await openPayment()
    await fillCard(form, user)
    await user.click(form.getByRole('button', { name: /Confirmar pago/ }))

    expect(await screen.findByRole('heading', { name: 'Ya es un detalle nuestro.' })).toBeInTheDocument()
    expect(attempt).toHaveBeenCalledWith(pay.mock.calls[0][0])
    expect(pay).toHaveBeenCalledTimes(1)
  })

  it('07B · mientras sigue en proceso no afirma nada, no deja pagar y permite volver a consultar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.spyOn(checkoutService, 'pay').mockRejectedValue(createHttpError(504))
    const attempt = vi.spyOn(checkoutService, 'attempt').mockResolvedValue({
      status: 'PROCESSING',
      orderId: null,
      errorCode: null,
    })
    const { user, form } = await openPayment()
    await fillCard(form, user)
    await user.click(form.getByRole('button', { name: /Confirmar pago/ }))

    expect(await screen.findByText('Verificando el resultado del pago...')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('No vuelvas a pagar')
    expect(screen.queryByRole('link', { name: 'Volver a entrega' })).not.toBeInTheDocument()
    expect(form.getByRole('button', { name: /Confirmar pago/ })).toBeDisabled()
    expect(screen.queryByText(/rechazado/)).not.toBeInTheDocument()
    await vi.advanceTimersByTimeAsync(12_000)
    const again = await screen.findByRole('button', { name: 'Consultar de nuevo' })
    expect(attempt).toHaveBeenCalledTimes(5)

    attempt.mockResolvedValue({ status: 'REJECTED', orderId: null, errorCode: 'CARD_EXPIRED' })
    await user.click(again)
    expect(await screen.findByText('Pago rechazado: la tarjeta está vencida.')).toBeInTheDocument()
    expect(form.getByRole('button', { name: /Confirmar pago/ })).toBeEnabled()
  })

  it('07B · si el intento no llegó a registrarse, se informa que no hubo cobro y se puede reintentar', async () => {
    vi.spyOn(checkoutService, 'pay').mockRejectedValue(networkError())
    vi.spyOn(checkoutService, 'attempt').mockRejectedValue(
      shopError(404, 'CHECKOUT_ATTEMPT_NOT_FOUND'),
    )
    const { user, form } = await openPayment()
    await fillCard(form, user)
    await user.click(form.getByRole('button', { name: /Confirmar pago/ }))

    expect(
      await screen.findByText(/no llegó a registrarse y no se hizo ningún cobro/),
    ).toBeInTheDocument()
    expect(form.getByRole('button', { name: /Confirmar pago/ })).toBeEnabled()
  })

  it('al recargar con un pago en curso verifica ese intento en lugar de cobrar otra vez', async () => {
    checkoutStorage.save(checkoutDraft({ pendingKey: 'clave-original' }))
    const pay = vi.spyOn(checkoutService, 'pay')
    const attempt = vi.spyOn(checkoutService, 'attempt').mockResolvedValue({
      status: 'SUCCEEDED',
      orderId: 'pedido-1',
      errorCode: null,
    })
    renderWithProviders(<App />, { route: '/checkout/pago' })

    expect(await screen.findByRole('heading', { name: 'Ya es un detalle nuestro.' })).toBeInTheDocument()
    expect(attempt).toHaveBeenCalledWith('clave-original')
    expect(pay).not.toHaveBeenCalled()
  })

  it('sin cotización vuelve al checkout; si el carrito cambió pide cotizar de nuevo', async () => {
    cartStorage.save([{ productId: 'p-rosas', quantity: 3 }], customer.id)
    vi.spyOn(checkoutService, 'quote')
    renderWithProviders(<App />, { route: '/checkout/pago' })

    expect(
      await screen.findByText('El carrito cambió. Vuelve a calcular el total.'),
    ).toBeInTheDocument()
  })

  it('presenta el encabezado aprobado El último paso. y enlaces de retorno a la entrega', async () => {
    await openPayment()

    expect(screen.getByRole('heading', { name: 'El último paso.', level: 1 })).toBeInTheDocument()
    const steps = screen.getByRole('navigation', { name: 'Pasos de compra' })
    expect(within(steps).getByRole('link', { name: /Entrega/ })).toHaveAttribute(
      'href',
      '/checkout',
    )
    expect(screen.getByRole('link', { name: '← Volver a entrega' })).toHaveAttribute(
      'href',
      '/checkout',
    )
  })
})
