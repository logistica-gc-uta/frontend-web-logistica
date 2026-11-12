/** Rutas de la aplicación. Usar siempre estas constantes en lugar de strings sueltos. */
export const paths = {
  home: '/admin',
  login: '/admin/login',
  orders: '/admin/pedidos',
  orderReceipt: '/admin/pedidos/:id/comprobante',
  planning: '/admin/planificacion',
  urgencies: '/admin/urgencias',
  drivers: '/admin/repartidores',
  failedDeliveries: '/admin/entregas-fallidas',
  monitor: '/admin/seguimiento',
  zones: '/admin/zonas',
  storeCoverage: '/admin/cobertura',
  products: '/admin/productos',
  productNew: '/admin/productos/nuevo',
  productEdit: '/admin/productos/:id',
  categories: '/admin/categorias',
  shopSettings: '/admin/configuracion-shop',
  shop: '/',
  shopCatalog: '/catalogo',
  shopProduct: '/productos/:id',
  shopLogin: '/ingresar',
  shopRegister: '/registro',
  shopCart: '/carrito',
  shopCheckout: '/checkout',
  shopPayment: '/checkout/pago',
  shopConfirmation: '/checkout/confirmacion/:id',
  shopAccount: '/mi-cuenta',
  shopOrders: '/mi-cuenta/pedidos',
  shopOrder: '/mi-cuenta/pedidos/:id',
  shopReceipt: '/mi-cuenta/pedidos/:id/comprobante',
} as const

const withId = (path: string, id: string) => path.replace(':id', encodeURIComponent(id))

/** Detalle de un regalo del Shop. */
export const shopProductPath = (id: string): string => withId(paths.shopProduct, id)

/** Confirmación de una compra del Shop. */
export const shopConfirmationPath = (orderId: string): string =>
  withId(paths.shopConfirmation, orderId)

/** Detalle y seguimiento de un pedido del cliente. */
export const shopOrderPath = (orderId: string): string => withId(paths.shopOrder, orderId)

/** Comprobante simulado de un pedido del cliente. */
export const shopReceiptPath = (orderId: string): string => withId(paths.shopReceipt, orderId)

/** Edición de un producto del catálogo (panel ADMIN). */
export const productEditPath = (productId: string): string => withId(paths.productEdit, productId)

/** Comprobante imprimible y contacto de un pedido (panel ADMIN). */
export const orderReceiptPath = (orderId: string): string => withId(paths.orderReceipt, orderId)
