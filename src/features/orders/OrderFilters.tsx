import { Button } from '../../components/ui/Button'
import { SelectField } from '../../components/ui/SelectField'
import { TextField } from '../../components/ui/TextField'
import type { Zone } from '../zones/types'
import { NO_FILTERS, type OrderFiltersValue } from './orderFilterValue'
import { ORDER_STATUS_LABELS } from './orderLabels'
import { ORDER_STATUSES, type OrderStatus } from './types'

interface OrderFiltersProps {
  value: OrderFiltersValue
  zones: Zone[]
  onChange: (value: OrderFiltersValue) => void
}

export function OrderFilters({ value, zones, onChange }: OrderFiltersProps) {
  const hasFilters = value.date !== '' || value.zoneId !== '' || value.status !== ''

  return (
    <form className="filters" aria-label="Filtros de pedidos" onSubmit={(e) => e.preventDefault()}>
      <TextField
        label="Fecha de entrega"
        type="date"
        value={value.date}
        onChange={(event) => onChange({ ...value, date: event.target.value })}
      />
      <SelectField
        label="Zona"
        value={value.zoneId}
        onChange={(event) => onChange({ ...value, zoneId: event.target.value })}
      >
        <option value="">Todas</option>
        {zones.map((zone) => (
          <option key={zone.id} value={zone.id}>
            {`${zone.code} · ${zone.name}`}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Estado"
        value={value.status}
        onChange={(event) => onChange({ ...value, status: event.target.value as OrderStatus | '' })}
      >
        <option value="">Todos</option>
        {ORDER_STATUSES.map((status) => (
          <option key={status} value={status}>
            {ORDER_STATUS_LABELS[status]}
          </option>
        ))}
      </SelectField>
      <Button variant="secondary" disabled={!hasFilters} onClick={() => onChange(NO_FILTERS)}>
        Limpiar filtros
      </Button>
    </form>
  )
}
