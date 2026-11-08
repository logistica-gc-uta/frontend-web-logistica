import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { paths } from '../../../app/paths'
import { LocationPicker } from '../../../components/map/LocationPicker'
import { Alert } from '../../../components/ui/Alert'
import { Button } from '../../../components/ui/Button'
import { SelectField } from '../../../components/ui/SelectField'
import { TextField } from '../../../components/ui/TextField'
import { useFetch } from '../../../hooks/useFetch'
import { useForm, type FieldErrors } from '../../../hooks/useForm'
import { todayInGuayaquil } from '../../../lib/time/guayaquil'
import type { GeoPoint } from '../../../types/geo'
import { useCustomer } from '../account/customerContext'
import type { CartLocationState } from '../cart/CartPage'
import { useCart } from '../cart/cartContext'
import { ProductImage } from '../components/ProductImage'
import { formatCents } from '../money'
import { shopService } from '../shopService'
import type { DeliverySchedule } from '../types'
import { describeCheckoutError, type CheckoutProblem } from './checkoutErrors'
import { checkoutService } from './checkoutService'
import { checkoutStorage, sameItems, type CheckoutDraft } from './checkoutStorage'
import type { DeliveryInput, Quote } from './checkoutTypes'
import { deliveryInstant, validateDeliverySchedule } from './deliverySchedule'
import { QuoteSummary } from './QuoteSummary'
import { loadCheckoutProducts } from './checkoutProducts'
import './checkout-presentation.css'

/** Llega aquí desde el pago cuando el servidor pidió volver a cotizar. */
export interface CheckoutLocationState {
  requote?: CheckoutProblem
}

type DeliveryForm = {
  recipientName: string
  recipientPhone: string
  zoneId: string
  address: string
  date: string
  time: string
  notes: string
  location: GeoPoint | null
  locationConfirmed: boolean
}

const EMPTY_FORM: DeliveryForm = {
  recipientName: '',
  recipientPhone: '',
  zoneId: '',
  address: '',
  date: '',
  time: '',
  notes: '',
  location: null,
  locationConfirmed: false,
}

const DEFAULT_MAP_CENTER: GeoPoint = { lat: -1.2417, lng: -78.6197 }
const QUOTE_DEBOUNCE_MS = 300

/** Formulario a partir de una entrega ya cotizada (para corregirla o volver a cotizar). */
const formFromDelivery = (delivery: DeliveryInput): DeliveryForm => ({
  recipientName: delivery.recipient.name,
  recipientPhone: delivery.recipient.phone,
  zoneId: delivery.zoneId,
  address: delivery.deliveryAddress,
  date: delivery.scheduledDeliveryDate.slice(0, 10),
  time: delivery.scheduledDeliveryDate.slice(11, 16),
  notes: delivery.deliveryNotes ?? '',
  location: delivery.deliveryLocation,
  locationConfirmed: true,
})

function validate(values: DeliveryForm, schedule: DeliverySchedule): FieldErrors<DeliveryForm> {
  const errors: FieldErrors<DeliveryForm> = {}
  const name = values.recipientName.trim()
  const phone = values.recipientPhone.trim()
  if (name === '') errors.recipientName = 'Escribe el nombre de quien recibe'
  else if (name.length > 120) errors.recipientName = 'Máximo 120 caracteres'
  if (phone.length < 7 || phone.length > 40)
    errors.recipientPhone = 'Escribe un teléfono de 7 a 40 caracteres'
  if (values.zoneId === '') errors.zoneId = 'Elige la zona de entrega'
  const address = values.address.trim()
  if (address.length < 5 || address.length > 250)
    errors.address = 'Escribe la dirección (5 a 250 caracteres)'
  if (values.notes.trim().length > 500) errors.notes = 'Máximo 500 caracteres'
  if (!values.location) errors.location = 'Coloca el marcador en el mapa'
  else if (!values.locationConfirmed) errors.location = 'Confirma la ubicación en el mapa'
  return { ...errors, ...validateDeliverySchedule(values.date, values.time, schedule) }
}

