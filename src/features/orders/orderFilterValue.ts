import type { OrderStatus } from './types'

export type OrderFiltersValue = {
  /** Día de entrega (aaaa-mm-dd, horario de Guayaquil); vacío = todos. */
  date: string
  status: OrderStatus | ''
}

export const NO_FILTERS: OrderFiltersValue = { date: '', status: '' }
