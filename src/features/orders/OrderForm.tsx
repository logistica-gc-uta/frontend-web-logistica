import { useMemo, useState, type FormEvent } from 'react'
import { LocationPicker } from '../../components/map/LocationPicker'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { useForm } from '../../hooks/useForm'
import type { Product } from '../products/types'
import type { DeliverySchedule } from '../shop/types'
import { fromPolygon } from '../store-coverage/coverageDraft'
import type { ConfiguredStoreCoverage } from '../store-coverage/types'
import {
  COVERAGE_OUTSIDE_TEXT,
  COVERAGE_STATUS_TEXT,
  useCoverageCheck,
} from '../store-coverage/useCoverageCheck'
import { ClientPicker } from './ClientPicker'
import { DeliveryDateTime } from './DeliveryDateTime'
import { OrderItemsEditor } from './OrderItemsEditor'
import { sanitizeName } from './orderInput'
import { OrderSummary } from './OrderSummary'
import { PhoneField } from './PhoneField'
import { INITIAL_ORDER_FORM, toCreateAdminPurchaseInput, validateOrder } from './orderValidation'
import type { AdminPurchaseResult } from './types'
import { useAdminPurchase } from './useAdminPurchase'

interface OrderFormProps {
  products: Product[]
  schedule: DeliverySchedule
  coverage: ConfiguredStoreCoverage
  onCreated: (result: AdminPurchaseResult) => void
}

