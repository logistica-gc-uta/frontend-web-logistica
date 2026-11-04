import type { FieldErrors } from '../../hooks/useForm'

export type CategoryForm = { name: string; slug: string; description: string }

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Slug a partir del nombre: minúsculas, sin tildes y con guiones ("Día de la Madre" → "dia-de-la-madre"). */
export const slugify = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export function validateCategory(
  { name, slug, description }: CategoryForm,
  isNew: boolean,
): FieldErrors<CategoryForm> {
  const errors: FieldErrors<CategoryForm> = {}
  const trimmed = name.trim()
  if (trimmed.length < 2 || trimmed.length > 80)
    errors.name = 'El nombre debe tener entre 2 y 80 caracteres'
  if (isNew && (!SLUG.test(slug) || slug.length < 2 || slug.length > 100)) {
    errors.slug = 'Usa minúsculas, números y guiones (por ejemplo, dia-de-la-madre)'
  }
  if (description.trim().length > 300) errors.description = 'Máximo 300 caracteres'
  return errors
}
