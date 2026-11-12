import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { checkoutDraft, customer, quote, signInCustomer } from '../../../test/checkoutFixtures'
import { savedCoverage } from '../../../test/coverageFixtures'
import { createHttpError } from '../../../test/http'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { shopProduct, shopSettings } from '../../../test/shopFixtures'
import { cartStorage } from '../cart/cartStorage'
import { shopService } from '../shopService'
import { checkoutService } from './checkoutService'
import { checkoutStorage } from './checkoutStorage'
import { deliveryInstant, nowInGuayaquil, validateDeliverySchedule } from './deliverySchedule'

/** El mapa real no se dibuja en jsdom: se simula con botones (como en el alta de pedidos). */
vi.mock('../../../components/map/LocationPicker', () => ({
  LocationPicker: ({
    value,
    isConfirmed,
    onChange,
    onConfirm,
    error,
    status,
    canConfirm = true,
    area,
  }: {
    value: unknown
    isConfirmed: boolean
    onChange: (point: { lat: number; lng: number }) => void
    onConfirm: () => void
    error?: string
    status?: string
    canConfirm?: boolean
    area?: unknown[]
  }) => (
    <div data-testid="map" data-area-points={area?.length ?? 0}>
      <button type="button" onClick={() => onChange({ lat: -1.25, lng: -78.63 })}>
        Colocar marcador
      </button>
      <button type="button" onClick={() => onChange({ lat: -1.25, lng: -78.6 })}>
        Colocar marcador en el borde
      </button>
      <button type="button" onClick={() => onChange({ lat: -1.4, lng: -78.9 })}>
        Colocar marcador fuera
      </button>
      {value !== null && !isConfirmed && (
        <button type="button" onClick={onConfirm} disabled={!canConfirm}>
          Confirmar ubicación
        </button>
      )}
      {isConfirmed && <span>Ubicación confirmada</span>}
      {status && <p>{status}</p>}
      {error && <p>{error}</p>}
    </div>
  ),
}))

const SCHEDULE = shopSettings().deliverySchedule
const DAY = '2099-03-10'

/** Respuesta del servidor para cada punto del mapa simulado. */
const POSITIONS: Record<string, 'INTERIOR' | 'BOUNDARY' | 'EXTERIOR'> = {
  '-1.25,-78.63': 'INTERIOR',
  '-1.25,-78.6': 'BOUNDARY',
  '-1.4,-78.9': 'EXTERIOR',
}

beforeEach(() => {
  signInCustomer()
  cartStorage.save([{ productId: 'p-rosas', quantity: 2 }], customer.id)
  vi.spyOn(shopService, 'settings').mockResolvedValue(shopSettings())
  vi.spyOn(shopService, 'product').mockResolvedValue(shopProduct())
  vi.spyOn(shopService, 'storeCoverage').mockResolvedValue(savedCoverage())
  vi.spyOn(shopService, 'evaluateCoverage').mockImplementation(async ({ lat, lng }) => {
    const position = POSITIONS[`${lat},${lng}`]
    return { accepted: position !== 'EXTERIOR', position }
  })
})

afterEach(() => sessionStorage.clear())

const renderCheckout = () => renderWithProviders(<App />, { route: '/checkout' })

async function openCheckout() {
  const view = renderWithProviders(<App />, { route: '/checkout' })
  const form = await screen.findByRole('form', { name: 'Datos de entrega' })
  return { ...view, form: within(form) }
}

async function fillDelivery(
  form: ReturnType<typeof within>,
  user: ReturnType<typeof renderWithProviders>['user'],
  time = '10:00',
  marker = 'Colocar marcador',
) {
  await user.type(form.getByLabelText('Nombre de quien recibe'), 'Ana Regalo')
  await user.type(form.getByLabelText('Teléfono de contacto'), '0991234567')
  await user.type(form.getByLabelText('Dirección de entrega'), 'Av. Cevallos y Montalvo')
  await user.click(form.getByRole('button', { name: marker }))
  // Solo se confirma cuando el servidor respondió que el punto está dentro o en el borde.
  await waitFor(() =>
    expect(form.getByRole('button', { name: 'Confirmar ubicación' })).toBeEnabled(),
  )
  await user.click(form.getByRole('button', { name: 'Confirmar ubicación' }))
  fireEvent.change(form.getByLabelText('Día de entrega'), { target: { value: DAY } })
  fireEvent.change(form.getByLabelText('Hora aproximada de entrega'), { target: { value: time } })
}

