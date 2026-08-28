import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyTheme, loadTheme } from '@/lib/theme'
import './index.css'
import App from './App.tsx'

applyTheme(loadTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
