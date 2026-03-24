import type { Project } from './project-utils'
import { getApiBase } from './api-base'
import { createProjectEditHeaders, persistProjectEditToken } from './project-edit-token-storage'

const API_BASE = getApiBase('/api/v1')

interface RankingProject {
  id: number
  title: string
  author: string
  department: string
  stars: number
  forks: number
  views: number
  score: number
  rank: number
}

interface RankingContributor {
  name: string
  department: string
  projects: number
  stars: number
  forks: number
  views: number
}

interface RankingDepartment {
  name: string
  projects: number
  contributors: number
  stars: number
  views: number
}

export interface ProjectRankings {
  projects: RankingProject[]
  contributors: RankingContributor[]
  departments: RankingDepartment[]
}

export interface ProjectFileNode {
  name: string
  path: string
  type: 'file' | 'folder'
  size?: number
  updatedAt?: string
  children?: ProjectFileNode[]
}

export interface ProjectFileContent {
  name: string
  path: string
  size: number
  updatedAt: string
  isText: boolean
  truncated: boolean
  content: string | null
}

export interface ProjectReadmeDocument {
  name: string
  path: string
  content: string
  size: number
  updatedAt: string | null
  exists: boolean
  isGenerated: boolean
}

interface UploadProjectFilesOptions {
  currentUserName: string
  onProgress?: (percent: number) => void
}

const UPLOAD_REQUEST_TIMEOUT_MS = 10 * 60 * 1000
const UPLOAD_REQUEST_RETRY_LIMIT = 1
const PROJECT_FILE_UPLOAD_BATCH_COUNT = 40
const PROJECT_FILE_UPLOAD_BATCH_BYTES = 128 * 1024 * 1024

function normalizeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function localizeProjectApiError(message: string, status: number) {
  const normalized = message.trim().toLowerCase()
  if (!normalized) {
    return `요청 처리에 실패했습니다. (${status})`
  }

  if (normalized === 'title is required.') return '프로젝트명은 필수입니다.'
  if (normalized === 'title is too short.') return '프로젝트명은 2자 이상이어야 합니다.'
  if (normalized === 'description is required.') return '설명은 필수입니다.'
  if (normalized === 'description is too short.') return '설명은 10자 이상이어야 합니다.'
  if (normalized === 'author is required.') return '작성자는 필수입니다.'
  if (normalized === 'author is too short.') return '작성자는 2자 이상이어야 합니다.'
  if (normalized === 'department is required.') return '부서는 필수입니다.'
  if (normalized === 'at least one valid tag is required.') return '태그를 하나 이상 입력해 주세요.'
  if (normalized === 'project not found.') return '프로젝트를 찾을 수 없습니다.'
  if (normalized === 'at least one file is required.') return '업로드할 파일을 하나 이상 선택해 주세요.'
  if (normalized === 'invalid file path.') return '파일 경로가 올바르지 않습니다.'
  if (normalized === 'file path is required.') return '파일 경로가 필요합니다.'
  if (normalized === 'file not found.') return '파일을 찾을 수 없습니다.'
  if (normalized === 'preview is only available for files.') return '파일만 미리볼 수 있습니다.'
  if (normalized === 'only files can be downloaded.') return '파일만 다운로드할 수 있습니다.'
  if (normalized === 'access to this file is restricted.') return '민감한 파일은 이 화면에서 열람할 수 없습니다.'
  if (normalized === 'sensitive files and secrets cannot be uploaded to projects.') {
    return '비밀값이나 인증서, 키 파일은 프로젝트에 업로드할 수 없습니다.'
  }
  if (normalized === 'only the project author can upload files.') {
    return '이 프로젝트를 관리하는 사용자만 파일을 올릴 수 있습니다.'
  }

  if (normalized === 'only the project author can delete files.') {
    return '이 프로젝트를 관리하는 사용자만 파일이나 폴더를 삭제할 수 있습니다.'
  }

  if (normalized === 'only the project author can update the readme.') {
    return '프로젝트 작성자만 README를 수정할 수 있습니다.'
  }

  if (normalized === 'project file storage limit exceeded. each project can store up to 1gb.') {
    return '하나의 프로젝트에는 파일을 최대 1GB까지만 올릴 수 있습니다.'
  }

  if (normalized === 'file path conflicts with an existing folder.') {
    return '같은 경로에 이미 폴더가 있어 파일을 업로드할 수 없습니다.'
  }

  if (normalized === 'uploaded file is too large. the maximum size is 512mb per file.') {
    return '파일 하나의 최대 업로드 크기는 512MB입니다.'
  }

  if (normalized === 'request entity too large' || normalized === 'payload too large') {
    return '업로드 요청 크기가 너무 큽니다. 파일 수를 줄이거나 나눠서 다시 시도해 주세요.'
  }

  return message
}

