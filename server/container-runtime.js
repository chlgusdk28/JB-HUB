const DEFAULT_RUNTIME_KIND = 'docker'
const DEFAULT_COMPOSE_COMMAND = ['compose']

const RUNTIME_LABELS = {
  docker: 'Docker Engine',
  nerdctl: 'containerd (nerdctl)',
  podman: 'Podman',
}

function normalizeRuntimeKind(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()

  if (!normalized) {
    return DEFAULT_RUNTIME_KIND
  }

  return normalized
}

function splitCommandArguments(rawValue) {
  const normalized = String(rawValue ?? '').trim()
  if (!normalized) {
    return []
  }

  try {
    const parsed = JSON.parse(normalized)
    if (Array.isArray(parsed)) {
      return parsed.map((entry) => String(entry).trim()).filter(Boolean)
    }
  } catch {
    // Fall back to a simple whitespace split for env values like "compose --namespace foo".
  }

  return normalized.split(/\s+/).map((entry) => entry.trim()).filter(Boolean)
}

function resolveRuntimeLabel(runtimeKind, runtimeBinary) {
  return RUNTIME_LABELS[runtimeKind] ?? `Container runtime (${runtimeBinary})`
}

export function getContainerRuntimeConfig() {
  const runtimeKind = normalizeRuntimeKind(process.env.CONTAINER_RUNTIME_KIND)
  const runtimeBinary =
    String(process.env.CONTAINER_RUNTIME_BIN || process.env.CONTAINER_RUNTIME_BINARY || '').trim() ||
    (runtimeKind === DEFAULT_RUNTIME_KIND ? 'docker' : runtimeKind)
  const composeCommand = splitCommandArguments(process.env.CONTAINER_RUNTIME_COMPOSE_COMMAND)

  return {
    kind: runtimeKind,
    binary: runtimeBinary,
    composeCommand: composeCommand.length > 0 ? composeCommand : DEFAULT_COMPOSE_COMMAND,
    label: resolveRuntimeLabel(runtimeKind, runtimeBinary),
  }
}

export function buildContainerRuntimeInvocation(runtimeConfig, args = []) {
  return {
    command: runtimeConfig.binary,
    args: args.map((entry) => String(entry)),
  }
}

export function buildContainerComposeInvocation(runtimeConfig, args = []) {
  return {
    command: runtimeConfig.binary,
    args: [...runtimeConfig.composeCommand, ...args.map((entry) => String(entry))],
  }
}

export function getContainerRuntimeUnavailableMessage(runtimeConfig) {
  return runtimeConfig.kind === 'docker' ? 'Docker engine is unavailable.' : 'Container runtime is unavailable.'
}

export function extractContainerRuntimeVersion(output) {
  const text = String(output ?? '').trim()
  if (!text) {
    return null
  }

  const lines = text.split(/\r?\n/)
  let inServerSection = false

  for (const line of lines) {
    if (/^\s*server\b/i.test(line)) {
      inServerSection = true
      continue
    }

    if (/^\s*client\b/i.test(line)) {
      inServerSection = false
      continue
    }

    const versionMatch = line.match(/^\s*version:\s*([^\s]+)/i)
    if (versionMatch && inServerSection) {
      return versionMatch[1]
    }
  }

  const serverVersionMatch = text.match(/server version:\s*([^\s]+)/i)
  if (serverVersionMatch) {
    return serverVersionMatch[1]
  }

  const versionMatch = text.match(/version:\s*([^\s]+)/i)
  return versionMatch ? versionMatch[1] : null
}
