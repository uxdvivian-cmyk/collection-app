import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { seedDefaults } from './db'
import { initAutoSync } from './lib/sync'
import { applyTheme, getTheme } from './theme'
import './styles.css'

applyTheme(getTheme())
seedDefaults()
initAutoSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
