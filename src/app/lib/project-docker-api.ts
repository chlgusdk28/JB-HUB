import { createProjectEditHeaders } from './project-edit-token-storage'

const API_BASE = '/api/v1'
const UPLOAD_REQUEST_TIMEOUT_MS = 30 * 60 * 1000

export interface ProjectContainerBuildJob {
  id: number
  projectId: number
  definitionName: string
  status: string
  uploaderName: string
  dockerfilePath: string
  contextPath: string
  imageReference: string | null
  containerPort: number | null
  preferredHostPort: number | null
  errorMessage: string | null
  logPath: string | null
  deploymentId: number | null
  createdAt: string | null
  startedAt: string | null
  finishedAt: string | null
}

export interface ProjectContainerServiceEndpoint {
  serviceName: string | null
  containerPort: number | null
  hostPort: number | null
  endpointUrl: string | null
  sitePreviewUrl: string | null
  isPrimary: boolean
}

export interface ProjectContainerDeployment {
  id: number
  projectId: number
  buildJobId: number | null
  definitionName: string
  deploymentToken: string
  uploaderName: string
  containerName: string | null
  containerId: string | null
  containerPort: number | null
  hostPort: number | null
  imageReference: string | null
  status: string
  endpointUrl: string | null
  sitePreviewUrl: string | null
  serviceEndpoints: ProjectContainerServiceEndpoint[]
  errorMessage: string | null
  runOutput: string | null
  createdAt: string | null
  updatedAt: string | null
  stoppedAt: string | null
}

export interface ProjectContainerDefinition {
  name: string
  rootPath: string
  dockerfilePath: string
  composeFilePath: string | null
  metadataPath: string | null
  buildContextPath: string
  containerPort: number | null
  healthcheckPath: string | null
  readinessTimeoutSec: number | null
  files: string[]
  warnings: string[]
  lastBuildJob: ProjectContainerBuildJob | null
  activeDeployment: ProjectContainerDeployment | null
}

export interface ProjectContainerOverview {
  docker: {
    available: boolean
    version: string | null
    error: string | null
  }
  definitions: ProjectContainerDefinition[]
  buildJobs: ProjectContainerBuildJob[]
  deployments: ProjectContainerDeployment[]
}

interface UploadDockerfileOptions {
  currentUserName: string
  definitionName?: string
  onProgress?: (percent: number) => void
}

interface UploadContainerBundleOptions extends UploadDockerfileOptions {}
interface UploadComposeBundleOptions extends UploadDockerfileOptions {}
interface UploadDockerComposeOptions extends UploadDockerfileOptions {}

interface StartContainerBuildInput {
  definitionName: string
  dockerfilePath?: string
  contextPath?: string
  containerPort?: number | null
  preferredHostPort?: number | null
}

function getRelativePath(file: File) {
  const withRelativePath = file as File & { webkitRelativePath?: string }
  return withRelativePath.webkitRelativePath?.trim() || file.name
}

async function extractApiError(response: Response, fallbackMessage: string) {
  try {
    const payload = (await response.json()) as { error?: unknown }
    if (typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error
    }
  } catch {
    // Ignore invalid error payloads.
  }

  return fallbackMessage
}

function sendUploadRequest<T>(
  url: string,
  formData: FormData,
  projectId: number,
  options: UploadDockerfileOptions,
) {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
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

      options.onProgress(25)
    }

    xhr.onerror = () => {
      reject(new Error('업로드 중 네트워크 오류가 발생했습니다.'))
    }

    xhr.ontimeout = () => {
      reject(new Error('업로드 시간이 초과되었습니다.'))
    }

    xhr.onload = () => {
      const responseText = typeof xhr.responseText === 'string' ? xhr.responseText : ''
      if (xhr.status < 200 || xhr.status >= 300) {
        try {
          const payload = JSON.parse(responseText) as { error?: unknown }
          reject(new Error(typeof payload.error === 'string' ? payload.error : `업로드에 실패했습니다. (${xhr.status})`))
        } catch {
          reject(new Error(responseText.trim() || `업로드에 실패했습니다. (${xhr.status})`))
        }
        return
      }

      try {
        options.onProgress?.(100)
        resolve(JSON.parse(responseText) as T)
      } catch {
        reject(new Error('업로드 응답을 해석하지 못했습니다.'))
      }
    }

    xhr.send(formData)
  })
}

function buildContainerUploadFormData(files: File[], definitionName?: string) {
  const formData = new FormData()

  for (const file of files) {
    formData.append('files', file)
  }

  formData.append('relativePaths', JSON.stringify(files.map((file) => getRelativePath(file))))

  if (definitionName) {
    formData.append('definitionName', definitionName)
  }

  return formData
}

