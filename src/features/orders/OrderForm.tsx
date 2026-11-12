import { useMemo, useState, type FormEvent } from 'react'
import { LocationPicker } from '../../components/map/LocationPicker'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { useForm } from '../../hooks/useForm'
import { formatCurrency } from '../../lib/format/formatCurrency'
import type { Product } from '../products/types'
import type { DeliverySchedule } from '../shop/types'
import { fromPolygon } from '../store-coverage/coverageDraft'
import type { ConfiguredStoreCoverage } from '../store-coverage/types'
import {
  COVERAGE_OUTSIDE_TEXT,
  COVERAGE_STATUS_TEXT,
  useCoverageCheck,
} from '../store-coverage/useCoverageCheck'
import { OrderItemsEditor } from './OrderItemsEditor'
import {
  estimateOrderTotal,
  INITIAL_ORDER_FORM,
  REGISTERED_BUYER_PENDING,
  toCreateAdminPurchaseInput,
  validateOrder,
} from './orderValidation'
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
        <fieldset className="items-editor">
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
            <label className="is-disabled">
              <input type="radio" name="buyerType" value="REGISTERED_CLIENT" disabled />
              Cliente con cuenta
            </label>
          </div>
          <p className="text-muted order-form__hint">{REGISTERED_BUYER_PENDING}</p>
          <TextField
            label="Nombre del comprador"
            name="buyerName"
            autoComplete="off"
            value={values.buyerName}
            onChange={handleChange}
            error={fieldErrors.buyerName ?? fieldErrors.buyerType}
          />
          <TextField
            label="Teléfono del comprador"
            name="buyerPhone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={values.buyerPhone}
            onChange={handleChange}
            error={fieldErrors.buyerPhone}
          />
        </fieldset>

        <fieldset className="items-editor">
          <legend>¿Quién recibe?</legend>
          <label className="order-form__check">
            <input
              type="checkbox"
              checked={values.giftToOther}
              onChange={(event) => setFields({ giftToOther: event.target.checked })}
            />
            El regalo lo recibe otra persona
          </label>
          {values.giftToOther ? (
            <>
              <TextField
                label="Nombre de quien recibe"
                name="recipientName"
                autoComplete="off"
                value={values.recipientName}
                onChange={handleChange}
                error={fieldErrors.recipientName}
              />
              <TextField
                label="Teléfono de quien recibe"
                name="recipientPhone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                value={values.recipientPhone}
                onChange={handleChange}
                error={fieldErrors.recipientPhone}
              />
            </>
          ) : (
            <p className="text-muted order-form__hint">Lo recibe el mismo comprador.</p>
          )}
        </fieldset>

        <fieldset className="items-editor">
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
            value={values.paymentNote}
            onChange={handleChange}
            error={fieldErrors.paymentNote}
          />
          <p className="order-form__notice" role="note">
            Se registra el pago que declara el cliente. No se valida en el banco ni se cobra con
            tarjeta.
          </p>
        </fieldset>

        <fieldset className="items-editor">
          <legend>Entrega</legend>
          <TextField
            label="Dirección de entrega"
            name="deliveryAddress"
            autoComplete="off"
            value={values.deliveryAddress}
            onChange={handleChange}
            error={fieldErrors.deliveryAddress}
          />
          <TextField
            label="Fecha y hora aproximada de entrega (hora de Ecuador)"
            name="scheduledAt"
            type="datetime-local"
            value={values.scheduledAt}
            onChange={handleChange}
            error={fieldErrors.scheduledAt}
          />
          <p className="text-muted order-form__hint">
            Entregas de {schedule.startTime} a {schedule.endTime}. La hora es aproximada: puede
            llegar un poco antes o un poco después.
          </p>
        </fieldset>

        <OrderItemsEditor
          items={values.items}
          products={products}
          onChange={(items) => setFields({ items })}
          error={fieldErrors.items}
        />
        <p className="order-form__total">
          Subtotal estimado:{' '}
          <strong>{formatCurrency(estimateOrderTotal(values.items, products))}</strong>
          <span className="text-muted">
            {' '}
            · El total con IVA lo calcula el servidor y aparece en el comprobante.
          </span>
        </p>
      </div>

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

      <div className="order-form__actions">
        <Button
          type="submit"
          isLoading={isSubmitting}
          loadingText="Registrando..."
          disabled={purchase.pending !== null}
        >
          Registrar venta
        </Button>
      </div>
    </form>
  )
}
