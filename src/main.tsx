import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from './app/App'
import { AuthProvider } from './features/auth/AuthProvider'
// Fuentes servidas desde el propio proyecto: IBM Plex Sans (panel), Figtree y Young Serif (Shop).
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-sans/700.css'
import '@fontsource-variable/figtree'
import '@fontsource/young-serif'
import './index.css'
import './styles/planning.css'
import './styles/dispatch.css'
import './styles/monitor.css'
import './styles/incidents.css'
import './styles/shop.css'
import './styles/catalog.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
