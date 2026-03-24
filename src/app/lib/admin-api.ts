import { getApiBase } from './api-base'

const API_ADMIN_BASE = getApiBase('/api/admin')
const API_V1_BASE = getApiBase('/api/v1')

export type AdminRole = 'super_admin' | 'admin' | 'moderator'

export interface AdminSession {
  username: string
  role: AdminRole
  accessToken: string
  refreshToken: string
  sessionId: string
}

export interface AdminUser {
  id: number
  username: string
  email: string
  role: AdminRole
  is_active: boolean
  last_login_at: string | null
  created_at: string
}

export interface AdminProject {
  id: number
  title: string
  description: string
  author: string
  department: string
  stars: number
  forks: number
  comments: number
  views: number
  tags: string[]
  createdAt: string
  isNew: boolean
  trend: string | null
  badge: string | null
}

export interface AdminStats {
  totalProjects: number
  totalAdmins: number
  totalAuditLogs: number
  totalDockerImages: number
  totalDeployments: number
}

export interface AuditLogEntry {
  id: number
  action: string
  entity_type: string | null
  entity_id: number | null
  details: unknown
  admin_user_id: number | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

export interface SiteContentEntry {
  key: string
  group: string
  label: string
  description: string
  value: string
  isMultiline: boolean
  updatedAt: string | null
  displayOrder: number
}

export interface AdminBackupItem {
  id: string
  name: string
  filename: string
  size: number
  createdAt: string
  type: string
  status: string
}

export interface ServiceHostContainer {
  id: string
  name: string
  image: string
  status: string
  ports: string
}

export interface ServiceImage {
  id: number
  projectId: number
  projectTitle: string
  projectAuthor: string
  uploaderName: string
  originalFileName: string
  imageReference: string | null
  imageId: string | null
  sizeFormatted: string
  loadStatus: string
  loadError: string | null
  composeServices: string[]
  createdAt: string
  updatedAt: string
}

export interface ServiceDeployment {
  id: number
  projectId: number
  projectTitle: string
  projectAuthor: string
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
  imageReference: string | null
  originalFileName: string | null
}

export interface ServiceOverview {
  runtime: {
    dockerVersion: string | null
    hostContainerCount: number
    imageCount: number
    deploymentCount: number
    containerError: string | null
  }
  images: ServiceImage[]
  deployments: ServiceDeployment[]
  hostContainers: ServiceHostContainer[]
}

function createAdminHeaders(session: AdminSession, extraHeaders: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${session.accessToken}`,
    'x-admin-session': session.sessionId,
    ...extraHeaders,
  }
}

async function extractApiError(response: Response, fallbackMessage: string) {
  try {
    const payload = (await response.json()) as { error?: unknown; message?: unknown }
    if (typeof payload.error === 'string' && payload.error.trim()) {
      return localizeAdminError(payload.error)
    }
    if (typeof payload.message === 'string' && payload.message.trim()) {
      return payload.message
    }
  } catch {
    // Ignore invalid payloads.
  }

  return fallbackMessage
}

function localizeAdminError(message: string) {
  const normalized = message.trim().toLowerCase()

  if (normalized === 'invalid credentials') return '아이디 또는 비밀번호가 올바르지 않습니다.'
  if (normalized === 'account is inactive') return '비활성화된 계정입니다.'
  if (normalized === 'username and password required') return '아이디와 비밀번호를 입력해 주세요.'
  if (normalized === 'unauthorized') return '관리자 인증이 만료되었습니다.'
  if (normalized === 'forbidden') return '관리 권한이 없습니다.'
  if (normalized === 'username, email, and password are required') return '아이디, 이메일, 비밀번호를 모두 입력해 주세요.'
  if (normalized === 'username or email already exists') return '이미 존재하는 아이디 또는 이메일입니다.'
  if (normalized === 'cannot delete your own account') return '현재 로그인한 계정은 삭제할 수 없습니다.'
  if (normalized === 'project not found') return '프로젝트를 찾을 수 없습니다.'
  if (normalized === 'invalid project id') return '프로젝트 ID가 올바르지 않습니다.'
  if (normalized === 'deployment not found.') return '배포 정보를 찾을 수 없습니다.'
  if (normalized === 'image not found.') return '이미지를 찾을 수 없습니다.'
  if (normalized === 'at least one content entry is required.') return '수정할 문구를 하나 이상 입력해 주세요.'
  return message
}

async function requestJson<T>(input: string, init: RequestInit, fallbackMessage: string): Promise<T> {
  const response = await fetch(input, init)
  if (!response.ok) {
    throw new Error(await extractApiError(response, fallbackMessage))
  }
  return (await response.json()) as T
}

export async function loginAdmin(username: string, password: string): Promise<AdminSession> {
  const payload = await requestJson<{
    accessToken?: string
    refreshToken?: string
    sessionId?: string
    user?: { username?: string; role?: AdminRole }
  }>(
    `${API_ADMIN_BASE}/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    },
    '관리자 로그인에 실패했습니다.',
  )

  if (!payload.accessToken || !payload.refreshToken || !payload.sessionId) {
    throw new Error('관리자 로그인 응답 형식이 올바르지 않습니다.')
  }

  return {
    username: payload.user?.username || username,
    role: payload.user?.role || 'admin',
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    sessionId: payload.sessionId,
  }
}