async function extractApiError(response: Response, fallbackMessage: string) {
  try {
    const payload = (await response.json()) as { error?: unknown }
    if (typeof payload.error === 'string' && payload.error.trim()) {
      return localizeProjectApiError(payload.error, response.status)
    }
  } catch {
    // Ignore invalid error bodies and use the fallback message.
  }

  return fallbackMessage
}

function extractJsonErrorFromText(responseText: string, fallbackMessage: string, status: number) {
  try {
    const payload = JSON.parse(responseText) as { error?: unknown }
    if (typeof payload.error === 'string' && payload.error.trim()) {
      return localizeProjectApiError(payload.error, status)
    }
  } catch {
    // Ignore invalid JSON and use the fallback message.
  }

  return fallbackMessage
}

function buildProjectUploadFormData(files: File[]) {
  const formData = new FormData()
  const relativePaths = files.map((file) => {
    const withRelativePath = file as File & { webkitRelativePath?: string }
    return withRelativePath.webkitRelativePath?.trim() || file.name
  })

  for (const file of files) {
    formData.append('files', file)
  }

  formData.append('relativePaths', JSON.stringify(relativePaths))
  return formData
}

function uploadProjectFileBatchWithRetry(
  projectId: number,
  files: File[],
  options: UploadProjectFilesOptions,
): Promise<ProjectFileNode[]> {
  return new Promise<ProjectFileNode[]>((resolve, reject) => {
    const sendRequest = (attempt: number) => {
      const xhr = new XMLHttpRequest()

      xhr.open('POST', `${API_BASE}/projects/${projectId}/files`)
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
        if (attempt < UPLOAD_REQUEST_RETRY_LIMIT) {
          options.onProgress?.(5)
          sendRequest(attempt + 1)
          return
        }

        reject(new Error('프로젝트 파일 업로드 중 네트워크 오류가 발생했습니다.'))
      }

      xhr.ontimeout = () => {
        if (attempt < UPLOAD_REQUEST_RETRY_LIMIT) {
          options.onProgress?.(5)
          sendRequest(attempt + 1)
          return
        }

        reject(new Error('프로젝트 파일 업로드가 시간 초과로 실패했습니다.'))
      }

      xhr.onabort = () => {
        reject(new Error('프로젝트 파일 업로드가 중단되었습니다.'))
      }

      xhr.onload = () => {
        const responseText = typeof xhr.responseText === 'string' ? xhr.responseText : ''

        if (xhr.status < 200 || xhr.status >= 300) {
          const message = extractJsonErrorFromText(
            responseText,
            `프로젝트 파일 업로드에 실패했습니다. (${xhr.status})`,
            xhr.status,
          )
          reject(new Error(message))
          return
        }

        try {
          const payload = JSON.parse(responseText) as { files?: unknown }
          options.onProgress?.(100)
          resolve(normalizeArray<ProjectFileNode>(payload.files))
        } catch {
          reject(new Error('프로젝트 파일 업로드 응답이 올바르지 않습니다.'))
        }
      }

      xhr.send(buildProjectUploadFormData(files))
    }

    sendRequest(0)
  })
}

