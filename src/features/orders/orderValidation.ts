import type { FieldErrors } from '../../hooks/useForm'
import { AppError } from '../../lib/errors/AppError'
import { localDateTimeToIso } from '../../lib/time/guayaquil'
import { isBlank, isPositiveInteger, toNumber } from '../../lib/validation/validators'
import type { Product } from '../products/types'
import { validateDeliverySchedule } from '../shop/checkout/deliverySchedule'
import type { DeliverySchedule } from '../shop/types'
import type { CreateAdminPurchaseInput, OrderFormValues, OrderItemFormValue } from './types'

/** Límites de los DTO de compra ADMIN del backend (#45). */
const MAX_NAME_LENGTH = 120
const MAX_PHONE_LENGTH = 40
const MAX_NOTE_LENGTH = 200

export const EMPTY_ORDER_ITEM: OrderItemFormValue = { productId: '', quantity: '1' }

export const INITIAL_ORDER_FORM: OrderFormValues = {
  buyerType: 'GUEST',
  buyerName: '',
  buyerPhone: '',
  giftToOther: false,
  recipientName: '',
  recipientPhone: '',
  paymentMethod: '',
  paymentNote: '',
  deliveryAddress: '',
  scheduledAt: '',
  items: [EMPTY_ORDER_ITEM],
  location: null,
  locationConfirmed: false,
}

/** Mensaje mientras el backend no ofrezca cómo buscar clientes registrados. */
export const REGISTERED_BUYER_PENDING =
  'Todavía no se puede elegir un cliente con cuenta: falta el buscador de clientes en el backend.'

/** Devuelve el primer mensaje de error de las líneas de producto, o `undefined` si son válidas. */
function validateItems(items: OrderItemFormValue[], products: Product[]): string | undefined {
  if (items.length === 0) return 'Agrega al menos un producto'

  const problems: string[] = []
  const requestedByProduct = new Map<string, number>()

  items.forEach(({ productId, quantity }, index) => {
    const position = index + 1
    const hasValidQuantity = isPositiveInteger(quantity)

    if (isBlank(productId)) problems.push(`Producto ${position}: selecciona un producto`)
    if (!hasValidQuantity) {
      problems.push(`Producto ${position}: la cantidad debe ser un entero mayor a 0`)
    }
    if (!isBlank(productId) && hasValidQuantity) {
      requestedByProduct.set(
        productId,
        (requestedByProduct.get(productId) ?? 0) + toNumber(quantity),
      )
    }
  })

  // Un mismo producto puede repetirse en varias líneas: el stock se compara con la suma.
  for (const [productId, requested] of requestedByProduct) {
    const product = products.find((candidate) => candidate.id === productId)
    if (product && requested > product.stock) {
      problems.push(`${product.name}: solo hay ${product.stock} en stock`)
    }
  }

  return problems.length > 0 ? problems.join('. ') : undefined
}

function requiredText(value: string, max: number, empty: string): string | undefined {
  const text = value.trim()
  if (text === '') return empty
  if (text.length > max) return `Máximo ${max} caracteres`
  return undefined
}

/**
 * Valida la venta con las mismas reglas que `CreateAdminOrderDto` y el horario vigente de la
 * tienda. La cobertura del punto la decide el servidor (`coverageError` llega ya resuelto).
 */
export function validateOrder(
  values: OrderFormValues,
  products: Product[],
  schedule: DeliverySchedule,
  coverageError?: string,
  now: Date = new Date(),
): FieldErrors<OrderFormValues> {
  const errors: FieldErrors<OrderFormValues> = {}

  if (values.buyerType === 'REGISTERED_CLIENT') errors.buyerType = REGISTERED_BUYER_PENDING
  else {
    const name = requiredText(values.buyerName, MAX_NAME_LENGTH, 'Escribe el nombre del comprador')
    if (name) errors.buyerName = name
  }
  const buyerPhone = requiredText(
    values.buyerPhone,
    MAX_PHONE_LENGTH,
    'El teléfono del comprador es obligatorio',
  )
  if (buyerPhone) errors.buyerPhone = buyerPhone

  if (values.giftToOther) {
    const name = requiredText(
      values.recipientName,
      MAX_NAME_LENGTH,
      'Escribe el nombre de quien recibe',
    )
    if (name) errors.recipientName = name
    const phone = requiredText(
      values.recipientPhone,
      MAX_PHONE_LENGTH,
      'El teléfono de quien recibe es obligatorio',
    )
    if (phone) errors.recipientPhone = phone
  }

  if (values.paymentMethod === '')
    errors.paymentMethod = 'Elige cómo pagó: efectivo o transferencia'
  if (values.paymentNote.trim().length > MAX_NOTE_LENGTH) {
    errors.paymentNote = `Máximo ${MAX_NOTE_LENGTH} caracteres`
  }

  if (isBlank(values.deliveryAddress))
    errors.deliveryAddress = 'La dirección de entrega es obligatoria'

  if (isBlank(values.scheduledAt)) {
    errors.scheduledAt = 'La fecha y la hora aproximada de entrega son obligatorias'
  } else {
    const [date = '', time = ''] = values.scheduledAt.split('T')
    const when = validateDeliverySchedule(date, time, schedule, now)
    const problem = when.date ?? when.time
    if (problem) errors.scheduledAt = problem
    else if (localDateTimeToIso(values.scheduledAt) === null) {
      errors.scheduledAt = 'La fecha y hora de entrega no son válidas'
    }
  }

  const itemsError = validateItems(values.items, products)
  if (itemsError) errors.items = itemsError

  if (values.location === null) errors.location = 'Coloca el marcador en el mapa'
  else if (coverageError) errors.location = coverageError
  else if (!values.locationConfirmed) errors.location = 'Confirma la ubicación en el mapa'

  return errors
}

/** Convierte los valores (ya validados) al cuerpo de `POST /orders/admin`. Sin zona (#42). */
export function toCreateAdminPurchaseInput(values: OrderFormValues): CreateAdminPurchaseInput {
  const scheduledDeliveryDate = localDateTimeToIso(values.scheduledAt)
  if (
    values.location === null ||
    scheduledDeliveryDate === null ||
    values.paymentMethod === '' ||
    values.buyerType !== 'GUEST'
  ) {
    throw new AppError('La venta tiene datos incompletos')
  }
  const note = values.paymentNote.trim()

  return {
    buyer: {
      type: 'GUEST',
      name: values.buyerName.trim(),
      contactPhone: values.buyerPhone.trim(),
    },
    ...(values.giftToOther && {
      giftRecipient: {
        name: values.recipientName.trim(),
        contactPhone: values.recipientPhone.trim(),
      },
    }),
    payment: { method: values.paymentMethod, ...(note && { note }) },
    deliveryAddress: values.deliveryAddress.trim(),
    items: values.items.map(({ productId, quantity }) => ({
      productId,
      quantity: toNumber(quantity),
    })),
    scheduledDeliveryDate,
    deliveryLat: values.location.lat,
    deliveryLng: values.location.lng,
  }
}

/** Subtotal estimado con los precios actuales (sin IVA): el total real lo calcula el servidor. */
export function estimateOrderTotal(items: OrderItemFormValue[], products: Product[]): number {
  const total = items.reduce((sum, { productId, quantity }) => {
    const product = products.find((candidate) => candidate.id === productId)
    return product && isPositiveInteger(quantity) ? sum + product.price * toNumber(quantity) : sum
  }, 0)
  return Math.round(total * 100) / 100
}