describe('horario de entrega (Ecuador)', () => {
  const at = (iso: string) => new Date(iso)
  const NOW = at('2030-02-10T14:00:00Z') // 09:00 en Guayaquil

  it.each([
    ['06:59', false],
    ['07:00', true],
    ['17:00', true],
    ['17:01', false],
  ])('%s es %s', (time, accepted) => {
    const errors = validateDeliverySchedule('2030-02-11', time, SCHEDULE, NOW)
    expect(errors.time === undefined).toBe(accepted)
  })

  it('rechaza un día pasado y una hora de hoy que ya pasó, usando la hora de Ecuador', () => {
    expect(validateDeliverySchedule('2030-02-09', '10:00', SCHEDULE, NOW).date).toBe(
      'El día de entrega ya pasó',
    )
    expect(validateDeliverySchedule('2030-02-10', '08:30', SCHEDULE, NOW).time).toMatch(/ya pasó/)
    expect(validateDeliverySchedule('2030-02-10', '09:30', SCHEDULE, NOW)).toEqual({})
    expect(nowInGuayaquil(NOW)).toBe('09:00')
  })

  it('una ventana cambiada por el ADMIN se respeta', () => {
    const narrow = { ...SCHEDULE, startTime: '09:00', endTime: '12:00' }
    expect(validateDeliverySchedule('2030-02-11', '08:59', narrow, NOW).time).toMatch(
      /09:00 y 12:00/,
    )
    expect(validateDeliverySchedule('2030-02-11', '12:00', narrow, NOW)).toEqual({})
  })

  it('envía el instante con el desfase explícito de Ecuador', () => {
    expect(deliveryInstant('2030-02-11', '07:00')).toBe('2030-02-11T07:00:00-05:00')
  })
})

