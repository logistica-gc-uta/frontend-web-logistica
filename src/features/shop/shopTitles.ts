import { paths } from '../../app/paths'

export function shopDocumentTitle(pathname: string): string {
  if (pathname === '/' || pathname === '') return 'REGALÍA · El arte de tener un detalle'
  if (pathname.startsWith(paths.shopCatalog)) return 'Catálogo · REGALÍA'
  if (pathname.startsWith('/productos/')) return 'Regalo · REGALÍA'
  if (pathname.startsWith(paths.shopCart)) return 'Carrito · REGALÍA'
  if (pathname.startsWith(paths.shopPayment) || pathname.startsWith('/checkout/confirmacion')) {
    return 'Checkout · REGALÍA'
  }
  if (pathname.startsWith(paths.shopCheckout)) return 'Checkout · REGALÍA'
  if (pathname.startsWith(paths.shopLogin)) return 'Ingresar · REGALÍA'
  if (pathname.startsWith(paths.shopRegister)) return 'Crear cuenta · REGALÍA'
  if (pathname.startsWith(paths.shopAccount)) return 'Mi cuenta · REGALÍA'
  return 'REGALÍA'
}