function calculateUploadWeight(files: File[]) {
  return files.reduce((total, file) => total + Math.max(1, Number(file.size) || 0), 0)
}

function chunkProjectFiles(
  files: File[],
  options: {
    maxFiles: number
    maxBytes: number
  },
) {
  if (files.length === 0) {
    return []
  }

  if (files.length <= options.maxFiles && calculateUploadWeight(files) <= options.maxBytes) {
    return [files]
  }

  const chunks: File[][] = []
  let currentChunk: File[] = []
  let currentChunkBytes = 0

  for (const file of files) {
    const fileSize = Math.max(1, Number(file.size) || 0)
    const wouldExceedFileCount = currentChunk.length >= options.maxFiles
    const wouldExceedBytes = currentChunk.length > 0 && currentChunkBytes + fileSize > options.maxBytes

    if (wouldExceedFileCount || wouldExceedBytes) {
      chunks.push(currentChunk)
      currentChunk = []
      currentChunkBytes = 0
    }

    currentChunk.push(file)
    currentChunkBytes += fileSize
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk)
  }

  return chunks
}

export async function fetchProjects(): Promise<Project[]> {
  const response = await fetch(`${API_BASE}/projects`)
  if (!response.ok) {
    const message = await extractApiError(response, `프로젝트 목록 조회에 실패했습니다. (${response.status})`)
    throw new Error(message)
  }

  const payload = (await response.json()) as { projects?: unknown }
  return normalizeArray<Project>(payload.projects)
}

export async function createProject(data: Partial<Project>): Promise<Project> {
  const response = await fetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const message = await extractApiError(response, `프로젝트 생성에 실패했습니다. (${response.status})`)
    throw new Error(message)
  }

  const payload = (await response.json()) as { project?: unknown; projectEditToken?: unknown }
  const created = payload.project ?? payload

  if (!created || typeof created !== 'object') {
    throw new Error('프로젝트 생성 응답이 올바르지 않습니다.')
  }

  const project = created as Project
  if (typeof payload.projectEditToken === 'string' && payload.projectEditToken.trim()) {
    persistProjectEditToken(project.id, payload.projectEditToken)
  }

  return project
}

export async function fetchRankings(): Promise<ProjectRankings> {
  const response = await fetch(`${API_BASE}/rankings`)
  if (!response.ok) {
    const message = await extractApiError(response, `랭킹 조회에 실패했습니다. (${response.status})`)
    throw new Error(message)
  }

  const payload = (await response.json()) as { rankings?: unknown }
  const rankings = payload.rankings as
    | {
        projects?: unknown
        contributors?: unknown
        departments?: unknown
      }
    | undefined

  return {
    projects: normalizeArray<RankingProject>(rankings?.projects),
    contributors: normalizeArray<RankingContributor>(rankings?.contributors),
    departments: normalizeArray<RankingDepartment>(rankings?.departments),
  }
}

export async function fetchProjectFiles(projectId: number): Promise<ProjectFileNode[]> {
  const response = await fetch(`${API_BASE}/projects/${projectId}/files`)
  if (!response.ok) {
    const message = await extractApiError(response, `프로젝트 파일 조회에 실패했습니다. (${response.status})`)
    throw new Error(message)
  }

  const payload = (await response.json()) as { files?: unknown }
  return normalizeArray<ProjectFileNode>(payload.files)
}

export async function fetchProjectReadme(projectId: number): Promise<ProjectReadmeDocument> {
  const response = await fetch(`${API_BASE}/projects/${projectId}/readme`)
  if (!response.ok) {
    const message = await extractApiError(response, `README를 불러오지 못했습니다. (${response.status})`)
    throw new Error(message)
  }

  const payload = (await response.json()) as { readme?: unknown }
  const readme = payload.readme

  if (!readme || typeof readme !== 'object') {
    throw new Error('README 응답 형식이 올바르지 않습니다.')
  }

  return readme as ProjectReadmeDocument
}

