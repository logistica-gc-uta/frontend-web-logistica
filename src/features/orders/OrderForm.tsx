import { useMemo, useState, type FormEvent } from 'react'
import { LocationPicker } from '../../components/map/LocationPicker'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { SelectField } from '../../components/ui/SelectField'
import { TextField } from '../../components/ui/TextField'
import { useForm } from '../../hooks/useForm'
import { formatCurrency } from '../../lib/format/formatCurrency'
import type { GeoPoint } from '../../types/geo'
import type { Product } from '../products/types'
import type { Zone } from '../zones/types'
import { OrderItemsEditor } from './OrderItemsEditor'
import { ordersService } from './ordersService'
import {
  EMPTY_ORDER_ITEM,
  estimateOrderTotal,
  toCreateAdminOrderInput,
  validateOrder,
} from './orderValidation'
import type { CreatedOrder, OrderFormValues } from './types'

/** Centro de Ambato: vista inicial del mapa mientras no se elige una zona con depósito. */
const DEFAULT_MAP_CENTER: GeoPoint = { lat: -1.2417, lng: -78.6197 }

const INITIAL_VALUES: OrderFormValues = {
  recipientName: '',
  recipientPhone: '',
  zoneId: '',
  deliveryAddress: '',
  scheduledAt: '',
  items: [EMPTY_ORDER_ITEM],
  location: null,
  locationConfirmed: false,
}

interface OrderFormProps {
  zones: Zone[]
  products: Product[]
  onCreated: (order: CreatedOrder) => void
}

export function OrderForm({ zones, products, onCreated }: OrderFormProps) {
  // Sin depósito el backend rechaza el pedido, así que esas zonas no se ofrecen.
  const deliverableZones = useMemo(
    () => zones.filter((zone) => zone.depotLocation !== null),
    [zones],
  )

  const [createdMessage, setCreatedMessage] = useState<string | null>(null)

  const { values, fieldErrors, submitError, isSubmitting, handleChange, setFields, handleSubmit } =
    useForm({
      initialValues: INITIAL_VALUES,
      validate: (formValues) => validateOrder(formValues, products),
      errorMessage: 'No se pudo registrar el pedido',
      resetOnSuccess: true,
      onSubmit: async (formValues) => {
        const order = await ordersService.createAsAdmin(toCreateAdminOrderInput(formValues))
        setCreatedMessage(`Pedido registrado correctamente. Total: ${formatCurrency(order.total)}`)
        onCreated(order)
      },
    })

  /** El aviso de éxito pertenece al pedido anterior: se oculta en cuanto se intenta registrar otro. */
  const submit = (event: FormEvent<HTMLFormElement>) => {
    setCreatedMessage(null)
    return handleSubmit(event)
  }

  const depot = deliverableZones.find((zone) => zone.id === values.zoneId)?.depotLocation ?? null

  return (
    <form className="order-form" onSubmit={submit} noValidate aria-label="Nuevo pedido">
      {createdMessage && (
        <div className="order-form__alert">
          <Alert variant="success">{createdMessage}</Alert>
        </div>
      )}
      {submitError && (
        <div className="order-form__alert">
          <Alert>{submitError}</Alert>
        </div>
      )}
      {deliverableZones.length === 0 && (
        <div className="order-form__alert">
          <Alert>
            Ninguna zona tiene depósito configurado, por lo que todavía no se pueden registrar
            pedidos.
          </Alert>
        </div>
      )}

      <div className="order-form__fields">
        <TextField
          label="Nombre del destinatario"
          name="recipientName"
          autoComplete="off"
          value={values.recipientName}
          onChange={handleChange}
          error={fieldErrors.recipientName}
        />
        <TextField
          label="Teléfono de contacto"
          name="recipientPhone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={values.recipientPhone}
          onChange={handleChange}
          error={fieldErrors.recipientPhone}
        />
        <SelectField
          label="Zona"
          name="zoneId"
          value={values.zoneId}
          onChange={handleChange}
          error={fieldErrors.zoneId}
        >
          <option value="">Selecciona una zona</option>
          {deliverableZones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {`${zone.code} · ${zone.name}`}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Dirección de entrega"
          name="deliveryAddress"
          autoComplete="off"
          value={values.deliveryAddress}
          onChange={handleChange}
          error={fieldErrors.deliveryAddress}
        />
        <TextField
          label="Fecha y hora de entrega (hora de Guayaquil)"
          name="scheduledAt"
          type="datetime-local"
          value={values.scheduledAt}
          onChange={handleChange}
          error={fieldErrors.scheduledAt}
        />
        <OrderItemsEditor
          items={values.items}
          products={products}
          onChange={(items) => setFields({ items })}
          error={fieldErrors.items}
        />
        <p className="order-form__total">
          Total estimado:{' '}
          <strong>{formatCurrency(estimateOrderTotal(values.items, products))}</strong>
        </p>
      </div>

      <div className="order-form__map">
        <LocationPicker
          center={depot ?? DEFAULT_MAP_CENTER}
          depot={depot}
          value={values.location}
          isConfirmed={values.locationConfirmed}
          onChange={(location) => setFields({ location, locationConfirmed: false })}
          onConfirm={() => setFields({ locationConfirmed: true })}
          error={fieldErrors.location}
        />
      </div>

      <div className="order-form__actions">
        <Button type="submit" isLoading={isSubmitting} loadingText="Registrando...">
          Registrar pedido
        </Button>
      </div>
    </form>
  )
}
