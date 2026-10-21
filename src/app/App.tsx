import { Route, Routes } from 'react-router'
import { AppLayout } from '../components/layout/AppLayout'
import { LoginPage } from '../features/auth/LoginPage'
import { ProtectedRoute } from '../features/auth/ProtectedRoute'
import { OrdersPage } from '../features/orders/OrdersPage'
import { PlanningPage } from '../features/planning/PlanningPage'
import { UrgenciesPage } from '../features/dispatch/UrgenciesPage'
import { ProductsPage } from '../features/products/ProductsPage'
import { ZonesPage } from '../features/zones/ZonesPage'
import { HomePage } from '../pages/HomePage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { paths } from './paths'

export function App() {
  return (
    <Routes>
      <Route path={paths.login} element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path={paths.home} element={<HomePage />} />
          <Route path={paths.orders} element={<OrdersPage />} />
          <Route path={paths.planning} element={<PlanningPage />} />
          <Route path={paths.urgencies} element={<UrgenciesPage />} />
          <Route path={paths.zones} element={<ZonesPage />} />
          <Route path={paths.products} element={<ProductsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
