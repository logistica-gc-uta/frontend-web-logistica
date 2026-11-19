import type { ReactNode } from 'react'

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
      <div role="alert" className="load-error">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 3 2 20h20L12 3ZM12 10v4M12 17.5v.01" />
        </svg>
        <span>{error}</span>
        <button
          type="button"
          className="load-error__retry"
          aria-label="Reintentar"
          title="Reintentar"
          onClick={onRetry}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />
          </svg>
        </button>
      </div>
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
