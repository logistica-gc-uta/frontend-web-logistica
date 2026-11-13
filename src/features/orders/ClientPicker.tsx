import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { getErrorMessage } from '../../lib/http/apiError'
import {
  adminClientsService,
  CLIENT_PAGE_SIZE,
  CLIENT_SEARCH_MAX,
  CLIENT_SEARCH_MIN,
  type AdminClient,
} from './adminClientsService'

/** Espera tras la última tecla antes de buscar, para no consultar en cada letra. */
export const CLIENT_SEARCH_DELAY_MS = 300

type SearchState =
  | { status: 'idle' }
  | { status: 'loading'; items: AdminClient[] }
  | { status: 'done'; items: AdminClient[]; total: number; page: number }
  | { status: 'failed'; items: AdminClient[]; message: string }

interface ClientPickerProps {
  value: AdminClient | null
  onChange: (client: AdminClient | null) => void
  error?: string
}

/**
 * Buscador de clientes registrados (backend #64) para una venta ADMIN. Busca por nombre o correo
 * (no por teléfono: las cuentas no lo guardan) y deja elegir una cuenta.
 */
export function ClientPicker({ value, onChange, error }: ClientPickerProps) {
  const [text, setText] = useState('')
  const [state, setState] = useState<SearchState>({ status: 'idle' })
  // Solo cuenta la respuesta de la última búsqueda: una más lenta y anterior se descarta.
  const lastRequest = useRef(0)

  const run = useCallback(async (query: string, page: number, previous: AdminClient[]) => {
    const request = ++lastRequest.current
    setState({ status: 'loading', items: previous })
    try {
      const result = await adminClientsService.search(query, page)
      if (request !== lastRequest.current) return
      setState({
        status: 'done',
        items: [...previous, ...result.items],
        total: result.total,
        page: result.page,
      })
    } catch (failure) {
      if (request !== lastRequest.current) return
      setState({
        status: 'failed',
        items: previous,
        message: getErrorMessage(failure, 'No se pudo buscar clientes'),
      })
    }
  }, [])

  const query = text.trim()
  const canSearch = query.length >= CLIENT_SEARCH_MIN

  useEffect(() => {
    if (value || !canSearch) {
      lastRequest.current += 1
      return
    }
    const timer = setTimeout(() => void run(query, 1, []), CLIENT_SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [query, canSearch, value, run])

  if (value) {
    return (
      <div className="client-picker__chosen" role="group" aria-label="Cliente elegido">
        <div>
          <strong>{value.name}</strong>
          <span className="text-muted"> · {value.email}</span>
        </div>
        <Button variant="secondary" onClick={() => onChange(null)}>
          Cambiar cliente
        </Button>
      </div>
    )
  }

  const items = state.status === 'idle' ? [] : state.items
  const hasMore = state.status === 'done' && items.length < state.total

  return (
    <div className="client-picker">
      <TextField
        label="Buscar cliente por nombre o correo"
        type="search"
        autoComplete="off"
        maxLength={CLIENT_SEARCH_MAX}
        value={text}
        onChange={(event) => setText(event.target.value)}
        error={error}
      />
      {!canSearch ? (
        <p className="text-muted order-form__hint">
          Escribe al menos {CLIENT_SEARCH_MIN} letras. Las cuentas no guardan teléfono: busca por
          nombre o correo.
        </p>
      ) : (
        <>
          {items.length > 0 && (
            <ul className="client-picker__results" aria-label="Clientes encontrados">
              {items.map((client) => (
                <li key={client.id}>
                  <span>
                    <strong>{client.name}</strong>
                    <span className="text-muted"> · {client.email}</span>
                  </span>
                  <Button
                    variant="secondary"
                    aria-label={`Elegir a ${client.name} (${client.email})`}
                    onClick={() => onChange(client)}
                  >
                    Elegir
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {state.status === 'loading' && (
            <p className="text-muted order-form__hint" role="status">
              Buscando clientes…
            </p>
          )}
          {state.status === 'done' && items.length === 0 && (
            <p className="text-muted order-form__hint" role="status">
              No hay clientes con ese nombre o correo. Si no tiene cuenta, regístralo como invitado.
            </p>
          )}
          {state.status === 'failed' && (
            <p className="field__error" role="alert">
              {state.message}.{' '}
              <Button
                variant="secondary"
                onClick={() =>
                  void run(query, Math.floor(items.length / CLIENT_PAGE_SIZE) + 1, items)
                }
              >
                Reintentar
              </Button>
            </p>
          )}
          {hasMore && (
            <Button variant="secondary" onClick={() => void run(query, state.page + 1, items)}>
              Ver más clientes
            </Button>
          )}
        </>
      )}
    </div>
  )
}
