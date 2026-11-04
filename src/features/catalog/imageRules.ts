export const MAX_IMAGES = 6
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** Validación del archivo antes de subirlo (por comodidad; el backend la repite por seguridad). */
export function checkImageFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type))
    return 'Formato no admitido: usa una imagen JPEG, PNG o WebP.'
  if (file.size > MAX_IMAGE_BYTES) return 'La imagen supera los 5 MiB.'
  return null
}
