export type HubRole = 'member' | 'admin'

export interface HubSession {
  id: string
  username: string
  name: string
  department: string
  role: HubRole
  loginAt: string
}

export interface HubDemoAccount {
  id: string
  username: string
  password: string
  name: string
  department: string
  role: HubRole
  title: string
  description: string
}

export interface HubAuthenticationResult {
  success: boolean
  session?: HubSession
  error?: string
}

export const HUB_SESSION_STORAGE_KEY = 'jbhub:hub-session'

const DEMO_ACCOUNTS: HubDemoAccount[] = [
  {
    id: 'member-jkim',
    username: 'jkim',
    password: 'demo1234',
    name: 'J. Kim',
    department: 'IT 디지털',
    role: 'member',
    title: '기본 협업 계정',
    description: '프로젝트 탐색과 일반 사용자 화면을 확인할 때 사용합니다.',
  },
  {
    id: 'member-ops',
    username: 'hlee',
    password: 'demo1234',
    name: 'H. Lee',
    department: '운영지원팀',
    role: 'member',
    title: '운영지원 계정',
    description: '다른 부서 사용자 시나리오와 개인 화면을 점검할 때 사용합니다.',
  },
  {
    id: 'admin-main',
    username: 'admin',
    password: 'admin1234',
    name: '운영 관리자',
    department: '운영팀',
    role: 'admin',
    title: '관리자 계정',
    description: '허브 로그인 후 관리자 콘솔과 운영 기능까지 함께 확인할 수 있습니다.',
  },
]

const LEGACY_ADMIN_ALIASES = [
  { username: 'admin', password: 'admin' },
  { username: '1', password: '1' },
] as const

function normalizeUsername(value: string) {
  return value.trim().toLowerCase()
}

function isHubRole(value: unknown): value is HubRole {
  return value === 'member' || value === 'admin'
}

function isHubSession(value: unknown): value is HubSession {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    typeof record.username === 'string' &&
    typeof record.name === 'string' &&
    typeof record.department === 'string' &&
    typeof record.loginAt === 'string' &&
    isHubRole(record.role)
  )
}

function createSession(account: HubDemoAccount): HubSession {
  return {
    id: `${account.id}-${Date.now()}`,
    username: account.username,
    name: account.name,
    department: account.department,
    role: account.role,
    loginAt: new Date().toISOString(),
  }
}

function resolveDemoAccount(username: string, password: string) {
  const normalizedUsername = normalizeUsername(username)
  const trimmedPassword = password.trim()

  const matchedDemoAccount = DEMO_ACCOUNTS.find(
    (account) => normalizeUsername(account.username) === normalizedUsername && account.password === trimmedPassword,
  )

  if (matchedDemoAccount) {
    return matchedDemoAccount
  }

  const matchedLegacyAdmin = LEGACY_ADMIN_ALIASES.some(
    (account) => normalizeUsername(account.username) === normalizedUsername && account.password === trimmedPassword,
  )

  if (!matchedLegacyAdmin) {
    return null
  }

  return DEMO_ACCOUNTS.find((account) => account.role === 'admin') ?? null
}

export function listHubDemoAccounts() {
  return DEMO_ACCOUNTS.map((account) => ({ ...account }))
}

export function authenticateHubUser(username: string, password: string): HubAuthenticationResult {
  const trimmedUsername = username.trim()
  const trimmedPassword = password.trim()

  if (!trimmedUsername || !trimmedPassword) {
    return {
      success: false,
      error: '아이디와 비밀번호를 모두 입력해 주세요.',
    }
  }

  const account = resolveDemoAccount(trimmedUsername, trimmedPassword)
  if (!account) {
    return {
      success: false,
      error: '등록된 데모 계정을 찾을 수 없습니다. 오른쪽 안내 카드에서 계정을 선택해 주세요.',
    }
  }

  return {
    success: true,
    session: createSession(account),
  }
}

export function restoreHubSession() {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = window.localStorage.getItem(HUB_SESSION_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!isHubSession(parsed)) {
      window.localStorage.removeItem(HUB_SESSION_STORAGE_KEY)
      return null
    }

    return parsed
  } catch {
    window.localStorage.removeItem(HUB_SESSION_STORAGE_KEY)
    return null
  }
}

export function persistHubSession(session: HubSession | null) {
  if (typeof window === 'undefined') {
    return
  }

  if (!session) {
    window.localStorage.removeItem(HUB_SESSION_STORAGE_KEY)
    return
  }

  window.localStorage.setItem(HUB_SESSION_STORAGE_KEY, JSON.stringify(session))
}
