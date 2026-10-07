import { useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { AsyncContent } from '../../components/ui/AsyncContent'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { useFetch } from '../../hooks/useFetch'
import { formatDate } from '../../lib/format/formatDate'
import type { Zone } from './types'
import { ZoneForm } from './ZoneForm'
import { zonesService } from './zonesService'

const COLUMNS: Column<Zone>[] = [
  { header: 'Código', render: (zone) => zone.code },
  { header: 'Nombre', render: (zone) => zone.name },
  { header: 'Fecha de creación', render: (zone) => formatDate(zone.createdAt) },
]

export function ZonesPage() {
  const zones = useFetch(zonesService.list, 'No se pudieron cargar las zonas')
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const handleCreated = (zone: Zone) => {
    setSuccessMessage(`Zona "${zone.name}" creada correctamente`)
    zones.reload()
  }

  return (
    <main className="page">
      <h1>Zonas de entrega</h1>
      <p className="text-muted">Define las zonas de la ciudad para agrupar los pedidos cercanos.</p>

      <div className="page-grid">
        <section className="card" aria-labelledby="zone-form-title">
          <h2 id="zone-form-title">Nueva zona</h2>
          {successMessage && <Alert variant="success">{successMessage}</Alert>}
          <ZoneForm onCreated={handleCreated} />
        </section>

        <section className="card" aria-labelledby="zone-list-title">
          <h2 id="zone-list-title">Zonas registradas</h2>
          <AsyncContent {...zones} onRetry={zones.reload} loadingText="Cargando zonas...">
            {(data) => (
              <DataTable
                caption="Zonas de entrega registradas"
                columns={COLUMNS}
                rows={data}
                getRowKey={(zone) => zone.id}
                emptyMessage="Aún no hay zonas registradas"
              />
            )}
          </AsyncContent>
        </section>
      </div>
    </main>
  )
}
