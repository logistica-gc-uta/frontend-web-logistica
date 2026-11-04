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
  productNew: '/productos/nuevo',
  productEdit: '/productos/:id',
  categories: '/categorias',
  shopSettings: '/configuracion-shop',
  shop: '/shop',
  shopCatalog: '/shop/catalogo',
  shopProduct: '/shop/productos/:id',
  shopLogin: '/shop/login',
  shopRegister: '/shop/registro',
  shopCart: '/shop/carrito',
  shopCheckout: '/shop/checkout',
  shopPayment: '/shop/pago',
  shopConfirmation: '/shop/confirmacion/:id',
  shopOrders: '/shop/mis-pedidos',
  shopOrder: '/shop/mis-pedidos/:id',
  shopReceipt: '/shop/mis-pedidos/:id/comprobante',
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
