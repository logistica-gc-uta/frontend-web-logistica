import { paths } from './paths'

export interface NavItem {
  label: string
  to: string
}

/** Opciones del menú principal. Agregar aquí cada nuevo módulo administrativo. */
export const navItems: readonly NavItem[] = [
  { label: 'Inicio', to: paths.home },
  { label: 'Zonas', to: paths.zones },
]