export async function validateAdminSession(session: AdminSession) {
  return await requestJson<{ user?: AdminUser }>(
    `${API_ADMIN_BASE}/me`,
    {
      headers: createAdminHeaders(session),
    },
    '관리자 세션이 유효하지 않습니다.',
  )
}

export async function logoutAdmin(session: AdminSession) {
  await fetch(`${API_ADMIN_BASE}/logout`, {
    method: 'POST',
    headers: {
      ...createAdminHeaders(session),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  }).catch(() => undefined)
}

export async function fetchAdminHealth() {
  return await requestJson<{
    status: string
    uptime: number
    checks?: Record<string, unknown>
  }>(`${API_V1_BASE}/health`, {}, '서비스 상태를 불러오지 못했습니다.')
}

export async function fetchAdminStats(session: AdminSession) {
  const payload = await requestJson<{
    stats?: AdminStats
    recentLogs?: AuditLogEntry[]
  }>(
    `${API_ADMIN_BASE}/stats`,
    {
      headers: createAdminHeaders(session),
    },
    '운영 통계를 불러오지 못했습니다.',
  )

  return {
    stats: payload.stats ?? {
      totalProjects: 0,
      totalAdmins: 0,
      totalAuditLogs: 0,
      totalDockerImages: 0,
      totalDeployments: 0,
    },
    recentLogs: Array.isArray(payload.recentLogs) ? payload.recentLogs : [],
  }
}

export async function fetchAdminProjects(session: AdminSession) {
  const payload = await requestJson<{ projects?: AdminProject[] }>(
    `${API_ADMIN_BASE}/projects`,
    {
      headers: createAdminHeaders(session),
    },
    '프로젝트 목록을 불러오지 못했습니다.',
  )

  return Array.isArray(payload.projects) ? payload.projects : []
}

export async function createAdminProject(session: AdminSession, input: Partial<AdminProject>) {
  const payload = await requestJson<{ project?: AdminProject }>(
    `${API_ADMIN_BASE}/projects`,
    {
      method: 'POST',
      headers: {
        ...createAdminHeaders(session),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
    '프로젝트를 생성하지 못했습니다.',
  )

  if (!payload.project) {
    throw new Error('프로젝트 생성 응답이 올바르지 않습니다.')
  }

  return payload.project
}

export async function updateAdminProject(session: AdminSession, projectId: number, input: Partial<AdminProject>) {
  const payload = await requestJson<{ project?: AdminProject }>(
    `${API_ADMIN_BASE}/projects/${projectId}`,
    {
      method: 'PUT',
      headers: {
        ...createAdminHeaders(session),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
    '프로젝트를 수정하지 못했습니다.',
  )

  if (!payload.project) {
    throw new Error('프로젝트 수정 응답이 올바르지 않습니다.')
  }

  return payload.project
}

export async function deleteAdminProject(session: AdminSession, projectId: number) {
  return await requestJson<{ message?: string }>(
    `${API_ADMIN_BASE}/projects/${projectId}`,
    {
      method: 'DELETE',
      headers: createAdminHeaders(session),
    },
    '프로젝트를 삭제하지 못했습니다.',
  )
}

export async function fetchAdminUsers(session: AdminSession) {
  const payload = await requestJson<{ users?: AdminUser[] }>(
    `${API_ADMIN_BASE}/users`,
    {
      headers: createAdminHeaders(session),
    },
    '관리자 계정 목록을 불러오지 못했습니다.',
  )

  return Array.isArray(payload.users) ? payload.users : []
}

export async function createAdminUser(
  session: AdminSession,
  input: { username: string; email: string; password: string; role: AdminRole },
) {
  return await requestJson<{ message?: string; userId?: number }>(
    `${API_ADMIN_BASE}/users`,
    {
      method: 'POST',
      headers: {
        ...createAdminHeaders(session),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
    '관리자 계정을 생성하지 못했습니다.',
  )
}

export async function updateAdminUser(
  session: AdminSession,
  userId: number,
  input: Partial<Pick<AdminUser, 'username' | 'email' | 'role' | 'is_active'>> & { password?: string },
) {
  return await requestJson<{ message?: string }>(
    `${API_ADMIN_BASE}/users/${userId}`,
    {
      method: 'PATCH',
      headers: {
        ...createAdminHeaders(session),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
    '관리자 계정을 수정하지 못했습니다.',
  )
}

export async function deleteAdminUser(session: AdminSession, userId: number) {
  return await requestJson<{ message?: string }>(
    `${API_ADMIN_BASE}/users/${userId}`,
    {
      method: 'DELETE',
      headers: createAdminHeaders(session),
    },
    '관리자 계정을 삭제하지 못했습니다.',
  )
}

export async function fetchAdminSiteContent(session: AdminSession) {
  const payload = await requestJson<{ entries?: SiteContentEntry[] }>(
    `${API_ADMIN_BASE}/site-content`,
    {
      headers: createAdminHeaders(session),
    },
    '운영 문구를 불러오지 못했습니다.',
  )

  return Array.isArray(payload.entries) ? payload.entries : []
}

export async function updateAdminSiteContent(session: AdminSession, entries: Record<string, string>) {
  const payload = await requestJson<{ entries?: SiteContentEntry[] }>(
    `${API_ADMIN_BASE}/site-content`,
    {
      method: 'PATCH',
      headers: {
        ...createAdminHeaders(session),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ entries }),
    },
    '운영 문구를 저장하지 못했습니다.',
  )

  return Array.isArray(payload.entries) ? payload.entries : []
}

export async function fetchAdminServiceOverview(session: AdminSession) {
  return await requestJson<ServiceOverview>(
    `${API_ADMIN_BASE}/services/overview`,
    {
      headers: createAdminHeaders(session),
    },
    '서비스 관제 정보를 불러오지 못했습니다.',
  )
}

export async function runAdminDeploymentAction(
  session: AdminSession,
  deploymentId: number,
  action: 'start' | 'stop' | 'restart',
) {
  return await requestJson<{ deployment?: ServiceDeployment }>(
    `${API_ADMIN_BASE}/services/deployments/${deploymentId}/${action}`,
    {
      method: 'POST',
      headers: createAdminHeaders(session),
    },
    '배포 상태를 변경하지 못했습니다.',
  )
}

export async function fetchAdminDeploymentLogs(session: AdminSession, deploymentId: number, tail = 300) {
  const payload = await requestJson<{ logs?: string }>(
    `${API_ADMIN_BASE}/services/deployments/${deploymentId}/logs?tail=${tail}`,
    {
      headers: createAdminHeaders(session),
    },
    '배포 로그를 불러오지 못했습니다.',
  )

  return payload.logs ?? ''
}

export async function deleteAdminImage(session: AdminSession, imageId: number) {
  return await requestJson<{ removedImageId?: number }>(
    `${API_ADMIN_BASE}/services/images/${imageId}`,
    {
      method: 'DELETE',
      headers: createAdminHeaders(session),
    },
    '도커 이미지를 삭제하지 못했습니다.',
  )
}

export async function fetchAdminAuditLogs(session: AdminSession, limit = 100) {
  const payload = await requestJson<{ logs?: AuditLogEntry[] }>(
    `${API_ADMIN_BASE}/audit-logs?limit=${limit}`,
    {
      headers: createAdminHeaders(session),
    },
    '감사 로그를 불러오지 못했습니다.',
  )

  return Array.isArray(payload.logs) ? payload.logs : []
}

export async function fetchAdminBackups(session: AdminSession) {
  const payload = await requestJson<{ backups?: AdminBackupItem[] }>(
    `${API_ADMIN_BASE}/backups`,
    {
      headers: createAdminHeaders(session),
    },
    '백업 목록을 불러오지 못했습니다.',
  )

  return Array.isArray(payload.backups) ? payload.backups : []
}

export async function createAdminBackup(
  session: AdminSession,
  options: { includeProjects?: boolean; includeUsers?: boolean; includeAuditLogs?: boolean } = {},
) {
  return await requestJson<{ backup?: AdminBackupItem }>(
    `${API_ADMIN_BASE}/backups/create`,
    {
      method: 'POST',
      headers: {
        ...createAdminHeaders(session),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options),
    },
    '백업 생성에 실패했습니다.',
  )
}

export async function deleteAdminBackup(session: AdminSession, backupId: string) {
  return await requestJson<{ message?: string }>(
    `${API_ADMIN_BASE}/backups/${backupId}`,
    {
      method: 'DELETE',
      headers: createAdminHeaders(session),
    },
    '백업을 삭제하지 못했습니다.',
  )
}

export async function downloadAdminBackup(session: AdminSession, backupId: string) {
  const response = await fetch(`${API_ADMIN_BASE}/backups/${backupId}/download`, {
    headers: createAdminHeaders(session),
  })

  if (!response.ok) {
    throw new Error(await extractApiError(response, '백업을 다운로드하지 못했습니다.'))
  }

  const blob = await response.blob()
  const disposition = response.headers.get('content-disposition') || ''
  const match = disposition.match(/filename=\"?([^"]+)\"?/)
  return {
    blob,
    filename: match?.[1] || `jbhub-backup-${backupId}.sql`,
  }
}
