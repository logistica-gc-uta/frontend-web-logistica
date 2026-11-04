import { paths } from './paths'

export interface NavItem {
  label: string
  to: string
}

/** Opciones del menú principal. Agregar aquí cada nuevo módulo administrativo. */
export const navItems: readonly NavItem[] = [
  { label: 'Inicio', to: paths.home },
  { label: 'Pedidos', to: paths.orders },
  { label: 'Planificación', to: paths.planning },
  { label: 'Urgencias', to: paths.urgencies },
  { label: 'Entregas fallidas', to: paths.failedDeliveries },
  { label: 'Seguimiento', to: paths.monitor },
  { label: 'Zonas', to: paths.zones },
  { label: 'Productos', to: paths.products },
  { label: 'Categorías', to: paths.categories },
  { label: 'Configuración Shop', to: paths.shopSettings },
]
