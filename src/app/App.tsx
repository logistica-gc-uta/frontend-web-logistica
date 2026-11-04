import { Route, Routes } from 'react-router'
import { AppLayout } from '../components/layout/AppLayout'
import { LoginPage } from '../features/auth/LoginPage'
import { ProtectedRoute } from '../features/auth/ProtectedRoute'
import { OrdersPage } from '../features/orders/OrdersPage'
import { PlanningPage } from '../features/planning/PlanningPage'
import { UrgenciesPage } from '../features/dispatch/UrgenciesPage'
import { FailedDeliveriesPage } from '../features/incidents/FailedDeliveriesPage'
import { MonitorPage } from '../features/monitor/MonitorPage'
import { ProductsPage } from '../features/products/ProductsPage'
import { ShopLayout } from '../features/shop/components/ShopLayout'
import { CatalogPage } from '../features/shop/pages/CatalogPage'
import { ProductDetailPage } from '../features/shop/pages/ProductDetailPage'
import { ShopHomePage } from '../features/shop/pages/ShopHomePage'
import { ZonesPage } from '../features/zones/ZonesPage'
import { HomePage } from '../pages/HomePage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { paths } from './paths'

export function App() {
  return (
    <Routes>
      <Route path={paths.login} element={<LoginPage />} />
      {/* Tienda pública: sin sesión y separada del panel administrativo. */}
      <Route element={<ShopLayout />}>
        <Route path={paths.shop} element={<ShopHomePage />} />
        <Route path={paths.shopCatalog} element={<CatalogPage />} />
        <Route path={paths.shopProduct} element={<ProductDetailPage />} />
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
          <Route path={paths.products} element={<ProductsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
