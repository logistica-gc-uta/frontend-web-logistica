import { Button } from '../../components/ui/Button'
import { Notice } from '../../components/ui/Notice'
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
      <Notice role="status" className="road-engine">
        <strong>Motor vial desactivado.</strong> Las distancias se calculan en línea recta y el mapa
        no muestra recorridos por calles.
      </Notice>
    )
  }

  if (engine.available) {
    return (
      <Notice tone="success" role="status" className="road-engine road-engine--ok">
        <strong>Motor vial activo.</strong> Las rutas se miden por calles con distancias y
        duraciones estimadas (sin tráfico en vivo).
      </Notice>
    )
  }

  return (
    <Notice tone="danger" role="alert" className="road-engine road-engine--down">
      <p>
        <strong>El motor vial no responde.</strong> Mientras tanto no se pueden calcular propuestas:
        no se usa la línea recta como reemplazo. Los pedidos siguen pendientes y las rutas guardadas
        no cambian.
      </p>
      <p className="text-muted">{engine.message}</p>
      <Button variant="secondary" onClick={status.reload}>
        Volver a comprobar
      </Button>
    </Notice>
  )
}
