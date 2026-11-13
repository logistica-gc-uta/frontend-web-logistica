import { useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { AsyncContent } from '../../components/ui/AsyncContent'
import { Button } from '../../components/ui/Button'
import { useAsyncAction } from '../../hooks/useAsyncAction'
import { useFetch } from '../../hooks/useFetch'
import { AppError } from '../../lib/errors/AppError'
import { zonesService } from '../zones/zonesService'
import { PlanningFilters } from './PlanningFilters'
import { PlanningResult } from './PlanningResult'
import { planningService } from './planningService'
import { RoadEngineNotice } from './RoadEngineNotice'
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

export function PlanningPage() {
  const zones = useFetch(zonesService.list, 'No se pudieron cargar las zonas')
  const preview = useAsyncAction(loadProposals, 'No se pudo calcular la propuesta de rutas')
  /** Cambia en cada cálculo: el resultado nuevo empieza sin selección ni confirmaciones previas. */
  const [calculation, setCalculation] = useState(0)
  const [lastQuery, setLastQuery] = useState<ProposalsQuery | null>(null)

  const handlePreview = async (query: ProposalsQuery) => {
    setCalculation((count) => count + 1)
    setLastQuery(query)
    await preview.run(query)
  }

  return (
    <main className="page">
      <h1>Planificación de rutas</h1>
      <p className="text-muted">
        Previsualiza cómo se agruparían los pedidos de un día en rutas de hasta 4 paradas. Nada se
        guarda hasta que confirmas las rutas.
      </p>

      <div className="page-stack">
        <section className="card" aria-labelledby="planning-form-title">
          <h2 id="planning-form-title">Previsualizar</h2>
          <RoadEngineNotice />
          <AsyncContent {...zones} onRetry={zones.reload} loadingText="Cargando zonas...">
            {(zoneList) => <PlanningFilters zones={zoneList} onPreview={handlePreview} />}
          </AsyncContent>
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
        {preview.data && <PlanningResult key={calculation} data={preview.data} />}
      </div>
    </main>
  )
}
