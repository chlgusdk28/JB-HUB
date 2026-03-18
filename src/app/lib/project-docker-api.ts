import { createProjectEditHeaders } from './project-edit-token-storage'

const API_BASE = '/api/v1'

export interface ProjectDockerImage {
  id: number
  projectId: number
  uploaderName: string
  originalFileName: string
  tarPath: string
  imageName: string | null
  imageTag: string | null
  imageReference: string | null
  imageId: string | null
  sizeBytes: number
  sizeFormatted: string
  layers: number
  architecture: string | null
  exposedPorts: string[]
  environmentFileName: string | null
  composeFileName: string | null
  composeServices: string[]
  bundleReferences: string[]
  loadStatus: string
  loadOutput: string | null
  loadError: string | null
  createdAt: string
  updatedAt: string
  canManage: boolean
}

export interface ProjectDockerDeployment {
  id: number
  projectId: number
  imageId: number
  uploaderName: string
  containerName: string | null
  containerId: string | null
  status: string
  hostPort: number | null
  containerPort: string | null
  endpointUrl: string | null
  runOutput: string | null
  errorMessage: string | null
  startedAt: string | null
  stoppedAt: string | null
  createdAt: string
  updatedAt: string
  canManage: boolean
}

export interface ProjectDockerBuildJob {
  id: number
  projectId: number
  uploaderName: string
  sourceFileName: string
  dockerfilePath: string
  contextPath: string
  imageName: string | null
  imageTag: string | null
  requestedContainerPort: string | null
  preferredHostPort: number | null
  environmentFileName: string | null
  status: string
  buildOutputExcerpt: string | null
  errorMessage: string | null
  imageRecordId: number | null
  deploymentId: number | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
  canManage: boolean
}

export interface ProjectDockerSummary {
  runtime?: {
    dockerVersion: string | null
    engineAvailable: boolean
    engineError: string | null
  }
  images: ProjectDockerImage[]
  deployments: ProjectDockerDeployment[]
  buildJobs: ProjectDockerBuildJob[]
}

interface UploadDockerImageOptions {
  currentUserName: string
  preferredHostPort?: number | null
  environment?: string
  environmentFile?: File | null
  composeFile?: File | null
  onProgress?: (percent: number) => void
}

interface UploadDockerSourceBuildOptions {
  currentUserName: string
  dockerfilePath?: string
  contextPath?: string
  imageName?: string
  imageTag?: string
  containerPort?: string
  preferredHostPort?: number | null
  environment?: string
  environmentFile?: File | null
  onProgress?: (percent: number) => void
}

const UPLOAD_REQUEST_TIMEOUT_MS = 30 * 60 * 1000

function normalizeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function normalizeDockerImagePayload(value: unknown): ProjectDockerImage | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const typedValue = value as Partial<ProjectDockerImage>
  return {
    ...typedValue,
    id: Number(typedValue.id ?? 0),
    projectId: Number(typedValue.projectId ?? 0),
    uploaderName: typeof typedValue.uploaderName === 'string' ? typedValue.uploaderName : '',
    originalFileName: typeof typedValue.originalFileName === 'string' ? typedValue.originalFileName : '',
    tarPath: typeof typedValue.tarPath === 'string' ? typedValue.tarPath : '',
    imageName: typeof typedValue.imageName === 'string' ? typedValue.imageName : null,
    imageTag: typeof typedValue.imageTag === 'string' ? typedValue.imageTag : null,
    imageReference: typeof typedValue.imageReference === 'string' ? typedValue.imageReference : null,
    imageId: typeof typedValue.imageId === 'string' ? typedValue.imageId : null,
    sizeBytes: Number(typedValue.sizeBytes ?? 0),
    sizeFormatted: typeof typedValue.sizeFormatted === 'string' ? typedValue.sizeFormatted : '0 B',
    layers: Number(typedValue.layers ?? 0),
    architecture: typeof typedValue.architecture === 'string' ? typedValue.architecture : null,
    exposedPorts: normalizeArray<string>(typedValue.exposedPorts),
    environmentFileName: typeof typedValue.environmentFileName === 'string' ? typedValue.environmentFileName : null,
    composeFileName: typeof typedValue.composeFileName === 'string' ? typedValue.composeFileName : null,
    composeServices: normalizeArray<string>(typedValue.composeServices),
    bundleReferences: normalizeArray<string>(typedValue.bundleReferences),
    loadStatus: typeof typedValue.loadStatus === 'string' ? typedValue.loadStatus : 'uploaded',
    loadOutput: typeof typedValue.loadOutput === 'string' ? typedValue.loadOutput : null,
    loadError: typeof typedValue.loadError === 'string' ? typedValue.loadError : null,
    createdAt: typeof typedValue.createdAt === 'string' ? typedValue.createdAt : '',
    updatedAt: typeof typedValue.updatedAt === 'string' ? typedValue.updatedAt : '',
    canManage: Boolean(typedValue.canManage),
  }
}

