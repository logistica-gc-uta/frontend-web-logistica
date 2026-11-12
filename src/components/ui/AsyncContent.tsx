import type { ReactNode } from 'react'
import { Alert } from './Alert'
import { Button } from './Button'

interface AsyncContentProps<T> {
  data: T | undefined
  isLoading: boolean
  error: string | null
  onRetry: () => void
  loadingText?: string
  loading?: ReactNode
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
  loading,
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
    if (!isLoading) return null
    if (!loading) {
      return (
        <p role="status" className="empty-state">
          {loadingText}
        </p>
      )
    }
    return (
      <div role="status">
        <span className="visually-hidden">{loadingText}</span>
        {loading}
      </div>
    )
  }

  return <>{children(data)}</>
}
