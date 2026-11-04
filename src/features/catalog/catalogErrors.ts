import axios from 'axios'
import { shopErrorInfo } from '../shop/shopError'

/** Mensajes por código del backend (nunca por el texto) para la administración del catálogo. */
const MESSAGES: Record<string, string> = {
  SKU_ALREADY_EXISTS: 'Ya existe un producto con ese SKU.',
  CATEGORY_ALREADY_EXISTS: 'Ya existe una categoría con ese nombre o slug.',
  CATEGORY_NOT_FOUND: 'La categoría elegida ya no existe.',
  PRODUCT_NOT_FOUND: 'El producto ya no existe.',
  PRODUCT_PUBLICATION_INVALID:
    'No se puede publicar: necesita una categoría activa, descripción, precio e imagen principal.',
  IMAGE_TOO_LARGE: 'La imagen supera los 5 MiB.',
  IMAGE_UNSUPPORTED: 'Formato no admitido: usa una imagen JPEG, PNG o WebP.',
  IMAGE_ASSOCIATION_FAILED:
    'La imagen se subió pero no se pudo asociar al producto. Vuelve a intentarlo.',
  UPLOAD_FAILED: 'El servicio de imágenes no respondió. Vuelve a intentarlo.',
  SETTINGS_VERSION_CONFLICT:
    'Otro administrador guardó la configuración mientras la editabas. Recarga los valores actuales antes de guardar.',
  VALIDATION_ERROR: 'Hay datos inválidos: revisa el formulario.',
}

/** Campo del formulario al que pertenece el error, para mostrarlo junto al campo. */
export const ERROR_FIELDS: Partial<Record<string, string>> = {
  SKU_ALREADY_EXISTS: 'sku',
  CATEGORY_NOT_FOUND: 'categoryId',
  CATEGORY_ALREADY_EXISTS: 'slug',
}

export function describeCatalogError(error: unknown, fallback: string): string {
  const { status, code } = shopErrorInfo(error)
  if (code && MESSAGES[code]) return MESSAGES[code]
  if (status === 401) return 'Tu sesión venció. Vuelve a iniciar sesión.'
  if (status === 403)
    return 'Solo un ADMIN puede administrar el catálogo y la configuración del Shop.'
  if (axios.isAxiosError(error) && !error.response) return 'No se pudo conectar con el servidor.'
  return fallback
}
