/** Rutas de la aplicación. Usar siempre estas constantes en lugar de strings sueltos. */
export const paths = {
  home: '/',
  login: '/login',
  orders: '/pedidos',
  planning: '/planificacion',
  urgencies: '/urgencias',
  failedDeliveries: '/entregas-fallidas',
  monitor: '/seguimiento',
  zones: '/zonas',
  products: '/productos',
  shop: '/shop',
  shopCatalog: '/shop/catalogo',
  shopProduct: '/shop/productos/:id',
} as const

/** Detalle de un regalo del Shop. */
export const shopProductPath = (id: string): string =>
  paths.shopProduct.replace(':id', encodeURIComponent(id))