const toDelivery = (values: DeliveryForm): DeliveryInput => ({
  recipient: { name: values.recipientName.trim(), phone: values.recipientPhone.trim() },
  zoneId: values.zoneId,
  deliveryAddress: values.address.trim(),
  deliveryLocation: values.location!,
  scheduledDeliveryDate: deliveryInstant(values.date, values.time)!,
  ...(values.notes.trim() && { deliveryNotes: values.notes.trim() }),
})

function DeliveryStep({
  schedule,
  draft,
}: {
  schedule: DeliverySchedule
  draft: CheckoutDraft | null
}) {
  const { customer } = useCustomer()
  const { items } = useCart()
  const navigate = useNavigate()
  const requote = (useLocation().state as CheckoutLocationState | null)?.requote
  const zones = useFetch(shopService.zones, 'No se pudieron cargar las zonas')
  const deliverable = (zones.data ?? []).filter((zone) => zone.depotLocation !== null)

  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [problem, setProblem] = useState<CheckoutProblem | null>(requote ?? null)
  const [acceptedChange, setAcceptedChange] = useState(false)
  const [liveErrors, setLiveErrors] = useState<FieldErrors<DeliveryForm>>({})
  const quotedFor = useRef<string | null>(null)
  // Solo si es la misma bolsa: un pedido nuevo no hereda el total del borrador anterior.
  const previousTotal =
    draft && sameItems(draft.items, items) ? draft.acceptedTotalCents : undefined

  const itemIdsKey = useMemo(() => items.map((i) => i.productId).sort().join(','), [items])
  const fetchProducts = useCallback(
    () => loadCheckoutProducts(items.map((i) => i.productId)),
    [itemIdsKey, items],
  )
  const productsQuery = useFetch(fetchProducts)
  const products = productsQuery.data

  const estimatedSubtotal = useMemo(() => {
    if (!products) return 0
    return items.reduce((sum, item) => {
      const price = products.get(item.productId)?.priceCents ?? 0
      return sum + price * item.quantity
    }, 0)
  }, [items, products])
  const hasSubtotal =
    products !== undefined &&
    items.length > 0 &&
    items.every((i) => products.get(i.productId)?.priceCents !== undefined)

  const form = useForm({
    initialValues: draft ? formFromDelivery(draft.delivery) : EMPTY_FORM,
    validate: (values) => validate(values, schedule),
    errorMessage: 'No se pudo calcular el total',
    onSubmit: async () => undefined,
  })

  // Cualquier cambio en la entrega invalida la cotización: hay que volver a calcular.
  const change: typeof form.setFields = (patch) => {
    setQuote(null)
    form.setFields(patch)
  }
  const handleChange: typeof form.handleChange = (event) => {
    setQuote(null)
    form.handleChange(event)
  }

  const { values, fieldErrors } = form
  const shownErrors: FieldErrors<DeliveryForm> = { ...liveErrors, ...fieldErrors }
  const depot = deliverable.find((zone) => zone.id === values.zoneId)?.depotLocation ?? null
  const unavailable = quote?.items.some((line) => !line.available) ?? false
  const totalChanged =
    quote !== null && previousTotal !== undefined && quote.totalCents !== previousTotal
  const canContinue = quote !== null && !unavailable && (!totalChanged || acceptedChange)

  const continueToPayment = () => {
    if (!quote || !customer) return
    if (Date.parse(quote.validUntil) <= Date.now()) {
      setQuote(null)
      setProblem({
        action: 'requote',
        message: 'La cotización venció. Vuelve a calcular el total.',
      })
      return
    }
    checkoutStorage.save({
      ownerId: customer.id,
      delivery: toDelivery(values),
      items,
      quote,
      acceptedTotalCents: quote.totalCents,
    })
    navigate(paths.shopPayment)
  }

  useEffect(() => {
    const errors = validate(values, schedule)
    const started = Boolean(
      values.recipientName.trim() ||
        values.zoneId ||
        values.address.trim() ||
        values.date ||
        values.time ||
        values.location,
    )
    if (Object.keys(errors).length > 0) {
      quotedFor.current = null
      setQuoting(false)
      setLiveErrors(started && (values.date !== '' || values.time !== '') ? errors : {})
      return
    }
    setLiveErrors({})
    const payloadKey = JSON.stringify({ items, delivery: toDelivery(values) })
    if (quotedFor.current === payloadKey) return

    let cancelled = false
    setQuoting(true)
    const timer = window.setTimeout(async () => {
      setProblem(null)
      setAcceptedChange(false)
      try {
        const next = await checkoutService.quote(items, toDelivery(values))
        if (cancelled) return
        quotedFor.current = payloadKey
        setQuote(next)
      } catch (error) {
        if (cancelled) return
        quotedFor.current = null
        setQuote(null)
        const found = describeCheckoutError(error)
        if (found.action === 'cart') {
          navigate(paths.shopCart, { state: { stockChanged: true } satisfies CartLocationState })
          return
        }
        setProblem(found)
      } finally {
        if (!cancelled) setQuoting(false)
      }
    }, QUOTE_DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [values, items, schedule, navigate])

  return (
    <div className="checkout__layout">
      <form
        className="checkout-form"
        aria-label="Datos de entrega"
        noValidate
        onSubmit={form.handleSubmit}
      >
        {problem && <Alert>{problem.message}</Alert>}
        {form.submitError && <Alert>{form.submitError}</Alert>}

        <fieldset className="items-editor checkout-form__recipient">
          <legend>¿Quién recibe?</legend>
          <TextField
            label="Nombre de quien recibe"
            name="recipientName"
            autoComplete="name"
            value={values.recipientName}
            onChange={handleChange}
            error={shownErrors.recipientName}
          />
          <TextField
            label="Teléfono de contacto"
            name="recipientPhone"
            type="tel"
            autoComplete="tel"
            value={values.recipientPhone}
            onChange={handleChange}
            error={shownErrors.recipientPhone}
          />
        </fieldset>

        <fieldset className="items-editor">
          <legend>Dirección de entrega</legend>
          <SelectField
            label="Zona"
            name="zoneId"
            value={values.zoneId}
            error={shownErrors.zoneId ?? zones.error ?? undefined}
            // La ubicación confirmada pertenece a la zona anterior: hay que ubicarla de nuevo.
            onChange={(event) =>
              change({ zoneId: event.target.value, location: null, locationConfirmed: false })
            }
          >
            <option value="">Selecciona una zona</option>
            {deliverable.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Dirección de entrega"
            name="address"
            autoComplete="street-address"
            value={values.address}
            onChange={handleChange}
            error={shownErrors.address}
          />
          <LocationPicker
            center={depot ?? DEFAULT_MAP_CENTER}
            depot={depot}
            value={values.location}
            isConfirmed={values.locationConfirmed}
            onChange={(location) => change({ location, locationConfirmed: false })}
            onConfirm={() => change({ locationConfirmed: true })}
            error={shownErrors.location}
          />
        </fieldset>

        <fieldset className="items-editor">
          <legend>¿Cuándo entregamos?</legend>
          <p className="text-muted">
            Entregas de {schedule.startTime} a {schedule.endTime} · hora de Ecuador.
          </p>
          <div className="checkout-form__when">
            <TextField
              label="Día de entrega"
              name="date"
              type="date"
              min={todayInGuayaquil()}
              value={values.date}
              onChange={handleChange}
              error={shownErrors.date}
            />
            <TextField
              label="Hora de entrega"
              name="time"
              type="time"
              min={schedule.startTime}
              max={schedule.endTime}
              value={values.time}
              onChange={handleChange}
              error={shownErrors.time}
            />
          </div>
          <TextField
            label="Indicaciones para la entrega (opcional)"
            name="notes"
            value={values.notes}
            onChange={handleChange}
            error={shownErrors.notes}
          />
        </fieldset>

      </form>

      <div className="checkout__aside">
        {quote ? (
          <>
            <QuoteSummary quote={quote} products={products} />
            {unavailable && (
              <Alert>
                Algún regalo ya no tiene stock suficiente.{' '}
                <Link
                  to={paths.shopCart}
                  state={{ stockChanged: true } satisfies CartLocationState}
                >
                  Revisa el carrito
                </Link>
              </Alert>
            )}
            {totalChanged && (
              <label className="checkout__accept">
                <input
                  type="checkbox"
                  checked={acceptedChange}
                  onChange={(event) => setAcceptedChange(event.target.checked)}
                />
                El total cambió de {formatCents(previousTotal)} a {formatCents(quote.totalCents)}.
                Acepto el nuevo total.
              </label>
            )}
            <Button disabled={!canContinue} onClick={continueToPayment}>
              Continuar al pago · {formatCents(quote.totalCents)}
            </Button>
          </>
        ) : (
          <aside className="cart-summary checkout__unquoted" aria-label="Resumen del pedido">
            <p className="checkout__eyebrow">Tu pedido</p>
            <h2>Resumen de compra</h2>
            <ul className="checkout__unquoted-items">
              {items.map((item) => {
                const product = products?.get(item.productId)
                const name = product?.name ?? 'Regalo en tu selección'
                const price = product?.priceCents
                return (
                  <li key={item.productId} className="checkout__unquoted-item">
                    <ProductImage
                      src={product?.primaryImageUrl ?? null}
                      alt={name}
                      className="checkout__unquoted-image"
                    />
                    <div className="checkout__unquoted-details">
                      <strong>{name}</strong>
                      <span className="text-muted">
                        Cantidad {item.quantity}
                        {price !== undefined && price > 0 ? ` · ${formatCents(price)} c/u` : ''}
                      </span>
                    </div>
                    {price !== undefined && price > 0 ? (
                      <b className="money">{formatCents(price * item.quantity)}</b>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </li>
                )
              })}
            </ul>
            <dl>
              <div>
                <dt>Subtotal estimado</dt>
                <dd>{hasSubtotal ? formatCents(estimatedSubtotal) : 'Por calcular'}</dd>
              </div>
              <div>
                <dt>Envío</dt>
                <dd>Incluido en el precio</dd>
              </div>
              <div className="cart-summary__total">
                <dt>Total</dt>
                <dd>Total al confirmar la entrega</dd>
              </div>
            </dl>
            {quoting ? (
              <p role="status">Calculando el total...</p>
            ) : (
              <p className="text-muted">Completa la entrega para consultar el total de tu pedido.</p>
            )}
            <div className="checkout__actions">
              <Link to={paths.shopCart} className="btn btn--secondary">
                ← Ver bolsa
              </Link>
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}

/** Checkout: datos de entrega y cotización del servidor antes de pagar. */
export function CheckoutPage() {
  const { customer } = useCustomer()
  const { items } = useCart()
  const settings = useFetch(shopService.settings, 'No se pudo consultar el horario de reparto')
  const draft = useMemo(() => (customer ? checkoutStorage.load(customer.id) : null), [customer])

  if (items.length === 0) return <Navigate to={paths.shopCart} replace />

  return (
    <div className="shop-page checkout checkout-presentation checkout-presentation--delivery">
      <nav aria-label="Pasos de compra">
        <ol className="checkout__steps steps">
          <li aria-current="step">
            <span className="step-number" aria-hidden="true">1</span>Entrega
          </li>
          <li>
            <span className="step-number" aria-hidden="true">2</span>Pago
          </li>
          <li>
            <span className="step-number" aria-hidden="true">3</span>Resultado
          </li>
        </ol>
      </nav>
      <h1>Un lugar para la sorpresa.</h1>
      <p className="checkout__intro">Cuéntanos dónde y cuándo entregar tu detalle.</p>
      {settings.error && (
        <Alert>
          <span>{settings.error}.</span>{' '}
          <Button variant="secondary" onClick={settings.reload}>
            Reintentar
          </Button>
        </Alert>
      )}
      {!settings.data && !settings.error && <p role="status">Cargando...</p>}
      {settings.data && <DeliveryStep schedule={settings.data.deliverySchedule} draft={draft} />}
    </div>
  )
}