/** Alta de una venta ADMIN con pago externo declarado (backend #45), sin zona (#42). */
export function OrderForm({ products, schedule, coverage, onCreated }: OrderFormProps) {
  const area = useMemo(() => fromPolygon(coverage.coverage), [coverage])
  const purchase = useAdminPurchase()
  const [verifyError, setVerifyError] = useState<string | null>(null)

  // Se declara antes de `useForm` para que la validación conozca la respuesta del servidor.
  const [location, setLocation] = useState(INITIAL_ORDER_FORM.location)
  const check = useCoverageCheck(location)
  const coverageError =
    check?.state === 'done' && check.position === 'EXTERIOR'
      ? COVERAGE_OUTSIDE_TEXT
      : check?.state === 'failed'
        ? check.message
        : check?.state === 'checking'
          ? 'Verificando si entregamos en ese punto…'
          : undefined

  const form = useForm({
    initialValues: INITIAL_ORDER_FORM,
    validate: (formValues) => validateOrder(formValues, products, schedule, coverageError),
    errorMessage: 'No se pudo registrar la venta',
    onSubmit: async (formValues) => {
      setVerifyError(null)
      const result = await purchase.submit(toCreateAdminPurchaseInput(formValues))
      if (result) finish(result)
    },
  })
  const { values, fieldErrors, submitError, isSubmitting, handleChange, setFields } = form

  /** Venta confirmada por el servidor: se limpia el formulario y se abre su comprobante. */
  const finish = (result: AdminPurchaseResult) => {
    setFields(INITIAL_ORDER_FORM)
    setLocation(null)
    onCreated(result)
  }

  const setPoint = (point: typeof location) => {
    setLocation(point)
    setFields({ location: point, locationConfirmed: false })
  }

  const verifyNow = async () => {
    if (!purchase.pending) return
    setVerifyError(null)
    try {
      const result = await purchase.verify(purchase.pending.key)
      if (result) finish(result)
    } catch (error) {
      setVerifyError(error instanceof Error ? error.message : 'No se pudo verificar la venta')
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    // Mientras no se sepa si la venta anterior quedó registrada no se envía otra.
    if (purchase.pending) {
      event.preventDefault()
      return
    }
    return form.handleSubmit(event)
  }

  const canConfirm = check?.state === 'done' && check.position !== 'EXTERIOR'
  const coverageStatus =
    check?.state === 'checking'
      ? 'Verificando si entregamos en ese punto…'
      : check?.state === 'done' && check.position !== 'EXTERIOR'
        ? COVERAGE_STATUS_TEXT[check.position]
        : undefined
  const locationError =
    check?.state === 'done' && check.position === 'EXTERIOR'
      ? COVERAGE_OUTSIDE_TEXT
      : check?.state === 'failed'
        ? check.message
        : fieldErrors.location === 'Verificando si entregamos en ese punto…'
          ? undefined
          : fieldErrors.location

  return (
    <form className="order-form" onSubmit={submit} noValidate aria-label="Nueva venta">
      {submitError && (
        <div className="order-form__alert">
          <Alert>{submitError}</Alert>
        </div>
      )}
      {purchase.pending && (
        <div className="order-form__alert">
          <Alert>
            <span>{purchase.pending.message}</span>{' '}
            <Button
              variant="secondary"
              onClick={() => void verifyNow()}
              isLoading={purchase.verifying}
              loadingText="Verificando..."
            >
              Verificar ahora
            </Button>
          </Alert>
        </div>
      )}
      {verifyError && (
        <div className="order-form__alert">
          <Alert>{verifyError}</Alert>
        </div>
      )}

      <div className="order-form__fields">
        <fieldset className="order-form__section">
          <legend>Comprador</legend>
          <div className="order-form__choices" role="radiogroup" aria-label="Tipo de comprador">
            <label>
              <input
                type="radio"
                name="buyerType"
                value="GUEST"
                checked={values.buyerType === 'GUEST'}
                onChange={() => setFields({ buyerType: 'GUEST' })}
              />
              Invitado (sin cuenta)
            </label>
            <label>
              <input
                type="radio"
                name="buyerType"
                value="REGISTERED_CLIENT"
                checked={values.buyerType === 'REGISTERED_CLIENT'}
                onChange={() => setFields({ buyerType: 'REGISTERED_CLIENT' })}
              />
              Cliente con cuenta
            </label>
          </div>
          <div className="order-form__pair">
            {values.buyerType === 'REGISTERED_CLIENT' ? (
              <div className="order-form__wide">
                <ClientPicker
                  value={values.client}
                  onChange={(client) => setFields({ client })}
                  error={fieldErrors.client}
                />
              </div>
            ) : (
              <TextField
                label="Nombre del comprador"
                name="buyerName"
                autoComplete="off"
                maxLength={120}
                value={values.buyerName}
                onChange={(event) => setFields({ buyerName: sanitizeName(event.target.value) })}
                error={fieldErrors.buyerName}
              />
            )}
            <PhoneField
              label="Teléfono del comprador"
              name="buyerPhone"
              value={values.buyerPhone}
              onChange={(buyerPhone) => setFields({ buyerPhone })}
              error={fieldErrors.buyerPhone}
            />
          </div>
        </fieldset>

        <fieldset className="order-form__section">
          <legend>Quién recibe</legend>
          <label className="order-form__check">
            <input
              type="checkbox"
              checked={values.giftToOther}
              onChange={(event) => setFields({ giftToOther: event.target.checked })}
            />
            El regalo lo recibe otra persona
          </label>
          {!values.giftToOther && (
            <p className="order-form__hint text-muted">
              Sin marcar: el regalo lo recibe el mismo comprador.
            </p>
          )}
          {values.giftToOther && (
            <div className="order-form__pair">
              <TextField
                label="Nombre de quien recibe"
                name="recipientName"
                autoComplete="off"
                maxLength={120}
                value={values.recipientName}
                onChange={(event) => setFields({ recipientName: sanitizeName(event.target.value) })}
                error={fieldErrors.recipientName}
              />
              <PhoneField
                label="Teléfono de quien recibe"
                name="recipientPhone"
                value={values.recipientPhone}
                onChange={(recipientPhone) => setFields({ recipientPhone })}
                error={fieldErrors.recipientPhone}
              />
            </div>
          )}
        </fieldset>

        <fieldset className="order-form__section">
          <legend>Pago declarado</legend>
          <div className="order-form__choices" role="radiogroup" aria-label="Cómo pagó">
            <label>
              <input
                type="radio"
                name="paymentMethod"
                value="CASH"
                checked={values.paymentMethod === 'CASH'}
                onChange={() => setFields({ paymentMethod: 'CASH' })}
              />
              Efectivo
            </label>
            <label>
              <input
                type="radio"
                name="paymentMethod"
                value="TRANSFER"
                checked={values.paymentMethod === 'TRANSFER'}
                onChange={() => setFields({ paymentMethod: 'TRANSFER' })}
              />
              Transferencia
            </label>
          </div>
          {fieldErrors.paymentMethod && <p className="field__error">{fieldErrors.paymentMethod}</p>}
          <TextField
            label="Nota del pago (opcional)"
            name="paymentNote"
            autoComplete="off"
            maxLength={200}
            placeholder="Ej.: transferencia #4521, Banco Pichincha"
            value={values.paymentNote}
            onChange={handleChange}
            error={fieldErrors.paymentNote}
          />
          <p className="order-form__hint text-muted" role="note">
            Es el pago que declara el cliente; no se valida en el banco.
          </p>
        </fieldset>

        <fieldset className="order-form__section">
          <legend>Entrega</legend>
          <TextField
            label="Dirección de entrega"
            name="deliveryAddress"
            autoComplete="off"
            maxLength={200}
            placeholder="Calle, número y referencia"
            value={values.deliveryAddress}
            onChange={handleChange}
            error={fieldErrors.deliveryAddress}
          />
          <DeliveryDateTime
            value={values.scheduledAt}
            schedule={schedule}
            onChange={(scheduledAt) => setFields({ scheduledAt })}
            error={fieldErrors.scheduledAt}
          />
        </fieldset>

        <OrderItemsEditor
          items={values.items}
          products={products}
          onChange={(items) => setFields({ items })}
          error={fieldErrors.items}
        />
      </div>

      <div className="order-form__side">
        <div className="order-form__map">
          <LocationPicker
            center={coverage.location}
            depot={null}
            store={coverage.location}
            area={area}
            value={values.location}
            isConfirmed={values.locationConfirmed}
            onChange={setPoint}
            onConfirm={() => {
              if (canConfirm) setFields({ locationConfirmed: true })
            }}
            canConfirm={canConfirm}
            status={coverageStatus}
            error={locationError}
          />
        </div>

        <OrderSummary values={values} products={products}>
          <Button
            type="submit"
            isLoading={isSubmitting}
            loadingText="Registrando..."
            disabled={purchase.pending !== null}
          >
            Registrar venta
          </Button>
        </OrderSummary>
      </div>
    </form>
  )
}
