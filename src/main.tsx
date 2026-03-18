import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App'
import { ErrorBoundary } from './app/components/ErrorBoundary'
import { installChunkRecoveryHandlers } from './app/lib/chunk-recovery'
import { ToastProvider } from './app/components/ToastProvider'
import './styles/index.css'

// Optional API origin rewrite for preview/static runs.
// When VITE_API_BASE_URL is set, all relative /api requests are routed to that origin.
const configuredApiBase = String(import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')
if (configuredApiBase && typeof window !== 'undefined') {
  const originalFetch = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const isStringInput = typeof input === 'string'
    const rawUrl = isStringInput ? input : input instanceof URL ? input.toString() : input.url
    if (!rawUrl.startsWith('/api')) {
      return originalFetch(input, init)
    }

    const nextUrl = `${configuredApiBase}${rawUrl}`
    if (isStringInput || input instanceof URL) {
      return originalFetch(nextUrl, init)
    }
    return originalFetch(new Request(nextUrl, input), init)
  }
}

installChunkRecoveryHandlers()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
