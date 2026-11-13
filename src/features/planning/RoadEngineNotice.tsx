import { Button } from '../../components/ui/Button'
import { useFetch } from '../../hooks/useFetch'
import { planningService } from './planningService'

/**
 * Estado del motor vial antes de planificar (backend #47): activo, desactivado (línea recta) o
 * sin respuesta. Si no se puede consultar no se muestra nada: el cálculo igual informa el método.
 */
export function RoadEngineNotice() {
  const status = useFetch(planningService.roadEngine, 'No se pudo consultar el motor vial')
  const engine = status.data
  if (!engine) return null

  if (engine.engine === 'HAVERSINE') {
    return (
      <p className="notice road-engine" role="status">
        <strong>Motor vial desactivado.</strong> Las distancias se calculan en línea recta y el mapa
        no muestra recorridos por calles.
      </p>
    )
  }

  if (engine.available) {
    return (
      <p className="notice road-engine road-engine--ok" role="status">
        <strong>Motor vial activo.</strong> Las rutas se miden por calles con distancias y
        duraciones estimadas (sin tráfico en vivo).
      </p>
    )
  }

  return (
    <div className="notice road-engine road-engine--down" role="alert">
      <p>
        <strong>El motor vial no responde.</strong> Mientras tanto no se pueden calcular propuestas:
        no se usa la línea recta como reemplazo. Los pedidos siguen pendientes y las rutas guardadas
        no cambian.
      </p>
      <p className="text-muted">{engine.message}</p>
      <Button variant="secondary" onClick={status.reload}>
        Volver a comprobar
      </Button>
    </div>
  )
}
