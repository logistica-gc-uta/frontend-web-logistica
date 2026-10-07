import type { FieldErrors } from '../../hooks/useForm'
import {
  isBlank,
  isNonNegativeInteger,
  isPositiveNumber,
  toNumber,
} from '../../lib/validation/validators'
import type { CreateProductInput, ProductFormValues } from './types'

/** Valida el formulario de producto con los mismos criterios que el CreateProductDto del backend. */
export function validateProduct({
  name,
  price,
  stock,
}: ProductFormValues): FieldErrors<ProductFormValues> {
  const errors: FieldErrors<ProductFormValues> = {}

  if (isBlank(name)) errors.name = 'El nombre es obligatorio'

  if (isBlank(price)) errors.price = 'El precio es obligatorio'
  else if (!isPositiveNumber(price)) errors.price = 'El precio debe ser mayor a 0'

  if (isBlank(stock)) errors.stock = 'El stock es obligatorio'
  else if (!isNonNegativeInteger(stock))
    errors.stock = 'El stock debe ser un número entero mayor o igual a 0'

  return errors
}

/** Convierte los valores del formulario al formato que espera el backend. */
export function toCreateProductInput({
  name,
  description,
  price,
  stock,
}: ProductFormValues): CreateProductInput {
  const trimmedDescription = description.trim()
  return {
    name: name.trim(),
    ...(trimmedDescription && { description: trimmedDescription }),
    price: toNumber(price),
    stock: toNumber(stock),
  }
}
