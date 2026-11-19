import { useCallback, useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { AsyncContent } from '../../components/ui/AsyncContent'
import { Button } from '../../components/ui/Button'
import { Drawer } from '../../components/ui/Drawer'
import { useFetch } from '../../hooks/useFetch'
import { useAsyncAction } from '../../hooks/useAsyncAction'
import { AppError } from '../../lib/errors/AppError'
import { todayInGuayaquil } from '../../lib/time/guayaquil'
import { driversService } from './driversService'
import { ExcludedOrders } from './ExcludedOrders'
import { PlanningFilters } from './PlanningFilters'
import { PlanningResult } from './PlanningResult'
import { planningService } from './planningService'
import { RoadEngineNotice } from './RoadEngineNotice'
import { SavedRoutes } from './SavedRoutes'
import { namedRoutesOfDay } from './savedRouteNames'
import { useSavedRouteActions } from './useSavedRouteActions'
import { describeRoadError } from './roadErrors'
import type { ProposalsQuery } from './types'

/** Calcula las propuestas y traduce los rechazos del motor vial (#47) a un mensaje claro. */
async function loadProposals(query: ProposalsQuery) {
  try {
    return await planningService.getProposals(query)
  } catch (error) {
    const road = describeRoadError(error)
    throw road ? new AppError(road) : error
  }
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

export function PlanningPage() {
  const preview = useAsyncAction(loadProposals, 'No se pudo calcular la propuesta de rutas')
  /** Cambia en cada cálculo: el resultado nuevo empieza sin selección ni confirmaciones previas. */
  const [calculation, setCalculation] = useState(0)
  const [lastQuery, setLastQuery] = useState<ProposalsQuery | null>(null)
  const [selectedDate, setSelectedDate] = useState(todayInGuayaquil)

  const filterDay = ISO_DAY.test(selectedDate) ? selectedDate : todayInGuayaquil()
  // Rutas ya guardadas del día planificado (hoy mientras no haya una propuesta), en un panel lateral.
  const day = preview.data?.date ?? filterDay
  const isToday = preview.data?.isToday ?? true
  const savedRoutes = useFetch(
    planningService.listRoutes,
    'No se pudieron cargar las rutas guardadas',
  )
  // Disponibilidad del día elegido antes de previsualizar: un chofer ausente ese día no se ofrece.
  const loadDrivers = useCallback(() => driversService.listForDay(filterDay), [filterDay])
  const drivers = useFetch(loadDrivers, 'No se pudieron cargar los choferes')
  const { reload: reloadSavedRoutes } = savedRoutes
  const { reload: reloadDrivers } = drivers
  const selectedDriver = lastQuery?.driverId
    ? drivers.data?.find((driver) => driver.id === lastQuery.driverId)
    : undefined
  // Asignar o corregir cambia rutas y la disponibilidad de los choferes: se consultan de nuevo.
  const refreshSavedState = useCallback(() => {
    reloadSavedRoutes()
    reloadDrivers()
  }, [reloadSavedRoutes, reloadDrivers])
  const routeActions = useSavedRouteActions(refreshSavedState)
  const [savedOpen, setSavedOpen] = useState(false)
  const closeSaved = useCallback(() => setSavedOpen(false), [])
  const savedCount = savedRoutes.data ? namedRoutesOfDay(savedRoutes.data, day).length : 0
  // Pedidos que la última propuesta dejó fuera: un aviso en la cabecera abre su detalle.
  const excluded = preview.data?.excluded ?? []
  const [excludedOpen, setExcludedOpen] = useState(false)
  const closeExcluded = useCallback(() => setExcludedOpen(false), [])

  const handlePreview = async (query: ProposalsQuery) => {
    setCalculation((count) => count + 1)
    setLastQuery(query)
    await preview.run(query)
  }

  return (
    <main className="page planning-page">
      <header className="planning-page__head">
        <div>
          <h1>Planificación de rutas</h1>
          <p className="text-muted">
            Previsualiza las rutas de un día; nada se guarda hasta confirmar.
          </p>
        </div>
        <div className="planning-page__actions">
          {excluded.length > 0 && (
            <button
              type="button"
              className="orders-admin__list-button orders-admin__list-button--warning"
              aria-haspopup="dialog"
              aria-label="Ver pedidos excluidos"
              title="Pedidos excluidos"
              onClick={() => setExcludedOpen(true)}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 3 2 20h20L12 3ZM12 10v4M12 17.5v.01" />
              </svg>
              <span className="orders-admin__list-label">Excluidos</span>
              <span className="orders-admin__list-count" aria-hidden="true">
                {excluded.length}
              </span>
            </button>
          )}
          <button
            type="button"
            className="orders-admin__list-button"
            aria-haspopup="dialog"
            aria-label="Ver rutas guardadas"
            title="Rutas guardadas"
            onClick={() => {
              // Al abrir se vuelve a leer: el chofer pudo terminar una ruta desde la app mientras tanto.
              refreshSavedState()
              setSavedOpen(true)
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM8 18h5a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h5" />
            </svg>
            <span className="orders-admin__list-label">Rutas guardadas</span>
            {savedCount > 0 && (
              <span className="orders-admin__list-count" aria-hidden="true">
                {savedCount}
              </span>
            )}
          </button>
        </div>
      </header>

      <div className="page-stack">
        <section className="card planning-form" aria-labelledby="planning-form-title">
          <h2 id="planning-form-title">Previsualizar</h2>
          <div className="planning-form__body">
            <PlanningFilters
              onPreview={handlePreview}
              drivers={drivers.data ?? undefined}
              driversLoading={drivers.isLoading}
              driversError={drivers.error}
              onDateChange={setSelectedDate}
            />
            <RoadEngineNotice />
          </div>
        </section>

        {preview.isRunning && (
          <p role="status" className="empty-state">
            Calculando la propuesta de rutas...
          </p>
        )}
        {preview.error && (
          <Alert>
            <span>{preview.error}</span>{' '}
            {lastQuery && (
              <Button variant="secondary" onClick={() => void handlePreview(lastQuery)}>
                Reintentar
              </Button>
            )}
          </Alert>
        )}
        {preview.data && (
          <PlanningResult
            key={calculation}
            data={preview.data}
            driverId={lastQuery?.driverId}
            selectedDriver={selectedDriver}
            onSaved={reloadSavedRoutes}
          />
        )}
      </div>

      <ExcludedOrders
        excluded={excluded}
        open={excludedOpen}
        onClose={closeExcluded}
        capacity={preview.data?.capacity}
        date={preview.data?.date}
        drivers={drivers.data ?? undefined}
        selectedDriverId={lastQuery?.driverId}
      />

      <Drawer
        open={savedOpen}
        onClose={closeSaved}
        title="Rutas guardadas"
        titleId="saved-routes-title"
        className="drawer__panel--narrow drawer__panel--routes"
      >
        <p className="text-muted">Del {day}. Aquí se asigna el chofer y se corrigen las paradas.</p>
        <AsyncContent
          {...savedRoutes}
          onRetry={reloadSavedRoutes}
          loadingText="Cargando rutas guardadas..."
        >
          {(routes) => (
            <>
              {drivers.error && <p className="field__error">{drivers.error}</p>}
              <SavedRoutes
                day={day}
                routes={routes}
                drivers={drivers.data ?? []}
                actions={routeActions.states}
                onAssign={routeActions.assign}
                onReassign={routeActions.reassign}
                onReorder={routeActions.reorder}
                onMove={routeActions.move}
                isToday={isToday}
                onRelease={routeActions.release}
                onCancel={routeActions.cancel}
              />
            </>
          )}
        </AsyncContent>
      </Drawer>
    </main>
  )
}
