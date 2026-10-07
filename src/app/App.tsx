import { Route, Routes } from 'react-router'
import { HomePage } from '../pages/HomePage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { paths } from './paths'

export function App() {
  return (
    <Routes>
      <Route path={paths.home} element={<HomePage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
