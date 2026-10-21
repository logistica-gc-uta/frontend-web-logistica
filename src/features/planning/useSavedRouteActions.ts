import { useKeyedActions } from '../../hooks/useKeyedActions'
import { dispatchService } from '../dispatch/dispatchService'
import { describeAssignError, describeCorrectionError } from './confirmError'
import { planningService } from './planningService'

/**
 * Acciones sobre las rutas guardadas: asignar o cambiar el chofer y corregir paradas. Las usan las
 * pantallas de Planificación y de Urgencias; `onDone` vuelve a consultar rutas y choferes.
 */
export function useSavedRouteActions(onDone: () => void) {
  const { states, run } = useKeyedActions(onDone)

  return {
    states,
    assign: (routeId: string, driverId: string) =>
      void run(routeId, () => planningService.assignDriver(routeId, driverId), describeAssignError),
    reassign: (routeId: string, driverId: string, reason: string) =>
      void run(
        routeId,
        () => dispatchService.reassignDriver(routeId, driverId, reason),
        describeAssignError,
      ),
    reorder: (routeId: string, orderIds: string[], reason: string) =>
      run(
        routeId,
        () => dispatchService.reorderStops({ routeId, orderIds, reason }),
        describeCorrectionError,
      ),
    move: (routeId: string, orderId: string, targetRouteId: string, reason: string) =>
      run(
        routeId,
        () => dispatchService.moveOrder({ routeId, orderId, targetRouteId, reason }),
        describeCorrectionError,
      ),
  }
}
