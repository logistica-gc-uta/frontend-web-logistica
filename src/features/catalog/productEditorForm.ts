import type { FieldErrors } from '../../hooks/useForm'
import { dollarsToCents } from '../shop/money'
import type { AdminProduct, ProductChanges, ProductInput } from './types'

/** Valores tal como se escriben en el formulario (el precio en dólares, como texto). */
export type ProductForm = {
  sku: string
  name: string
  description: string
  categoryId: string
  price: string
  stock: string
  isFeatured: boolean
}

export const EMPTY_PRODUCT_FORM: ProductForm = {
  sku: '',
  name: '',
  description: '',
  categoryId: '',
  price: '',
  stock: '0',
  isFeatured: false,
}

/** Centavos → texto en dólares para editar (1999 → "19.99"). */
export const centsToDollars = (cents: number | null): string =>
  cents === null ? '' : `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`

export const formFromProduct = (product: AdminProduct): ProductForm => ({
  sku: product.sku,
  name: product.name,
  description: product.description ?? '',
  categoryId: product.categoryId ?? '',
  price: centsToDollars(product.priceCents),
  stock: String(product.stock),
  isFeatured: product.isFeatured,
})

/** Mismos límites que el `CreateCatalogProductDto` del backend. */
export function validateProductForm(
  values: ProductForm,
  { isNew }: { isNew: boolean },
): FieldErrors<ProductForm> {
  const errors: FieldErrors<ProductForm> = {}
  const sku = values.sku.trim()
  const name = values.name.trim()
  const description = values.description.trim()
  const cents = dollarsToCents(values.price)

  if (isNew && (sku.length < 3 || sku.length > 50))
    errors.sku = 'El SKU debe tener entre 3 y 50 caracteres'
  if (name.length < 3 || name.length > 160)
    errors.name = 'El nombre debe tener entre 3 y 160 caracteres'
  if (description.length < 1 || description.length > 2000) {
    errors.description = 'Escribe una descripción (hasta 2000 caracteres)'
  }
  if (values.categoryId === '') errors.categoryId = 'Elige una categoría'
  if (cents === null || cents < 1) errors.price = 'Escribe un precio mayor a 0, por ejemplo 19,99'
  if (!/^\d{1,9}$/.test(values.stock.trim())) errors.stock = 'El stock es un número entero desde 0'
  return errors
}

export const toProductInput = (values: ProductForm): ProductInput => ({
  sku: values.sku.trim(),
  name: values.name.trim(),
  description: values.description.trim(),
  categoryId: values.categoryId,
  priceCents: dollarsToCents(values.price)!,
  stock: Number(values.stock.trim()),
  isFeatured: values.isFeatured,
})

/** Solo lo que cambió respecto del producto guardado (el SKU nunca se envía al editar). */
export function productChanges(values: ProductForm, saved: AdminProduct): ProductChanges {
  const { sku: _sku, ...next } = toProductInput(values)
  const changes: ProductChanges = {}
  if (next.name !== saved.name) changes.name = next.name
  if (next.description !== (saved.description ?? '')) changes.description = next.description
  if (next.categoryId !== saved.categoryId) changes.categoryId = next.categoryId
  if (next.priceCents !== saved.priceCents) changes.priceCents = next.priceCents
  if (next.stock !== saved.stock) changes.stock = next.stock
  if (next.isFeatured !== saved.isFeatured) changes.isFeatured = next.isFeatured
  return changes
}

/** Por qué todavía no se puede publicar (el backend hace la validación definitiva). */
export function publicationBlockers(
  product: AdminProduct,
  activeCategoryIds: Set<string>,
): string[] {
  const blockers: string[] = []
  if (!product.categoryId || !activeCategoryIds.has(product.categoryId))
    blockers.push('una categoría activa')
  if (!product.description?.trim()) blockers.push('una descripción')
  if (product.priceCents === null) blockers.push('un precio')
  if (!product.images.some((image) => image.isPrimary)) blockers.push('una imagen principal')
  return blockers
}
