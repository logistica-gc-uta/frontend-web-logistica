import { paths } from './paths'

export interface NavItem {
  label: string
  to: string
}

export interface NavGroup {
  title: string
  items: readonly NavItem[]
}

/**
 * Menú principal agrupado por flujo de trabajo. Agregar aquí cada nuevo módulo administrativo,
 * dentro del grupo al que pertenece.
 */
export const navGroups: readonly NavGroup[] = [
  {
    title: 'Operación',
    items: [
      { label: 'Inicio', to: paths.home },
      { label: 'Pedidos', to: paths.orders },
      { label: 'Planificación', to: paths.planning },
      { label: 'Urgencias', to: paths.urgencies },
      { label: 'Entregas fallidas', to: paths.failedDeliveries },
      { label: 'Seguimiento', to: paths.monitor },
      { label: 'Repartidores', to: paths.drivers },
      { label: 'Emergencias', to: paths.emergencies },
    ],
  },
  {
    title: 'Territorio',
    items: [
      { label: 'Tienda y cobertura', to: paths.storeCoverage },
      { label: 'Zonas', to: paths.zones },
    ],
  },
  {
    title: 'Tienda',
    items: [
      { label: 'Productos', to: paths.products },
      { label: 'Categorías', to: paths.categories },
      { label: 'Configuración Shop', to: paths.shopSettings },
    ],
  },
]

/** Todas las opciones del menú, en orden. */
export const navItems: readonly NavItem[] = navGroups.flatMap((group) => group.items)