function buildDockerfileUploadFormData(file: File, definitionName?: string) {
  const formData = new FormData()
  formData.append('dockerfile', file, file.name || 'Dockerfile')

  if (definitionName) {
    formData.append('definitionName', definitionName)
  }

  return formData
}

function buildComposeUploadFormData(composeFile: File, contextTar: File, definitionName?: string) {
  const formData = new FormData()
  formData.append('composeFile', composeFile, composeFile.name || 'docker-compose.yml')
  formData.append('contextTar', contextTar, contextTar.name || 'context.tar')

  if (definitionName) {
    formData.append('definitionName', definitionName)
  }

  return formData
}

function buildDockerComposeUploadFormData(
  dockerfile: File,
  composeFile: File,
  definitionName?: string,
  contextTar?: File | null,
) {
  const formData = new FormData()
  formData.append('dockerfile', dockerfile, dockerfile.name || 'Dockerfile')
  formData.append('composeFile', composeFile, composeFile.name || 'docker-compose.yml')
  if (contextTar) {
    formData.append('contextTar', contextTar, contextTar.name || 'context.tar')
  }

  if (definitionName) {
    formData.append('definitionName', definitionName)
  }

  return formData
}

export async function fetchProjectContainers(projectId: number): Promise<ProjectContainerOverview> {
  const response = await fetch(`${API_BASE}/projects/${projectId}/containers`)
  if (!response.ok) {
    throw new Error(await extractApiError(response, `컨테이너 정보를 불러오지 못했습니다. (${response.status})`))
  }

  return (await response.json()) as ProjectContainerOverview
}

export async function uploadProjectDockerfile(
  projectId: number,
  file: File,
  options: UploadDockerfileOptions,
) {
  return await sendUploadRequest<{ uploadedDefinitionName?: string; definitions?: ProjectContainerDefinition[] }>(
    `${API_BASE}/projects/${projectId}/containers/upload`,
    buildDockerfileUploadFormData(file, options.definitionName),
    projectId,
    options,
  )
}

export async function uploadProjectComposeBundle(
  projectId: number,
  composeFile: File,
  contextTar: File,
  options: UploadComposeBundleOptions,
) {
  return await sendUploadRequest<{ uploadedDefinitionName?: string; definitions?: ProjectContainerDefinition[] }>(
    `${API_BASE}/projects/${projectId}/containers/upload`,
    buildComposeUploadFormData(composeFile, contextTar, options.definitionName),
    projectId,
    options,
  )
}

export async function uploadProjectDockerComposeFiles(
  projectId: number,
  dockerfile: File,
  composeFile: File,
  options: UploadDockerComposeOptions,
  contextTar?: File | null,
) {
  return await sendUploadRequest<{ uploadedDefinitionName?: string; definitions?: ProjectContainerDefinition[] }>(
    `${API_BASE}/projects/${projectId}/containers/upload`,
    buildDockerComposeUploadFormData(dockerfile, composeFile, options.definitionName, contextTar),
    projectId,
    options,
  )
}

export async function uploadProjectContainerBundle(
  projectId: number,
  files: File[],
  options: UploadContainerBundleOptions,
) {
  return await sendUploadRequest<{ uploadedDefinitionName?: string; definitions?: ProjectContainerDefinition[] }>(
    `${API_BASE}/projects/${projectId}/containers/upload`,
    buildContainerUploadFormData(files, options.definitionName),
    projectId,
    options,
  )
}

export async function startProjectContainerBuild(
  projectId: number,
  input: StartContainerBuildInput,
  currentUserName: string,
) {
  const response = await fetch(`${API_BASE}/projects/${projectId}/containers/build`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-jb-user-name': currentUserName,
      ...createProjectEditHeaders(projectId),
    },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw new Error(await extractApiError(response, `컨테이너 빌드를 시작하지 못했습니다. (${response.status})`))
  }

  return (await response.json()) as { job?: ProjectContainerBuildJob }
}

export async function fetchProjectContainerBuildLogs(jobId: number) {
  const response = await fetch(`${API_BASE}/containers/build-jobs/${jobId}/logs`)
  if (!response.ok) {
    throw new Error(await extractApiError(response, `빌드 로그를 불러오지 못했습니다. (${response.status})`))
  }

  return (await response.json()) as { job?: ProjectContainerBuildJob; logs?: string }
}

export async function controlProjectDeployment(
  projectId: number,
  deploymentId: number,
  action: 'start' | 'stop' | 'restart',
  currentUserName: string,
) {
  const response = await fetch(`${API_BASE}/containers/deployments/${deploymentId}/${action}`, {
    method: 'POST',
    headers: {
      'x-jb-user-name': currentUserName,
      ...createProjectEditHeaders(projectId),
    },
  })

  if (!response.ok) {
    throw new Error(await extractApiError(response, `배포 상태를 변경하지 못했습니다. (${response.status})`))
  }

  return (await response.json()) as { deployment?: ProjectContainerDeployment }
}
