import { Navigate, Route, Routes, useLocation, useParams } from 'react-router'
import { AppLayout } from '../components/layout/AppLayout'
import { LoginPage } from '../features/auth/LoginPage'
import { ProtectedRoute } from '../features/auth/ProtectedRoute'
import { OrdersPage } from '../features/orders/OrdersPage'
import { PlanningPage } from '../features/planning/PlanningPage'
import { UrgenciesPage } from '../features/dispatch/UrgenciesPage'
import { FailedDeliveriesPage } from '../features/incidents/FailedDeliveriesPage'
import { MonitorPage } from '../features/monitor/MonitorPage'
import { CatalogProductsPage } from '../features/catalog/CatalogProductsPage'
import { CategoriesPage } from '../features/catalog/CategoriesPage'
import { ProductEditorPage } from '../features/catalog/ProductEditorPage'
import { ShopSettingsPage } from '../features/catalog/ShopSettingsPage'
import { RequireCustomer } from '../features/shop/account/RequireCustomer'
import { ShopAccountPage } from '../features/shop/account/ShopAccountPage'
import { ShopLoginPage } from '../features/shop/account/ShopLoginPage'
import { ShopRegisterPage } from '../features/shop/account/ShopRegisterPage'
import { CartPage } from '../features/shop/cart/CartPage'
import { CheckoutPage } from '../features/shop/checkout/CheckoutPage'
import { PaymentPage } from '../features/shop/checkout/PaymentPage'
import {
  ConfirmationPage,
  MyOrdersPage,
  OrderDetailPage,
  ReceiptPage,
} from '../features/shop/orders/OrderPages'
import { ShopLayout } from '../features/shop/components/ShopLayout'
import { CatalogPage } from '../features/shop/pages/CatalogPage'
import { ProductDetailPage } from '../features/shop/pages/ProductDetailPage'
import { ShopHomePage } from '../features/shop/pages/ShopHomePage'
import { ShopNotFoundPage } from '../features/shop/pages/ShopNotFoundPage'
import { ZonesPage } from '../features/zones/ZonesPage'
import { HomePage } from '../pages/HomePage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { paths, shopConfirmationPath, shopOrderPath, shopProductPath, shopReceiptPath } from './paths'

function KeepSearch({ to }: { to: string }) {
  const { search } = useLocation()
  return <Navigate to={`${to}${search}`} replace />
}

function ShopProductRedirect() {
  const { id = '' } = useParams()
  const { search } = useLocation()
  return <Navigate to={`${shopProductPath(id)}${search}`} replace />
}

function ShopConfirmationRedirect() {
  const { id = '' } = useParams()
  return <Navigate to={shopConfirmationPath(id)} replace />
}

function ShopOrderRedirect() {
  const { id = '' } = useParams()
  return <Navigate to={shopOrderPath(id)} replace />
}

function ShopReceiptRedirect() {
  const { id = '' } = useParams()
  return <Navigate to={shopReceiptPath(id)} replace />
}

export function App() {
  return (
    <Routes>
      <Route path="/shop" element={<KeepSearch to={paths.shop} />} />
      <Route path="/shop/catalogo" element={<KeepSearch to={paths.shopCatalog} />} />
      <Route path="/shop/productos/:id" element={<ShopProductRedirect />} />
      <Route path="/shop/login" element={<KeepSearch to={paths.shopLogin} />} />
      <Route path="/shop/registro" element={<KeepSearch to={paths.shopRegister} />} />
      <Route path="/shop/carrito" element={<KeepSearch to={paths.shopCart} />} />
      <Route path="/shop/checkout" element={<KeepSearch to={paths.shopCheckout} />} />
      <Route path="/shop/pago" element={<KeepSearch to={paths.shopPayment} />} />
      <Route path="/shop/confirmacion/:id" element={<ShopConfirmationRedirect />} />
      <Route path="/shop/mis-pedidos" element={<KeepSearch to={paths.shopOrders} />} />
      <Route path="/shop/mis-pedidos/:id" element={<ShopOrderRedirect />} />
      <Route path="/shop/mis-pedidos/:id/comprobante" element={<ShopReceiptRedirect />} />
      <Route path="/login" element={<KeepSearch to={paths.login} />} />
      <Route path="/pedidos" element={<KeepSearch to={paths.orders} />} />
      <Route path="/planificacion" element={<KeepSearch to={paths.planning} />} />
      <Route path="/urgencias" element={<KeepSearch to={paths.urgencies} />} />
      <Route path="/entregas-fallidas" element={<KeepSearch to={paths.failedDeliveries} />} />
      <Route path="/seguimiento" element={<KeepSearch to={paths.monitor} />} />
      <Route path="/zonas" element={<KeepSearch to={paths.zones} />} />
      <Route path="/categorias" element={<KeepSearch to={paths.categories} />} />
      <Route path="/configuracion-shop" element={<KeepSearch to={paths.shopSettings} />} />
      <Route path="/productos" element={<KeepSearch to={paths.products} />} />
      <Route path="/productos/nuevo" element={<KeepSearch to={paths.productNew} />} />
      <Route path={paths.login} element={<LoginPage />} />
      <Route element={<ShopLayout />}>
        <Route path={paths.shop} element={<ShopHomePage />} />
        <Route path={paths.shopCatalog} element={<CatalogPage />} />
        <Route path={paths.shopProduct} element={<ProductDetailPage />} />
        <Route path={paths.shopLogin} element={<ShopLoginPage />} />
        <Route path={paths.shopRegister} element={<ShopRegisterPage />} />
        <Route path={paths.shopCart} element={<CartPage />} />
        <Route element={<RequireCustomer />}>
          <Route path={paths.shopAccount} element={<ShopAccountPage />} />
          <Route path={paths.shopCheckout} element={<CheckoutPage />} />
          <Route path={paths.shopPayment} element={<PaymentPage />} />
          <Route path={paths.shopConfirmation} element={<ConfirmationPage />} />
          <Route path={paths.shopOrders} element={<MyOrdersPage />} />
          <Route path={paths.shopOrder} element={<OrderDetailPage />} />
          <Route path={paths.shopReceipt} element={<ReceiptPage />} />
        </Route>
        <Route path="*" element={<ShopNotFoundPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path={paths.home} element={<HomePage />} />
          <Route path={paths.orders} element={<OrdersPage />} />
          <Route path={paths.planning} element={<PlanningPage />} />
          <Route path={paths.urgencies} element={<UrgenciesPage />} />
          <Route path={paths.failedDeliveries} element={<FailedDeliveriesPage />} />
          <Route path={paths.monitor} element={<MonitorPage />} />
          <Route path={paths.zones} element={<ZonesPage />} />
          <Route path={paths.products} element={<CatalogProductsPage />} />
          <Route path={paths.productNew} element={<ProductEditorPage />} />
          <Route path={paths.productEdit} element={<ProductEditorPage />} />
          <Route path={paths.categories} element={<CategoriesPage />} />
          <Route path={paths.shopSettings} element={<ShopSettingsPage />} />
          <Route path="/admin/*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