describe('Shop · checkout', () => {
  it('conserva la foto real al calcular sin cambiar los importes de la cotización', async () => {
    const quoted = quote()
    vi.spyOn(checkoutService, 'quote').mockResolvedValue(quoted)
    const beforeDraft = checkoutStorage.load(customer.id)
    const { user, form } = await openCheckout()
    const original = await screen.findByRole('img', { name: 'Ramo de rosas' })
    expect(original).toHaveAttribute('src', shopProduct().primaryImageUrl)
    await fillDelivery(form, user)

    const summary = await screen.findByRole('region', { name: 'Total a pagar' })
    expect(await within(summary).findByRole('img', { name: 'Ramo de rosas' })).toHaveAttribute(
      'src',
      shopProduct().primaryImageUrl,
    )
    expect(within(summary).getByText('$83,95')).toBeInTheDocument()
    expect(within(summary).getAllByText('$73,00')).toHaveLength(2)
    expect(within(summary).getByText('$10,95')).toBeInTheDocument()
    expect(cartStorage.load(customer.id)).toEqual([{ productId: 'p-rosas', quantity: 2 }])
    expect(checkoutStorage.load(customer.id)).toEqual(beforeDraft)
  })

  it('presenta la entrega como primer paso sin explicaciones técnicas en el resumen vacío', async () => {
    await openCheckout()

    expect(screen.getByRole('heading', { name: 'Un lugar para la sorpresa.' })).toBeInTheDocument()
    const steps = screen.getByRole('navigation', { name: 'Pasos de compra' })
    expect(within(steps).getByText('Entrega')).toHaveAttribute('aria-current', 'step')
    expect(
      screen.getByText('Completa la entrega para consultar el total de tu pedido.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/IVA simulado/)).not.toBeInTheDocument()
  })

  it('pide los datos de entrega y no cotiza si faltan', async () => {
    const quoteCall = vi.spyOn(checkoutService, 'quote')
    await openCheckout()

    expect(screen.getByText(/hora de Ecuador/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Calcular total' })).not.toBeInTheDocument()
    expect(quoteCall).not.toHaveBeenCalled()
  })

  it('cotiza con el servidor, muestra su total exacto y guarda el total aceptado para el pago', async () => {
    const quoteCall = vi.spyOn(checkoutService, 'quote').mockResolvedValue(quote())
    const { user, form } = await openCheckout()
    await fillDelivery(form, user)

    await waitFor(() =>
      expect(quoteCall).toHaveBeenCalledWith([{ productId: 'p-rosas', quantity: 2 }], {
        recipient: { name: 'Ana Regalo', phone: '0991234567' },
        deliveryAddress: 'Av. Cevallos y Montalvo',
        deliveryLocation: { lat: -1.25, lng: -78.63 },
        scheduledDeliveryDate: `${DAY}T10:00:00-05:00`,
      }),
    )
    const summary = await screen.findByRole('region', { name: 'Total a pagar' })
    // Línea y subtotal: $73,00 cada uno.
    expect(within(summary).getAllByText('$73,00')).toHaveLength(2)
    expect(within(summary).getByText('IVA 15 %')).toBeInTheDocument()
    expect(
      within(summary).queryByText(/ficticio|simulado|impuesto oficial/),
    ).not.toBeInTheDocument()
    expect(within(summary).getByText(/Total vigente hasta las/)).toBeInTheDocument()
    expect(within(summary).getByText('$10,95')).toBeInTheDocument()
    expect(within(summary).getByText('Envío gratis $0,00')).toBeInTheDocument()
    expect(within(summary).getByText('$83,95')).toBeInTheDocument()

    vi.spyOn(checkoutService, 'attempt')
    await user.click(screen.getByRole('button', { name: 'Continuar al pago · $83,95' }))

    expect(
      await screen.findByRole('heading', { name: /El último paso|Pago/, level: 1 }),
    ).toBeInTheDocument()
    expect(checkoutStorage.load(customer.id)).toEqual(
      expect.objectContaining({ acceptedTotalCents: 8395, quote: quote() }),
    )
  })

  it('cambiar un dato después de cotizar obliga a cotizar de nuevo', async () => {
    vi.spyOn(checkoutService, 'quote').mockResolvedValue(quote())
    const { user, form } = await openCheckout()
    await fillDelivery(form, user)
    await screen.findByRole('region', { name: 'Total a pagar' })

    await user.type(form.getByLabelText('Dirección de entrega'), ' 2')
    expect(screen.queryByRole('region', { name: 'Total a pagar' })).not.toBeInTheDocument()
  })

  it('no pide zona: muestra el área de la tienda y la hora como aproximada', async () => {
    const { form } = await openCheckout()

    expect(form.queryByLabelText('Zona')).not.toBeInTheDocument()
    expect(form.getByTestId('map')).toHaveAttribute('data-area-points', '4')
    expect(
      form.getByText(/dentro del área marcada en el mapa, incluido su borde/),
    ).toBeInTheDocument()
    expect(form.getByRole('note', { name: '' })).toHaveTextContent(
      'La hora que elijas es aproximada: la entrega puede llegar un poco antes o un poco después.',
    )
  })

  it('un punto en el borde se acepta y se cotiza', async () => {
    const quoteCall = vi.spyOn(checkoutService, 'quote').mockResolvedValue(quote())
    const { user, form } = await openCheckout()
    await fillDelivery(form, user, '10:00', 'Colocar marcador en el borde')

    expect(
      form.getByText('En el borde de la zona de entrega: sí entregamos ahí.'),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(quoteCall).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ deliveryLocation: { lat: -1.25, lng: -78.6 } }),
      ),
    )
  })

  it('un punto fuera del área no se puede confirmar ni cotizar', async () => {
    const quoteCall = vi.spyOn(checkoutService, 'quote')
    const { user, form } = await openCheckout()
    await user.type(form.getByLabelText('Nombre de quien recibe'), 'Ana Regalo')
    await user.type(form.getByLabelText('Teléfono de contacto'), '0991234567')
    await user.type(form.getByLabelText('Dirección de entrega'), 'Km 30 vía a Baños')
    fireEvent.change(form.getByLabelText('Día de entrega'), { target: { value: DAY } })
    fireEvent.change(form.getByLabelText('Hora aproximada de entrega'), {
      target: { value: '10:00' },
    })
    await user.click(form.getByRole('button', { name: 'Colocar marcador fuera' }))

    expect(
      await form.findByText(
        'Ese punto está fuera de la zona de entrega. Coloca el marcador dentro del área marcada.',
      ),
    ).toBeInTheDocument()
    expect(form.getByRole('button', { name: 'Confirmar ubicación' })).toBeDisabled()
    expect(quoteCall).not.toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: 'Total a pagar' })).not.toBeInTheDocument()
  })

  it('mover el punto después de cotizar pide confirmarlo y recotiza conservando las fotos', async () => {
    const quoteCall = vi.spyOn(checkoutService, 'quote').mockResolvedValue(quote())
    const { user, form } = await openCheckout()
    await fillDelivery(form, user)
    await screen.findByRole('region', { name: 'Total a pagar' })

    await user.click(form.getByRole('button', { name: 'Colocar marcador en el borde' }))
    expect(form.queryByText('Ubicación confirmada')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Total a pagar' })).not.toBeInTheDocument()

    await waitFor(() =>
      expect(form.getByRole('button', { name: 'Confirmar ubicación' })).toBeEnabled(),
    )
    await user.click(form.getByRole('button', { name: 'Confirmar ubicación' }))

    const summary = await screen.findByRole('region', { name: 'Total a pagar' })
    expect(within(summary).getByRole('img', { name: 'Ramo de rosas' })).toHaveAttribute(
      'src',
      shopProduct().primaryImageUrl,
    )
    expect(within(summary).getByText('$83,95')).toBeInTheDocument()
    expect(quoteCall).toHaveBeenLastCalledWith(
      expect.any(Array),
      expect.objectContaining({ deliveryLocation: { lat: -1.25, lng: -78.6 } }),
    )
  })

  it('si el servidor rechaza la cobertura al cotizar lo explica y no muestra total', async () => {
    vi.spyOn(checkoutService, 'quote').mockRejectedValue(
      createHttpError(422, {
        data: { error: { code: 'DELIVERY_OUTSIDE_COVERAGE', message: 'x' } },
      }),
    )
    const { user, form } = await openCheckout()
    await fillDelivery(form, user)

    expect(
      await screen.findByText(
        'La ubicación está fuera de la zona de entrega. Mueve el marcador dentro del área marcada.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Total a pagar' })).not.toBeInTheDocument()
    expect(cartStorage.load(customer.id)).toEqual([{ productId: 'p-rosas', quantity: 2 }])
  })

  it('sin zona de entrega configurada no deja comprar y conserva la bolsa', async () => {
    vi.spyOn(shopService, 'storeCoverage').mockResolvedValue({ configured: false })
    const quoteCall = vi.spyOn(checkoutService, 'quote')
    renderCheckout()

    expect(
      await screen.findByText(/La tienda todavía no definió su zona de entrega/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Datos de entrega' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver a la bolsa' })).toHaveAttribute(
      'href',
      '/carrito',
    )
    expect(quoteCall).not.toHaveBeenCalled()
    expect(cartStorage.load(customer.id)).toEqual([{ productId: 'p-rosas', quantity: 2 }])
  })

  it('una hora fuera de la ventana no se cotiza; si el servidor la rechaza se explica', async () => {
    const quoteCall = vi
      .spyOn(checkoutService, 'quote')
      .mockRejectedValue(
        createHttpError(422, { data: { error: { code: 'DELIVERY_OUTSIDE_HOURS', message: 'x' } } }),
      )
    const { user, form } = await openCheckout()
    await fillDelivery(form, user, '17:01')
    expect(
      await form.findByText('La entrega debe ser entre 07:00 y 17:00 (hora de Ecuador)'),
    ).toBeInTheDocument()
    expect(quoteCall).not.toHaveBeenCalled()

    fireEvent.change(form.getByLabelText('Hora aproximada de entrega'), {
      target: { value: '17:00' },
    })
    expect(
      await screen.findByText('La hora elegida está fuera del horario de reparto.'),
    ).toBeInTheDocument()
  })

  it('si falta stock al cotizar lleva al carrito sin cobrar nada', async () => {
    vi.spyOn(checkoutService, 'quote').mockRejectedValue(
      createHttpError(409, { data: { error: { code: 'STOCK_UNAVAILABLE', message: 'x' } } }),
    )
    vi.spyOn(shopService, 'product').mockResolvedValue(shopProduct())
    const { user, form } = await openCheckout()
    await fillDelivery(form, user)

    expect(await screen.findByText(/no se hizo ningún cobro/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tu bolsa de regalos' })).toBeInTheDocument()
  })

  it('una cotización con una línea sin stock no deja continuar', async () => {
    const short = quote()
    short.items[0] = { ...short.items[0], available: false, availableStock: 1 }
    vi.spyOn(checkoutService, 'quote').mockResolvedValue(short)
    const { user, form } = await openCheckout()
    await fillDelivery(form, user)

    expect(await screen.findByText(/Solo 1 disponibles/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Continuar al pago/ })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Revisa el carrito' })).toBeInTheDocument()
  })

  it('al volver a cotizar con otro total exige aceptarlo explícitamente', async () => {
    checkoutStorage.save(checkoutDraft())
    vi.spyOn(checkoutService, 'quote').mockResolvedValue(
      quote({
        totalCents: 9775,
        tax: { enabled: true, rateBps: 1500, ratePercent: 15, amountCents: 1275 },
        subtotalCents: 8500,
      }),
    )
    const { user, form } = await openCheckout()

    expect(form.getByLabelText('Nombre de quien recibe')).toHaveValue('Ana Regalo')

    const accept = await screen.findByLabelText(/El total cambió de \$83,95 a \$97,75/)
    const go = screen.getByRole('button', { name: 'Continuar al pago · $97,75' })
    expect(go).toBeDisabled()
    await user.click(accept)
    expect(go).toBeEnabled()
  })

  it('un carrito distinto al pedido anterior no pide aceptar un total viejo', async () => {
    checkoutStorage.save(
      checkoutDraft({
        items: [{ productId: 'p-kit', quantity: 1 }],
        acceptedTotalCents: 4830,
      }),
    )
    cartStorage.save(
      [
        { productId: 'p-rosas', quantity: 1 },
        { productId: 'p-box', quantity: 1 },
      ],
      customer.id,
    )
    vi.spyOn(checkoutService, 'quote').mockResolvedValue(quote({ totalCents: 6197 }))
    await openCheckout()

    expect(await screen.findByRole('button', { name: 'Continuar al pago · $61,97' })).toBeEnabled()
    expect(screen.queryByLabelText(/El total cambió/)).not.toBeInTheDocument()
  })

  it('una cotización vencida no avanza al pago', async () => {
    vi.spyOn(checkoutService, 'quote').mockResolvedValue(
      quote({ validUntil: '2000-01-01T00:00:00Z' }),
    )
    const { user, form } = await openCheckout()
    await fillDelivery(form, user)
    await user.click(await screen.findByRole('button', { name: /Continuar al pago/ }))

    expect(
      screen.getByText('La cotización venció. Vuelve a calcular el total.'),
    ).toBeInTheDocument()
    expect(checkoutStorage.load(customer.id)).toBeNull()
  })

  it('con el carrito vacío vuelve al carrito', async () => {
    cartStorage.save([], customer.id)
    renderCheckout()
    expect(
      await screen.findByRole('heading', { name: 'Tu bolsa espera un detalle.' }),
    ).toBeInTheDocument()
  })

  it('muestra el resumen no cotizado con los productos reales del carrito y la leyenda aprobada', async () => {
    await openCheckout()

    expect(screen.getByRole('group', { name: '¿Cuándo entregamos?' })).toBeInTheDocument()
    const aside = screen.getByRole('complementary', { name: 'Resumen del pedido' })
    // Los productos llegan del catálogo después de abrir el formulario.
    expect(await within(aside).findByText('Ramo de rosas')).toBeInTheDocument()
    expect(within(aside).getByText(/Cantidad 2/)).toBeInTheDocument()
    expect(within(aside).getByText('Total al confirmar la entrega')).toBeInTheDocument()
    expect(within(aside).getByRole('link', { name: '← Ver bolsa' })).toHaveAttribute(
      'href',
      '/carrito',
    )
  })
})
