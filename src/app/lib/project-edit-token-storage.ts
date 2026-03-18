const PROJECT_EDIT_TOKEN_STORAGE_KEY = 'jbhub:project-edit-tokens'

type ProjectEditTokenMap = Record<string, string>

function readProjectEditTokenMap(): ProjectEditTokenMap {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const raw = window.localStorage.getItem(PROJECT_EDIT_TOKEN_STORAGE_KEY)
    if (!raw) {
      return {}
    }

    const parsed = JSON.parse(raw) as ProjectEditTokenMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeProjectEditTokenMap(tokens: ProjectEditTokenMap) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    if (Object.keys(tokens).length === 0) {
      window.localStorage.removeItem(PROJECT_EDIT_TOKEN_STORAGE_KEY)
      return
    }

    window.localStorage.setItem(PROJECT_EDIT_TOKEN_STORAGE_KEY, JSON.stringify(tokens))
  } catch {
    // Ignore storage failures so project browsing still works in private mode.
  }
}

export function persistProjectEditToken(projectId: number, token: string | null) {
  if (!Number.isFinite(projectId) || projectId <= 0) {
    return
  }

  const tokens = readProjectEditTokenMap()
  const storageKey = String(projectId)

  if (typeof token === 'string' && token.trim()) {
    tokens[storageKey] = token.trim()
  } else {
    delete tokens[storageKey]
  }

  writeProjectEditTokenMap(tokens)
}

export function readProjectEditToken(projectId: number) {
  if (!Number.isFinite(projectId) || projectId <= 0) {
    return null
  }

  const tokens = readProjectEditTokenMap()
  const token = tokens[String(projectId)]
  return typeof token === 'string' && token.trim() ? token.trim() : null
}

export function createProjectEditHeaders(projectId: number) {
  const token = readProjectEditToken(projectId)
  return token ? { 'x-jb-project-edit-token': token } : {}
}
