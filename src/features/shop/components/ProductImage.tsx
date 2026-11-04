import { useState } from 'react'

interface ProductImageProps {
  src: string | null
  alt: string
  className?: string
  /** La imagen principal del detalle se carga de inmediato; las del listado, al acercarse. */
  eager?: boolean
}

/** Imagen remota con texto alternativo y un reemplazo si falta o no se puede cargar. */
export function ProductImage({ src, alt, className = '', eager = false }: ProductImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  if (!src || failedSrc === src) {
    return (
      <div
        className={`product-image product-image--placeholder ${className}`}
        role="img"
        aria-label={alt}
      >
        <span aria-hidden="true">🎁</span>
        <small>Imagen no disponible</small>
      </div>
    )
  }

  return (
    <img
      className={`product-image ${className}`}
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailedSrc(src)}
    />
  )
}