async function extractApiError(response: Response, fallbackMessage: string) {
  try {
    const payload = (await response.json()) as { error?: unknown }
    if (typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error
    }
  } catch {
    // Ignore invalid payloads and use the fallback message.
  }

  return fallbackMessage
}

function extractJsonErrorFromText(responseText: string, fallbackMessage: string) {
  try {
    const payload = JSON.parse(responseText) as { error?: unknown }
    if (typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error
    }
  } catch {
    // Ignore invalid payloads and use the fallback message.
  }

  return fallbackMessage
}

function createDockerSummaryFromPayload(payload: unknown): ProjectDockerSummary {
  const typedPayload = payload as { runtime?: unknown; images?: unknown; deployments?: unknown; buildJobs?: unknown } | null
  const runtimePayload =
    typedPayload?.runtime && typeof typedPayload.runtime === 'object'
      ? (typedPayload.runtime as {
          dockerVersion?: unknown
          engineAvailable?: unknown
          engineError?: unknown
        })
      : null

  return {
    runtime: runtimePayload
      ? {
          dockerVersion: typeof runtimePayload.dockerVersion === 'string' ? runtimePayload.dockerVersion : null,
          engineAvailable: Boolean(runtimePayload.engineAvailable),
          engineError: typeof runtimePayload.engineError === 'string' ? runtimePayload.engineError : null,
        }
      : undefined,
    images: normalizeArray<unknown>(typedPayload?.images)
      .map((image) => normalizeDockerImagePayload(image))
      .filter((image): image is ProjectDockerImage => Boolean(image)),
    deployments: normalizeArray<ProjectDockerDeployment>(typedPayload?.deployments),
    buildJobs: normalizeArray<ProjectDockerBuildJob>(typedPayload?.buildJobs),
  }
}

function createProjectDockerHeaders(projectId: number, currentUserName: string) {
  return {
    ...(currentUserName ? { 'x-jb-user-name': currentUserName } : {}),
    ...createProjectEditHeaders(projectId),
  }
}

export async function fetchProjectDockerSummary(projectId: number, currentUserName: string): Promise<ProjectDockerSummary> {
  const response = await fetch(`${API_BASE}/projects/${projectId}/docker`, {
    headers: createProjectDockerHeaders(projectId, currentUserName),
  })

  if (!response.ok) {
    const message = await extractApiError(response, `도커 실행 상태를 불러오지 못했습니다. (${response.status})`)
    throw new Error(message)
  }

  const payload = (await response.json()) as unknown
  return createDockerSummaryFromPayload(payload)
}

