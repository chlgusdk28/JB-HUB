function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '')
}

function isPrivateIpv4Host(hostname: string) {
  if (/^10\./.test(hostname)) {
    return true
  }

  if (/^192\.168\./.test(hostname)) {
    return true
  }

  const match = hostname.match(/^172\.(\d{1,3})\./)
  if (!match) {
    return false
  }

  const secondOctet = Number.parseInt(match[1], 10)
  return Number.isFinite(secondOctet) && secondOctet >= 16 && secondOctet <= 31
}

function isLoopbackHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]'
}

function isLocalRuntimeHost(hostname: string) {
  const normalized = hostname.trim().toLowerCase()
  if (!normalized) {
    return false
  }

  return isLoopbackHost(normalized) || isPrivateIpv4Host(normalized) || normalized.endsWith('.local')
}

export function getConfiguredApiOrigin() {
  return normalizeBaseUrl(String(import.meta.env.VITE_API_BASE_URL ?? ''))
}

export function getLocalApiOrigin() {
  if (typeof window === 'undefined') {
    return ''
  }

  const { protocol, hostname, port } = window.location
  if (!/^https?:$/i.test(protocol) || !isLocalRuntimeHost(hostname)) {
    return ''
  }

  // Keep same-origin deployments untouched. Use direct API origin only for local preview/dev ports.
  if (!port || port === '8787') {
    return ''
  }

  return `${protocol}//${hostname}:8787`
}

export function getApiOrigin() {
  return getConfiguredApiOrigin() || getLocalApiOrigin()
}

export function resolveApiUrl(input: string) {
  if (!input.startsWith('/api')) {
    return input
  }

  const origin = getApiOrigin()
  return origin ? `${origin}${input}` : input
}

export function getApiBase(basePath = '/api/v1') {
  return resolveApiUrl(basePath)
}
