const CHUNK_RELOAD_MARKER_KEY = 'jb-hub:chunk-reload-at'
const CHUNK_RELOAD_COOLDOWN_MS = 15_000

function readErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error
  }

  if (error && typeof error === 'object') {
    const maybeMessage = 'message' in error ? error.message : null
    if (typeof maybeMessage === 'string') {
      return maybeMessage
    }

    const maybeReason = 'reason' in error ? error.reason : null
    if (typeof maybeReason === 'string') {
      return maybeReason
    }
  }

  return ''
}

function hasRecentReloadAttempt() {
  if (typeof window === 'undefined') {
    return false
  }

  const rawValue = window.sessionStorage.getItem(CHUNK_RELOAD_MARKER_KEY)
  const previousTimestamp = Number.parseInt(String(rawValue ?? ''), 10)
  return Number.isFinite(previousTimestamp) && Date.now() - previousTimestamp < CHUNK_RELOAD_COOLDOWN_MS
}

export function isRecoverableChunkError(error: unknown) {
  const message = readErrorMessage(error).toLowerCase()
  if (!message) {
    return false
  }

  return (
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('importing a module script failed') ||
    message.includes('dynamically imported module') ||
    message.includes('chunkloaderror') ||
    (message.includes('loading chunk') && message.includes('failed'))
  )
}

export function reloadForRecoverableChunkError(error: unknown) {
  if (typeof window === 'undefined' || !isRecoverableChunkError(error) || hasRecentReloadAttempt()) {
    return false
  }

  window.sessionStorage.setItem(CHUNK_RELOAD_MARKER_KEY, String(Date.now()))
  window.location.reload()
  return true
}

export function installChunkRecoveryHandlers() {
  if (typeof window === 'undefined') {
    return
  }

  window.addEventListener('error', (event) => {
    reloadForRecoverableChunkError(event.error ?? event.message)
  })

  window.addEventListener('unhandledrejection', (event) => {
    reloadForRecoverableChunkError(event.reason)
  })
}
