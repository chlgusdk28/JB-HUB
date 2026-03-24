import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App'
import { ErrorBoundary } from './app/components/ErrorBoundary'
import { installChunkRecoveryHandlers } from './app/lib/chunk-recovery'
import { ToastProvider } from './app/components/ToastProvider'
import { resolveApiUrl } from './app/lib/api-base'
import './styles/index.css'

// Route relative API calls to the active local API origin when preview/dev runs on a different port.
if (typeof window !== 'undefined') {
  const originalFetch = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const isStringInput = typeof input === 'string'
    const rawUrl = isStringInput ? input : input instanceof URL ? input.toString() : input.url
    if (!rawUrl.startsWith('/api')) {
      return originalFetch(input, init)
    }

    const nextUrl = resolveApiUrl(rawUrl)
    if (isStringInput || input instanceof URL) {
      return originalFetch(nextUrl, init)
    }

    if (nextUrl === rawUrl) {
      return originalFetch(input, init)
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
