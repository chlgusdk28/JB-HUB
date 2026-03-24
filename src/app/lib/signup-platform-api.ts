import { getApiBase } from './api-base'

const API_V1_BASE = getApiBase('/api/v1')
const API_ADMIN_BASE = getApiBase('/api/admin')

export type SignupApplicationStatus = 'pending' | 'approved' | 'rejected'

export interface SignupApplication {
  id: number
  name: string
  email: string
  phone: string | null
  organization: string
  department: string | null
  positionTitle: string | null
  message: string | null
  status: SignupApplicationStatus
  reviewNote: string | null
  reviewerName: string | null
  reviewedAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

export interface SignupPlatformCounts {
  total: number
  pending: number
  approved: number
  rejected: number
}

export interface SignupPlatformSummary {
  headline: string
  counts: SignupPlatformCounts
  approvedApplications: SignupApplication[]
}

export interface SignupAdminSession {
  username: string
  role: 'admin' | 'member'
  accessToken: string
  refreshToken: string
  sessionId: string
}

export interface SignupApplicationInput {
  name: string
  email: string
  phone: string
  organization: string
  department: string
  positionTitle: string
  message: string
}

function createAdminHeaders(session: SignupAdminSession) {
  return {
    Authorization: `Bearer ${session.accessToken}`,
    'x-admin-session': session.sessionId,
    'Content-Type': 'application/json',
  }
}

async function extractApiError(response: Response, fallbackMessage: string) {
  try {
    const payload = (await response.json()) as { error?: unknown }
    if (typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error
    }
  } catch {
    // Use fallback message.
  }

  return fallbackMessage
}

export async function fetchSignupPlatformSummary(): Promise<SignupPlatformSummary> {
  const response = await fetch(`${API_V1_BASE}/signup-platform`)
  if (!response.ok) {
    throw new Error(await extractApiError(response, '가입 플랫폼 정보를 불러오지 못했습니다.'))
  }

  const payload = (await response.json()) as { platform?: SignupPlatformSummary }
  if (!payload.platform) {
    throw new Error('가입 플랫폼 응답 형식이 올바르지 않습니다.')
  }

  return payload.platform
}

export async function submitSignupApplication(input: SignupApplicationInput) {
  const response = await fetch(`${API_V1_BASE}/signup-applications`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw new Error(await extractApiError(response, '가입 신청을 접수하지 못했습니다.'))
  }

  return (await response.json()) as {
    application: SignupApplication
    counts: SignupPlatformCounts
  }
}

export async function loginSignupAdmin(username: string, password: string): Promise<SignupAdminSession> {
  const response = await fetch(`${API_ADMIN_BASE}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  })

  if (!response.ok) {
    throw new Error(await extractApiError(response, '운영자 로그인에 실패했습니다.'))
  }

  const payload = (await response.json()) as {
    accessToken?: string
    refreshToken?: string
    sessionId?: string
    user?: { username?: string; role?: string }
  }

  if (!payload.accessToken || !payload.refreshToken || !payload.sessionId) {
    throw new Error('운영자 로그인 응답 형식이 올바르지 않습니다.')
  }

  return {
    username:
      typeof payload.user?.username === 'string' && payload.user.username.trim().length > 0
        ? payload.user.username.trim()
        : username,
    role: payload.user?.role === 'admin' || payload.user?.role === 'super_admin' ? 'admin' : 'member',
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    sessionId: payload.sessionId,
  }
}

export async function validateSignupAdminSession(session: SignupAdminSession) {
  const response = await fetch(`${API_ADMIN_BASE}/me`, {
    headers: createAdminHeaders(session),
  })

  if (!response.ok) {
    throw new Error(await extractApiError(response, '운영자 세션이 유효하지 않습니다.'))
  }

  return (await response.json()) as {
    user?: { id?: number; username?: string; role?: string }
  }
}

export async function logoutSignupAdmin(session: SignupAdminSession) {
  await fetch(`${API_ADMIN_BASE}/logout`, {
    method: 'POST',
    headers: createAdminHeaders(session),
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  }).catch(() => undefined)
}

export async function fetchSignupApplications(
  session: SignupAdminSession,
  options: { status?: SignupApplicationStatus | 'all'; search?: string } = {},
) {
  const params = new URLSearchParams()
  if (options.status && options.status !== 'all') {
    params.set('status', options.status)
  }
  if (options.search?.trim()) {
    params.set('search', options.search.trim())
  }

  const response = await fetch(
    `${API_ADMIN_BASE}/signup-applications${params.toString() ? `?${params.toString()}` : ''}`,
    {
      headers: createAdminHeaders(session),
    },
  )

  if (!response.ok) {
    throw new Error(await extractApiError(response, '가입 신청 목록을 불러오지 못했습니다.'))
  }

  return (await response.json()) as {
    applications: SignupApplication[]
    counts: SignupPlatformCounts
  }
}

export async function reviewSignupApplication(
  session: SignupAdminSession,
  applicationId: number,
  payload: { status: SignupApplicationStatus; reviewNote?: string },
) {
  const response = await fetch(`${API_ADMIN_BASE}/signup-applications/${applicationId}`, {
    method: 'PATCH',
    headers: createAdminHeaders(session),
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(await extractApiError(response, '가입 신청 상태를 변경하지 못했습니다.'))
  }

  return (await response.json()) as {
    application: SignupApplication
    counts: SignupPlatformCounts
  }
}

export async function deleteSignupApplication(session: SignupAdminSession, applicationId: number) {
  const response = await fetch(`${API_ADMIN_BASE}/signup-applications/${applicationId}`, {
    method: 'DELETE',
    headers: createAdminHeaders(session),
  })

  if (!response.ok) {
    throw new Error(await extractApiError(response, '가입 신청을 삭제하지 못했습니다.'))
  }

  return (await response.json()) as {
    removedApplicationId: number
    counts: SignupPlatformCounts
  }
}
