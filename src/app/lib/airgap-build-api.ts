import { getApiBase } from './api-base'

const API_BASE = getApiBase('/api/v1')
const BUILD_REQUEST_TIMEOUT_MS = 30 * 60 * 1000

export interface AirgapPolicyFinding {
  ruleId: string
  severity: 'BLOCK' | 'WARN'
  lineNumber: number | null
  line: string | null
  message: string
}

export interface AirgapPolicyReport {
  findings: AirgapPolicyFinding[]
  blocked: boolean
  summary: {
    blockCount: number
    warnCount: number
    stageCount: number
    baseImages: string[]
    exposedPorts: number[]
    finalStageUser: string | null
  }
}

export interface AirgapBuild {
  id: string
  projectId: number
  requesterName: string
  requesterRole: string
  status: string
  imageName: string
  tag: string
  buildArgs: Record<string, string>
  platform: string
  description: string
  dockerfileHash: string
  contextSize: number
  imageDigest: string | null
  imageSize: number | null
  durationSec: number | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  startedAt: string | null
  completedAt: string | null
  dockerfilePath: string
  files: Array<{ path: string; size: number }>
  policyReport: AirgapPolicyReport
  scanResultId: string | null
  duplicateOfBuildId: string | null
  cancelRequested: boolean
}

export interface AirgapBuildLogEntry {
  buildId: string
  timestamp: string
  stream: string
  line: string
  step: number | null
  totalSteps: number | null
}

export interface AirgapScanResult {
  id: string
  buildId: string
  scanner: string
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  scannedAt: string
  passed: boolean
  report: {
    summary: {
      criticalCount: number
      highCount: number
      mediumCount: number
      lowCount: number
    }
    heuristics: string[]
  }
}

export interface AirgapBaseImage {
  id: number
  imageRef: string
  description: string
  active: boolean
  addedBy: string
  addedAt: string
}

export interface AirgapBuildCreateInput {
  projectId: number
  imageName: string
  tag: string
  platform: string
  description: string
  buildArgs: Record<string, string>
  dockerfileContent?: string
  dockerfileFile?: File | null
  contextFiles?: File[]
}

async function extractApiError(response: Response, fallbackMessage: string) {
  try {
    const payload = (await response.json()) as { error?: unknown }
    if (typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error
    }
  } catch {
    // Ignore invalid JSON error payloads.
  }

  return fallbackMessage
}

function withActorHeaders(currentUserName: string) {
  return {
    'x-jb-user-name': currentUserName,
  }
}

function getRelativePath(file: File) {
  const entry = file as File & { webkitRelativePath?: string }
  return entry.webkitRelativePath?.trim() || file.name
}

function createMultipartBuildRequest(input: AirgapBuildCreateInput) {
  const formData = new FormData()
  formData.append(
    'metadata',
    JSON.stringify({
      projectId: input.projectId,
      imageName: input.imageName,
      tag: input.tag,
      platform: input.platform,
      description: input.description,
      buildArgs: input.buildArgs,
    }),
  )

  if (input.dockerfileFile) {
    formData.append('dockerfile', input.dockerfileFile, input.dockerfileFile.name || 'Dockerfile')
  } else if (typeof input.dockerfileContent === 'string') {
    formData.append('dockerfileContent', input.dockerfileContent)
  }

  if (Array.isArray(input.contextFiles) && input.contextFiles.length > 0) {
    for (const file of input.contextFiles) {
      formData.append('files', file)
    }
    formData.append('relativePaths', JSON.stringify(input.contextFiles.map((file) => getRelativePath(file))))
  }

  return formData
}

function xhrRequest<T>(url: string, formData: FormData, currentUserName: string) {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.responseType = 'text'
    xhr.timeout = BUILD_REQUEST_TIMEOUT_MS
    xhr.setRequestHeader('x-jb-user-name', currentUserName)

    xhr.onerror = () => reject(new Error('The build request could not reach the API.'))
    xhr.ontimeout = () => reject(new Error('The build request timed out.'))

    xhr.onload = () => {
      const responseText = typeof xhr.responseText === 'string' ? xhr.responseText : ''
      if (xhr.status < 200 || xhr.status >= 300) {
        try {
          const payload = JSON.parse(responseText) as { error?: unknown }
          reject(new Error(typeof payload.error === 'string' ? payload.error : `Build request failed (${xhr.status}).`))
        } catch {
          reject(new Error(responseText.trim() || `Build request failed (${xhr.status}).`))
        }
        return
      }

      try {
        resolve(JSON.parse(responseText) as T)
      } catch {
        reject(new Error('The build response could not be parsed.'))
      }
    }

    xhr.send(formData)
  })
}

export async function fetchAirgapBuilds(projectId: number) {
  const response = await fetch(`${API_BASE}/builds?projectId=${projectId}`)
  if (!response.ok) {
    throw new Error(await extractApiError(response, `Failed to fetch builds (${response.status}).`))
  }

  return (await response.json()) as { builds: AirgapBuild[] }
}

export async function fetchAirgapBuild(buildId: string) {
  const response = await fetch(`${API_BASE}/builds/${encodeURIComponent(buildId)}`)
  if (!response.ok) {
    throw new Error(await extractApiError(response, `Failed to fetch build details (${response.status}).`))
  }

  return (await response.json()) as { build: AirgapBuild; scanResult: AirgapScanResult | null }
}

export async function fetchAirgapBuildLogs(buildId: string) {
  const response = await fetch(`${API_BASE}/builds/${encodeURIComponent(buildId)}/logs`)
  if (!response.ok) {
    throw new Error(await extractApiError(response, `Failed to fetch build logs (${response.status}).`))
  }

  return (await response.json()) as { build: AirgapBuild; logs: AirgapBuildLogEntry[] }
}

export async function fetchAirgapBaseImages() {
  const response = await fetch(`${API_BASE}/policies/base-images`)
  if (!response.ok) {
    throw new Error(await extractApiError(response, `Failed to fetch allowed base images (${response.status}).`))
  }

  return (await response.json()) as { baseImages: AirgapBaseImage[] }
}

export async function createAirgapBuild(input: AirgapBuildCreateInput, currentUserName: string) {
  return await xhrRequest<{ build: AirgapBuild; scanResult: AirgapScanResult | null; duplicateOfBuildId: string | null }>(
    `${API_BASE}/builds`,
    createMultipartBuildRequest(input),
    currentUserName,
  )
}

export async function retryAirgapBuild(buildId: string, currentUserName: string) {
  const response = await fetch(`${API_BASE}/builds/${encodeURIComponent(buildId)}/retry`, {
    method: 'POST',
    headers: withActorHeaders(currentUserName),
  })
  if (!response.ok) {
    throw new Error(await extractApiError(response, `Failed to retry build (${response.status}).`))
  }

  return (await response.json()) as { build: AirgapBuild }
}

export async function cancelAirgapBuild(buildId: string, currentUserName: string) {
  const response = await fetch(`${API_BASE}/builds/${encodeURIComponent(buildId)}/cancel`, {
    method: 'POST',
    headers: withActorHeaders(currentUserName),
  })
  if (!response.ok) {
    throw new Error(await extractApiError(response, `Failed to cancel build (${response.status}).`))
  }

  return (await response.json()) as { build: AirgapBuild }
}
