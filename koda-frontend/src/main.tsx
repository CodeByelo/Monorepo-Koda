import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import App from './App'
import ErrorBoundary from './components/common/ErrorBoundary'
import './index.css'

// Auto-recarga automática cuando Vercel despliega una versión nueva
// y el navegador intenta cargar un chunk con hash viejo (Failed to fetch dynamically imported module)
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  window.location.reload();
});

window.addEventListener('error', (event) => {
  if (
    event?.message && (
      event.message.includes('Failed to fetch dynamically imported module') ||
      event.message.includes('Importing a module script failed') ||
      event.message.includes('Expected a JavaScript-or-Wasm module script')
    )
  ) {
    window.location.reload();
  }
});


ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