export async function uploadProjectDockerImage(
  projectId: number,
  file: File,
  options: UploadDockerImageOptions,
): Promise<ProjectDockerSummary> {
  return await new Promise<ProjectDockerSummary>((resolve, reject) => {
    const formData = new FormData()
    formData.append('tarFile', file)
    if (typeof options.preferredHostPort === 'number' && Number.isFinite(options.preferredHostPort)) {
      formData.append('preferredHostPort', String(options.preferredHostPort))
    }
    if (typeof options.environment === 'string' && options.environment.trim()) {
      formData.append('environment', options.environment)
    }
    if (options.environmentFile instanceof File) {
      formData.append('environmentFile', options.environmentFile)
    }
    if (options.composeFile instanceof File) {
      formData.append('composeFile', options.composeFile)
    }

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE}/projects/${projectId}/docker/images`)
    xhr.responseType = 'text'
    xhr.timeout = UPLOAD_REQUEST_TIMEOUT_MS
    xhr.setRequestHeader('x-jb-user-name', options.currentUserName)
    for (const [headerName, headerValue] of Object.entries(createProjectEditHeaders(projectId))) {
      xhr.setRequestHeader(headerName, headerValue)
    }

    xhr.upload.onprogress = (event) => {
      if (!options.onProgress) {
        return
      }

      if (event.lengthComputable && event.total > 0) {
        options.onProgress(Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100))))
        return
      }

      options.onProgress(20)
    }

    xhr.onerror = () => {
      reject(new Error('네트워크 오류로 Docker 이미지 업로드에 실패했습니다.'))
    }

    xhr.ontimeout = () => {
      reject(new Error('Docker 이미지 업로드 시간이 초과되었습니다.'))
    }

    xhr.onabort = () => {
      reject(new Error('Docker 이미지 업로드가 취소되었습니다.'))
    }

    xhr.onload = () => {
      const responseText = typeof xhr.responseText === 'string' ? xhr.responseText : ''

      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(extractJsonErrorFromText(responseText, `Docker 이미지 업로드에 실패했습니다. (${xhr.status})`)))
        return
      }

      try {
        const payload = JSON.parse(responseText) as unknown
        options.onProgress?.(100)
        resolve(createDockerSummaryFromPayload(payload))
      } catch {
        reject(new Error('Docker 이미지 업로드 응답 형식이 올바르지 않습니다.'))
      }
    }

    xhr.send(formData)
  })
}

export async function uploadProjectDockerSourceBuild(
  projectId: number,
  file: File,
  options: UploadDockerSourceBuildOptions,
): Promise<ProjectDockerSummary> {
  return await new Promise<ProjectDockerSummary>((resolve, reject) => {
    const formData = new FormData()
    formData.append('sourceBundle', file)
    if (typeof options.dockerfilePath === 'string' && options.dockerfilePath.trim()) {
      formData.append('dockerfilePath', options.dockerfilePath.trim())
    }
    if (typeof options.contextPath === 'string' && options.contextPath.trim()) {
      formData.append('contextPath', options.contextPath.trim())
    }
    if (typeof options.imageName === 'string' && options.imageName.trim()) {
      formData.append('imageName', options.imageName.trim())
    }
    if (typeof options.imageTag === 'string' && options.imageTag.trim()) {
      formData.append('imageTag', options.imageTag.trim())
    }
    if (typeof options.containerPort === 'string' && options.containerPort.trim()) {
      formData.append('containerPort', options.containerPort.trim())
    }
    if (typeof options.preferredHostPort === 'number' && Number.isFinite(options.preferredHostPort)) {
      formData.append('preferredHostPort', String(options.preferredHostPort))
    }
    if (typeof options.environment === 'string' && options.environment.trim()) {
      formData.append('environment', options.environment)
    }
    if (options.environmentFile instanceof File) {
      formData.append('environmentFile', options.environmentFile)
    }

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE}/projects/${projectId}/docker/source-builds`)
    xhr.responseType = 'text'
    xhr.timeout = UPLOAD_REQUEST_TIMEOUT_MS
    xhr.setRequestHeader('x-jb-user-name', options.currentUserName)
    for (const [headerName, headerValue] of Object.entries(createProjectEditHeaders(projectId))) {
      xhr.setRequestHeader(headerName, headerValue)
    }

    xhr.upload.onprogress = (event) => {
      if (!options.onProgress) {
        return
      }

      if (event.lengthComputable && event.total > 0) {
        options.onProgress(Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100))))
        return
      }

      options.onProgress(20)
    }

    xhr.onerror = () => {
      reject(new Error('네트워크 오류로 Docker 소스 번들 업로드에 실패했습니다.'))
    }

    xhr.ontimeout = () => {
      reject(new Error('Docker 소스 번들 업로드 시간이 초과되었습니다.'))
    }

    xhr.onabort = () => {
      reject(new Error('Docker 소스 번들 업로드가 취소되었습니다.'))
    }

    xhr.onload = () => {
      const responseText = typeof xhr.responseText === 'string' ? xhr.responseText : ''

      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(extractJsonErrorFromText(responseText, `Docker 소스 빌드 업로드에 실패했습니다. (${xhr.status})`)))
        return
      }

      try {
        const payload = JSON.parse(responseText) as unknown
        options.onProgress?.(100)
        resolve(createDockerSummaryFromPayload(payload))
      } catch {
        reject(new Error('Docker 소스 빌드 응답 형식이 올바르지 않습니다.'))
      }
    }

    xhr.send(formData)
  })
}

