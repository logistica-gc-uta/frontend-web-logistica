import type { ReactNode } from 'react'
import { Alert } from './Alert'
import { Button } from './Button'

interface AsyncContentProps<T> {
  data: T | undefined
  isLoading: boolean
  error: string | null
  onRetry: () => void
  loadingText?: string
  children: (data: T) => ReactNode
}

/**
 * Muestra el estado de una carga de datos: cargando, error con reintento o el contenido.
 * Durante una recarga se mantiene el contenido anterior visible.
 */
export function AsyncContent<T>({
  data,
  isLoading,
  error,
  onRetry,
  loadingText = 'Cargando...',
  children,
}: AsyncContentProps<T>) {
  if (error) {
    return (
      <Alert>
        <span>{error}</span>{' '}
        <Button variant="secondary" onClick={onRetry}>
          Reintentar
        </Button>
      </Alert>
    )
  }

  if (data === undefined) {
    return isLoading ? (
      <p role="status" className="empty-state">
        {loadingText}
      </p>
    ) : null
  }

  return <>{children(data)}</>
}
