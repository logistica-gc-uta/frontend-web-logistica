import type { FieldErrors } from '../../hooks/useForm'
import { AppError } from '../../lib/errors/AppError'
import { localDateTimeToIso } from '../../lib/time/guayaquil'
import { isBlank, isPositiveInteger, toNumber } from '../../lib/validation/validators'
import type { Product } from '../products/types'
import type { CreateAdminOrderInput, OrderFormValues, OrderItemFormValue } from './types'

/** Límites del `GuestRecipientDto` del backend. */
const MAX_RECIPIENT_NAME_LENGTH = 120
const MAX_RECIPIENT_PHONE_LENGTH = 40

export const EMPTY_ORDER_ITEM: OrderItemFormValue = { productId: '', quantity: '1' }

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

/**
 * Valida el formulario con las mismas reglas que `CreateAdminOrderDto` y el servicio de pedidos.
 * `now` (ms desde 1970) permite probar la regla de fecha futura de forma determinista.
 */
export function validateOrder(
  values: OrderFormValues,
  products: Product[],
  now: number = Date.now(),
): FieldErrors<OrderFormValues> {
  const errors: FieldErrors<OrderFormValues> = {}

  const recipientName = values.recipientName.trim()
  if (recipientName === '') errors.recipientName = 'El nombre del destinatario es obligatorio'
  else if (recipientName.length > MAX_RECIPIENT_NAME_LENGTH) {
    errors.recipientName = `El nombre no puede superar ${MAX_RECIPIENT_NAME_LENGTH} caracteres`
  }

  const recipientPhone = values.recipientPhone.trim()
  if (recipientPhone === '') errors.recipientPhone = 'El teléfono de contacto es obligatorio'
  else if (recipientPhone.length > MAX_RECIPIENT_PHONE_LENGTH) {
    errors.recipientPhone = `El teléfono no puede superar ${MAX_RECIPIENT_PHONE_LENGTH} caracteres`
  }

  if (isBlank(values.zoneId)) errors.zoneId = 'Selecciona una zona'
  if (isBlank(values.deliveryAddress))
    errors.deliveryAddress = 'La dirección de entrega es obligatoria'

  const scheduledIso = localDateTimeToIso(values.scheduledAt)
  if (isBlank(values.scheduledAt)) {
    errors.scheduledAt = 'La fecha y hora de entrega son obligatorias'
  } else if (scheduledIso === null) {
    errors.scheduledAt = 'La fecha y hora de entrega no son válidas'
  } else if (Date.parse(scheduledIso) <= now) {
    errors.scheduledAt = 'La entrega debe programarse para una fecha y hora futuras'
  }

  const itemsError = validateItems(values.items, products)
  if (itemsError) errors.items = itemsError

  if (values.location === null) errors.location = 'Coloca el marcador en el mapa'
  else if (!values.locationConfirmed) errors.location = 'Confirma la ubicación en el mapa'

  return errors
}

/** Convierte los valores (ya validados) al cuerpo de `POST /orders/admin`. */
export function toCreateAdminOrderInput(values: OrderFormValues): CreateAdminOrderInput {
  const scheduledDeliveryDate = localDateTimeToIso(values.scheduledAt)
  if (values.location === null || scheduledDeliveryDate === null) {
    throw new AppError('El pedido tiene datos incompletos')
  }

  return {
    recipient: {
      type: 'GUEST',
      name: values.recipientName.trim(),
      contactPhone: values.recipientPhone.trim(),
    },
    zoneId: values.zoneId,
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

/** Total estimado con los precios actuales; ignora las líneas incompletas o inválidas. */
export function estimateOrderTotal(items: OrderItemFormValue[], products: Product[]): number {
  const total = items.reduce((sum, { productId, quantity }) => {
    const product = products.find((candidate) => candidate.id === productId)
    return product && isPositiveInteger(quantity) ? sum + product.price * toNumber(quantity) : sum
  }, 0)
  return Math.round(total * 100) / 100
}
