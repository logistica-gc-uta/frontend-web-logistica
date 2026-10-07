import { useState } from 'react'
import { ResourcePage } from '../../components/layout/ResourcePage'
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
    <ResourcePage
      title="Zonas de entrega"
      description="Define las zonas de la ciudad para agrupar los pedidos cercanos."
      formTitle="Nueva zona"
      form={<ZoneForm onCreated={handleCreated} />}
      listTitle="Zonas registradas"
      successMessage={successMessage}
    >
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
    </ResourcePage>
  )
}