export async function uploadProjectFiles(
  projectId: number,
  files: File[],
  options: UploadProjectFilesOptions,
): Promise<ProjectFileNode[]> {
  const chunks = chunkProjectFiles(files, {
    maxFiles: PROJECT_FILE_UPLOAD_BATCH_COUNT,
    maxBytes: PROJECT_FILE_UPLOAD_BATCH_BYTES,
  })
  const totalWeight = calculateUploadWeight(files)
  let completedWeight = 0
  let latestFiles: ProjectFileNode[] = []

  for (const chunk of chunks) {
    const chunkWeight = calculateUploadWeight(chunk)
    latestFiles = await uploadProjectFileBatchWithRetry(projectId, chunk, {
      ...options,
      onProgress: (chunkPercent) => {
        if (!options.onProgress) {
          return
        }

        const normalizedChunkPercent = Math.max(0, Math.min(100, chunkPercent))
        const weightedProgress = completedWeight + chunkWeight * (normalizedChunkPercent / 100)
        const overallPercent = Math.round((weightedProgress / Math.max(1, totalWeight)) * 100)
        options.onProgress(Math.max(1, Math.min(99, overallPercent)))
      },
    })

    completedWeight += chunkWeight
    if (options.onProgress) {
      const overallPercent = Math.round((completedWeight / Math.max(1, totalWeight)) * 100)
      options.onProgress(Math.max(1, Math.min(99, overallPercent)))
    }
  }

  options.onProgress?.(100)
  return latestFiles
}

export async function fetchProjectFileContent(projectId: number, relativePath: string): Promise<ProjectFileContent> {
  const response = await fetch(
    `${API_BASE}/projects/${projectId}/files/content?path=${encodeURIComponent(relativePath)}`,
  )
  if (!response.ok) {
    const message = await extractApiError(response, `파일 미리보기에 실패했습니다. (${response.status})`)
    throw new Error(message)
  }

  const payload = (await response.json()) as { file?: unknown }
  const file = payload.file

  if (!file || typeof file !== 'object') {
    throw new Error('파일 미리보기 응답이 올바르지 않습니다.')
  }

  return file as ProjectFileContent
}

export async function updateProjectReadme(
  projectId: number,
  content: string,
  currentUserName: string,
): Promise<ProjectReadmeDocument> {
  const response = await fetch(`${API_BASE}/projects/${projectId}/readme`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-jb-user-name': currentUserName,
      ...createProjectEditHeaders(projectId),
    },
    body: JSON.stringify({ content }),
  })

  if (!response.ok) {
    const message = await extractApiError(response, `README를 저장하지 못했습니다. (${response.status})`)
    throw new Error(message)
  }

  const payload = (await response.json()) as { readme?: unknown }
  const readme = payload.readme

  if (!readme || typeof readme !== 'object') {
    throw new Error('README 저장 응답 형식이 올바르지 않습니다.')
  }

  return readme as ProjectReadmeDocument
}

export async function deleteProjectFilePath(
  projectId: number,
  relativePath: string,
  currentUserName: string,
): Promise<ProjectFileNode[]> {
  const response = await fetch(`${API_BASE}/projects/${projectId}/files?path=${encodeURIComponent(relativePath)}`, {
    method: 'DELETE',
    headers: {
      'x-jb-user-name': currentUserName,
      ...createProjectEditHeaders(projectId),
    },
  })

  if (!response.ok) {
    const message = await extractApiError(response, `파일 삭제에 실패했습니다. (${response.status})`)
    throw new Error(message)
  }

  const payload = (await response.json()) as { files?: unknown }
  return normalizeArray<ProjectFileNode>(payload.files)
}

export function buildProjectFileDownloadUrl(projectId: number, relativePath: string) {
  return `${API_BASE}/projects/${projectId}/files/download?path=${encodeURIComponent(relativePath)}`
}