export async function fetchProjectDeploymentLogs(
  projectId: number,
  deploymentId: number,
  currentUserName: string,
  tail = 200,
): Promise<string> {
  const response = await fetch(`${API_BASE}/projects/${projectId}/docker/deployments/${deploymentId}/logs?tail=${tail}`, {
    headers: createProjectDockerHeaders(projectId, currentUserName),
  })

  if (!response.ok) {
    const message = await extractApiError(response, `배포 로그를 불러오지 못했습니다. (${response.status})`)
    throw new Error(message)
  }

  const payload = (await response.json()) as { logs?: unknown }
  return typeof payload.logs === 'string' ? payload.logs : ''
}

export async function fetchProjectBuildJobLogs(
  projectId: number,
  buildJobId: number,
  currentUserName: string,
): Promise<string> {
  const response = await fetch(`${API_BASE}/projects/${projectId}/docker/build-jobs/${buildJobId}/logs`, {
    headers: createProjectDockerHeaders(projectId, currentUserName),
  })

  if (!response.ok) {
    const message = await extractApiError(response, `Docker 빌드 로그를 불러오지 못했습니다. (${response.status})`)
    throw new Error(message)
  }

  const payload = (await response.json()) as { logs?: unknown }
  return typeof payload.logs === 'string' ? payload.logs : ''
}

async function mutateDeployment(
  projectId: number,
  deploymentId: number,
  action: 'start' | 'stop' | 'restart',
  currentUserName: string,
): Promise<ProjectDockerSummary> {
  const response = await fetch(`${API_BASE}/projects/${projectId}/docker/deployments/${deploymentId}/${action}`, {
    method: 'POST',
    headers: createProjectDockerHeaders(projectId, currentUserName),
  })

  if (!response.ok) {
    const actionLabel = action === 'start' ? '시작' : action === 'stop' ? '중지' : '재시작'
    const message = await extractApiError(response, `배포 ${actionLabel}에 실패했습니다. (${response.status})`)
    throw new Error(message)
  }

  const payload = (await response.json()) as unknown
  return createDockerSummaryFromPayload(payload)
}

export async function startProjectDeployment(projectId: number, deploymentId: number, currentUserName: string) {
  return await mutateDeployment(projectId, deploymentId, 'start', currentUserName)
}

export async function stopProjectDeployment(projectId: number, deploymentId: number, currentUserName: string) {
  return await mutateDeployment(projectId, deploymentId, 'stop', currentUserName)
}

export async function restartProjectDeployment(projectId: number, deploymentId: number, currentUserName: string) {
  return await mutateDeployment(projectId, deploymentId, 'restart', currentUserName)
}

export async function removeProjectDockerImage(projectId: number, imageId: number, currentUserName: string) {
  const response = await fetch(`${API_BASE}/projects/${projectId}/docker/images/${imageId}`, {
    method: 'DELETE',
    headers: createProjectDockerHeaders(projectId, currentUserName),
  })

  if (!response.ok) {
    const message = await extractApiError(response, `Docker 이미지 삭제에 실패했습니다. (${response.status})`)
    throw new Error(message)
  }

  const payload = (await response.json()) as unknown
  return createDockerSummaryFromPayload(payload)
}
