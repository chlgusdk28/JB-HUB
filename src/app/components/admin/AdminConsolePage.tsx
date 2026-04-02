import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Download, Loader2, Pencil, Plus, RefreshCw, Save, Shield, Trash2, UserPlus } from 'lucide-react'
import { AdminAirgapOperationsPanel } from './AdminAirgapOperationsPanel'
import { useToast } from '../ToastProvider'
import { OpalButton } from '../opal'
import { Pill, PlatformFrame, type NavigationSection } from '../common'
import {
  createAdminBackup,
  createAdminProject,
  createAdminUser,
  deleteAdminBackup,
  deleteAdminImage,
  deleteAdminProject,
  deleteAdminUser,
  downloadAdminBackup,
  fetchAdminAuditLogs,
  fetchAdminBackups,
  fetchAdminDeploymentLogs,
  fetchAdminHealth,
  fetchAdminProjects,
  fetchAdminServiceOverview,
  fetchAdminSiteContent,
  fetchAdminStats,
  fetchAdminUsers,
  loginAdmin,
  logoutAdmin,
  runAdminDeploymentAction,
  updateAdminProject,
  updateAdminSiteContent,
  updateAdminUser,
  validateAdminSession,
  type AdminProject,
  type AdminRole,
  type AdminSession,
  type AdminStats,
  type AdminUser,
  type AuditLogEntry,
  type AdminBackupItem,
  type ServiceOverview,
  type SiteContentEntry,
} from '../../lib/admin-api'

const ADMIN_STORAGE_KEY = 'jbhub:admin-session'

type AdminTab = 'overview' | 'projects' | 'accounts' | 'content' | 'audit' | 'airgap'

interface Props {
  onNavigateHome: () => void
}

function parseTags(value: string) {
  return value.split(',').map((tag) => tag.trim()).filter(Boolean)
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? value : new Date(parsed).toLocaleString('ko-KR')
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function formatRole(role: AdminRole) {
  if (role === 'super_admin') return '최고 관리자'
  if (role === 'moderator') return '운영자'
  return '관리자'
}

function formatDeploymentAction(action: 'start' | 'stop' | 'restart') {
  if (action === 'start') return '시작'
  if (action === 'stop') return '중지'
  return '재시작'
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function restoreSession() {
  if (typeof window === 'undefined') return null
  const raw = window.sessionStorage.getItem(ADMIN_STORAGE_KEY) ?? window.localStorage.getItem(ADMIN_STORAGE_KEY)
  if (!raw) return null
  try {
    const session = JSON.parse(raw) as AdminSession
    window.localStorage.removeItem(ADMIN_STORAGE_KEY)
    window.sessionStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(session))
    return session
  } catch {
    window.sessionStorage.removeItem(ADMIN_STORAGE_KEY)
    window.localStorage.removeItem(ADMIN_STORAGE_KEY)
    return null
  }
}

function persistSession(session: AdminSession | null) {
  if (typeof window === 'undefined') return
  if (!session) {
    window.sessionStorage.removeItem(ADMIN_STORAGE_KEY)
    window.localStorage.removeItem(ADMIN_STORAGE_KEY)
    return
  }
  window.localStorage.removeItem(ADMIN_STORAGE_KEY)
  window.sessionStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(session))
}

export default function AdminConsolePage({ onNavigateHome }: Props) {
  const toast = useToast()
  const [session, setSession] = useState<AdminSession | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [loggingIn, setLoggingIn] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [tab, setTab] = useState<AdminTab>('overview')
  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
  const [health, setHealth] = useState<{ status: string; checks?: Record<string, unknown> } | null>(null)
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [services, setServices] = useState<ServiceOverview | null>(null)
  const [projects, setProjects] = useState<AdminProject[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [contentEntries, setContentEntries] = useState<SiteContentEntry[]>([])
  const [contentDrafts, setContentDrafts] = useState<Record<string, string>>({})
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])
  const [backups, setBackups] = useState<AdminBackupItem[]>([])
  const [selectedLogs, setSelectedLogs] = useState('')
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [createProjectForm, setCreateProjectForm] = useState({
    title: '',
    description: '',
    author: 'J. Kim',
    department: 'IT Digital',
    tags: 'devops',
  })
  const [editProjectId, setEditProjectId] = useState<number | null>(null)
  const [editProjectForm, setEditProjectForm] = useState(createProjectForm)
  const [createUserForm, setCreateUserForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'admin' as AdminRole,
  })

  const filteredProjects = useMemo(() => {
    const normalized = deferredSearch.trim().toLowerCase()
    if (!normalized) return projects
    return projects.filter((project) =>
      [project.title, project.author, project.department, ...project.tags].join(' ').toLowerCase().includes(normalized),
    )
  }, [deferredSearch, projects])

  const tabMeta: Record<AdminTab, { label: string; description: string }> = {
    overview: {
      label: '운영 개요',
      description: 'API, 데이터베이스, Docker 배포 상태와 최근 배포 현황을 한 화면에서 확인합니다.',
    },
    projects: {
      label: '프로젝트 관리',
      description: '프로젝트 생성, 수정, 삭제와 메타데이터 정리를 빠르게 처리합니다.',
    },
    accounts: {
      label: '계정 관리',
      description: '관리자 계정을 추가하고 권한과 활성 상태를 운영 기준에 맞게 조정합니다.',
    },
    content: {
      label: '문구 편집',
      description: '사이트 홈과 탐색 화면에 노출되는 문구를 실시간으로 수정합니다.',
    },
    audit: {
      label: '로그 및 백업',
      description: '백업 생성, 감사 로그 확인, 백업 다운로드와 삭제를 처리합니다.',
    },
    airgap: {
      label: 'Airgap Ops',
      description: '폐쇄망 빌드 워커, 허용 Base Image, 최근 빌드, 감사 체인을 운영자 관점에서 확인합니다.',
    },
  }

  const navigationSections: NavigationSection<AdminTab>[] = [
    {
      title: '운영 메뉴',
      items: [
        { id: 'overview', label: tabMeta.overview.label, icon: <Shield className="h-4 w-4" />, badge: services?.deployments.length ?? 0 },
        { id: 'projects', label: tabMeta.projects.label, icon: <Pencil className="h-4 w-4" />, badge: projects.length },
        { id: 'accounts', label: tabMeta.accounts.label, icon: <UserPlus className="h-4 w-4" />, badge: users.length },
        { id: 'content', label: tabMeta.content.label, icon: <Save className="h-4 w-4" />, badge: contentEntries.length },
        { id: 'audit', label: tabMeta.audit.label, icon: <Download className="h-4 w-4" />, badge: backups.length },
        { id: 'airgap', label: tabMeta.airgap.label, icon: <Shield className="h-4 w-4" />, badge: stats?.totalAuditLogs ?? 0 },
      ],
    },
  ]

  const activeTabMeta = tabMeta[tab]

  async function refreshAll(currentSession: AdminSession, silent = false) {
    if (!silent) setRefreshing(true)
    try {
      const [nextHealth, nextStats, nextProjects, nextUsers, nextEntries, nextLogs, nextBackups, nextServices] = await Promise.all([
        fetchAdminHealth(),
        fetchAdminStats(currentSession),
        fetchAdminProjects(currentSession),
        fetchAdminUsers(currentSession),
        fetchAdminSiteContent(currentSession),
        fetchAdminAuditLogs(currentSession, 80),
        fetchAdminBackups(currentSession),
        fetchAdminServiceOverview(currentSession).catch(() => ({
          runtime: {
            dockerVersion: null,
            hostContainerCount: 0,
            imageCount: 0,
            deploymentCount: 0,
            containerError: null,
          },
          images: [],
          deployments: [],
          hostContainers: [],
        })),
      ])
      setHealth(nextHealth)
      setStats(nextStats.stats)
      setProjects(nextProjects)
      setUsers(nextUsers)
      setContentEntries(nextEntries)
      setContentDrafts(Object.fromEntries(nextEntries.map((entry) => [entry.key, entry.value])))
      setAuditLogs(nextLogs)
      setBackups(nextBackups)
      setServices(nextServices)
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      const stored = restoreSession()
      if (!stored) {
        if (!cancelled) setCheckingSession(false)
        return
      }

      try {
        await validateAdminSession(stored)
        if (!cancelled) {
          setSession(stored)
          await refreshAll(stored, true)
        }
      } catch {
        persistSession(null)
      } finally {
        if (!cancelled) setCheckingSession(false)
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleLogin() {
    setLoggingIn(true)
    try {
      const nextSession = await loginAdmin(loginForm.username.trim(), loginForm.password)
      persistSession(nextSession)
      setSession(nextSession)
      await refreshAll(nextSession)
      toast.success('관리자 로그인이 완료됐습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '로그인에 실패했습니다.')
    } finally {
      setLoggingIn(false)
      setCheckingSession(false)
    }
  }

  async function handleLogout() {
    if (session) {
      await logoutAdmin(session)
    }
    persistSession(null)
    setSession(null)
    toast.success('로그아웃했습니다.')
  }

  async function handleCreateProject() {
    if (!session) return
    try {
      const created = await createAdminProject(session, {
        title: createProjectForm.title.trim(),
        description: createProjectForm.description.trim(),
        author: createProjectForm.author.trim(),
        department: createProjectForm.department.trim(),
        tags: parseTags(createProjectForm.tags),
      })
      setProjects((current) => [created, ...current])
      setCreateProjectForm({ title: '', description: '', author: 'J. Kim', department: 'IT Digital', tags: 'devops' })
      toast.success('프로젝트를 생성했습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '프로젝트 생성에 실패했습니다.')
    }
  }

  async function handleSaveProject(project: AdminProject) {
    if (!session) return
    try {
      const updated = await updateAdminProject(session, project.id, {
        ...project,
        title: editProjectForm.title.trim(),
        description: editProjectForm.description.trim(),
        author: editProjectForm.author.trim(),
        department: editProjectForm.department.trim(),
        tags: parseTags(editProjectForm.tags),
      })
      setProjects((current) => current.map((item) => (item.id === project.id ? updated : item)))
      setEditProjectId(null)
      toast.success('프로젝트를 저장했습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '프로젝트 저장에 실패했습니다.')
    }
  }

  async function handleDeleteProject(projectId: number) {
    if (!session || !window.confirm('프로젝트를 삭제할까요?')) return
    try {
      await deleteAdminProject(session, projectId)
      setProjects((current) => current.filter((item) => item.id !== projectId))
      toast.success('프로젝트를 삭제했습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '프로젝트 삭제에 실패했습니다.')
    }
  }

  async function handleCreateUser() {
    if (!session) return
    try {
      await createAdminUser(session, createUserForm)
      setUsers(await fetchAdminUsers(session))
      setCreateUserForm({ username: '', email: '', password: '', role: 'admin' })
      toast.success('관리자 계정을 생성했습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '계정 생성에 실패했습니다.')
    }
  }

  async function handleToggleUser(user: AdminUser) {
    if (!session) return
    try {
      await updateAdminUser(session, user.id, { is_active: !user.is_active })
      setUsers(await fetchAdminUsers(session))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '계정 상태 변경에 실패했습니다.')
    }
  }

  async function handleRoleChange(user: AdminUser, role: AdminRole) {
    if (!session) return
    try {
      await updateAdminUser(session, user.id, { role })
      setUsers(await fetchAdminUsers(session))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '권한 변경에 실패했습니다.')
    }
  }

  async function handleDeleteUser(userId: number) {
    if (!session || !window.confirm('계정을 삭제할까요?')) return
    try {
      await deleteAdminUser(session, userId)
      setUsers((current) => current.filter((item) => item.id !== userId))
      toast.success('계정을 삭제했습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '계정 삭제에 실패했습니다.')
    }
  }

  async function handleSaveContent() {
    if (!session) return
    try {
      const updated = await updateAdminSiteContent(session, contentDrafts)
      setContentEntries(updated)
      setContentDrafts(Object.fromEntries(updated.map((entry) => [entry.key, entry.value])))
      toast.success('운영 문구를 저장했습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '문구 저장에 실패했습니다.')
    }
  }

  async function handleDeploymentLogs(deploymentId: number) {
    if (!session) return
    try {
      setSelectedLogs(await fetchAdminDeploymentLogs(session, deploymentId, 400))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '배포 로그 조회에 실패했습니다.')
    }
  }

  async function handleDeploymentAction(deploymentId: number, action: 'start' | 'stop' | 'restart') {
    if (!session) return
    try {
      await runAdminDeploymentAction(session, deploymentId, action)
      setServices(await fetchAdminServiceOverview(session))
      toast.success(`배포 ${formatDeploymentAction(action)} 작업을 완료했습니다.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '배포 제어에 실패했습니다.')
    }
  }

  async function handleDeleteImage(imageId: number) {
    if (!session || !window.confirm('이미지를 삭제할까요?')) return
    try {
      await deleteAdminImage(session, imageId)
      setServices(await fetchAdminServiceOverview(session))
      toast.success('이미지를 삭제했습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '이미지 삭제에 실패했습니다.')
    }
  }

  async function handleCreateBackup() {
    if (!session) return
    try {
      await createAdminBackup(session, { includeProjects: true, includeUsers: true, includeAuditLogs: true })
      setBackups(await fetchAdminBackups(session))
      toast.success('백업을 생성했습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '백업 생성에 실패했습니다.')
    }
  }

  async function handleDownloadBackup(backupId: string) {
    if (!session) return
    try {
      const { blob, filename } = await downloadAdminBackup(session, backupId)
      downloadBlob(blob, filename)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '백업 다운로드에 실패했습니다.')
    }
  }

  async function handleDeleteBackup(backupId: string) {
    if (!session || !window.confirm('백업을 삭제할까요?')) return
    try {
      await deleteAdminBackup(session, backupId)
      setBackups((current) => current.filter((item) => item.id !== backupId))
      toast.success('백업을 삭제했습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '백업 삭제에 실패했습니다.')
    }
  }

  if (checkingSession) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">관리자 세션을 확인하는 중입니다...</div>
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
        <div className="mx-auto max-w-4xl">
          <button type="button" onClick={onNavigateHome} className="glass-inline-button">
            <ArrowLeft className="h-4 w-4" />
            홈으로 돌아가기
          </button>

          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="page-panel">
              <p className="page-header-eyebrow">JB Hub Admin</p>
              <h1 className="mt-4 text-4xl font-black tracking-[-0.05em] text-slate-950">운영 전용 관리자 페이지</h1>
              <p className="mt-3 max-w-2xl text-sm text-slate-600">
                프로젝트 제어, 계정 생성, 문구 수정, 배포 상태 관리, 백업 생성까지 이 화면에서 처리합니다.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Pill variant="subtle">프로젝트 관리</Pill>
                <Pill variant="subtle">Docker 배포</Pill>
                <Pill variant="subtle">백업 및 감사 로그</Pill>
              </div>
            </div>

            <div className="page-panel">
              <h2 className="text-2xl font-black">로그인</h2>
              <div className="mt-5 space-y-3">
                <input
                  value={loginForm.username}
                  onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))}
                  className="form-input-soft"
                  placeholder="아이디"
                />
                <input
                  type="password"
                  value={loginForm.password}
                  onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                  className="form-input-soft"
                  placeholder="비밀번호"
                />
                <OpalButton
                  variant="primary"
                  size="md"
                  className="w-full"
                  onClick={() => void handleLogin()}
                  icon={loggingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                >
                  {loggingIn ? '로그인 중...' : '관리자 로그인'}
                </OpalButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <PlatformFrame
        brandMark={<img src="/Logo.png" alt="" className="platform-brand-image" />}
        brandEyebrow="운영"
        brandTitle="JB Hub Admin"
        brandDescription="서비스 상태, 프로젝트 운영, 계정, 백업까지 한곳에서 다루는 관리자 콘솔입니다."
        navigationSections={navigationSections}
        activeNavigationId={tab}
        onSelectNavigation={setTab}
        headerVariant="simple"
        headerEyebrow="운영 관리자 콘솔"
        headerTitle={activeTabMeta.label}
        headerDescription={activeTabMeta.description}
        headerActions={
          <div className="admin-toolbar">
            <OpalButton variant="secondary" size="sm" onClick={() => void refreshAll(session)} icon={refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}>새로고침</OpalButton>
            <OpalButton variant="secondary" size="sm" onClick={onNavigateHome} icon={<ArrowLeft className="h-4 w-4" />}>홈으로 이동</OpalButton>
            <OpalButton variant="primary" size="sm" onClick={() => void handleLogout()}>로그아웃</OpalButton>
          </div>
        }
        headerMeta={
          <>
            <Pill variant="subtle">Session {session.username}</Pill>
            <Pill variant="subtle">Role {formatRole(session.role)}</Pill>
            <Pill variant="subtle">Health {health?.status ?? '-'}</Pill>
          </>
        }
        sidebarLead={
          <div className="platform-context-card space-y-2">
            <div>
              <p className="platform-context-eyebrow">Admin session</p>
              <p className="platform-context-title">{session.username}</p>
              <p className="platform-context-copy">{activeTabMeta.label}</p>
            </div>
            <div className="space-y-1 text-xs leading-5 text-slate-600">
              <p>Role {formatRole(session.role)}</p>
              <p>Health {health?.status ?? '-'}</p>
              <p>{activeTabMeta.description}</p>
            </div>
          </div>
        }
        sidebarFooter={
          <div className="platform-context-card space-y-2">
            <p className="platform-context-eyebrow">Overview</p>
            <div className="space-y-1 text-xs leading-5 text-slate-600">
              <p>Accounts {users.length} · Content {contentEntries.length} · Backups {backups.length}</p>
              <p>Projects {stats?.totalProjects ?? 0} · Deployments {stats?.totalDeployments ?? 0}</p>
              <p>Logs, backups, and content changes can all be checked from the current console.</p>
            </div>
          </div>
        }
      >
        {tab === 'overview' ? (
          <div className="admin-tab-shell">
            <div className="page-panel">
              <div className="page-summary-strip">
                <div className="page-summary-item">
                  <span className="page-summary-label">API</span>
                  <span className="page-summary-value">{health?.status || '-'}</span>
                </div>
                <div className="page-summary-item">
                  <span className="page-summary-label">DB</span>
                  <span className="page-summary-value">
                    {String((health?.checks as Record<string, { status?: string }> | undefined)?.database?.status || '-')}
                  </span>
                </div>
                <div className="page-summary-item">
                  <span className="page-summary-label">Docker</span>
                  <span className="page-summary-value">{services?.runtime.dockerVersion || '-'}</span>
                </div>
                <div className="page-summary-item">
                  <span className="page-summary-label">이미지</span>
                  <span className="page-summary-value">{services?.runtime.imageCount ?? 0}</span>
                </div>
                <div className="page-summary-item">
                  <span className="page-summary-label">컨테이너</span>
                  <span className="page-summary-value">{services?.runtime.hostContainerCount ?? 0}</span>
                </div>
              </div>
            </div>

            <div className="dashboard-panel-grid-wide">
              <div className="page-panel">
                <h2 className="text-lg font-bold">배포 현황</h2>
                <div className="mt-4 space-y-3">
                  {services?.deployments.map((deployment) => (
                    <div key={deployment.id} className="admin-list-card">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="font-semibold">{deployment.projectTitle}</p>
                          <p className="text-xs text-slate-500">{deployment.imageReference || deployment.originalFileName || '-'}</p>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                            <span>상태 {deployment.status}</span>
                            <span>포트 {deployment.hostPort ?? '-'}</span>
                            <span>시작 {formatDate(deployment.startedAt)}</span>
                          </div>
                          {deployment.errorMessage ? <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{deployment.errorMessage}</p> : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <OpalButton variant="secondary" size="sm" onClick={() => void handleDeploymentLogs(deployment.id)}>로그</OpalButton>
                          <OpalButton variant="secondary" size="sm" onClick={() => void handleDeploymentAction(deployment.id, 'start')}>시작</OpalButton>
                          <OpalButton variant="secondary" size="sm" onClick={() => void handleDeploymentAction(deployment.id, 'restart')}>재시작</OpalButton>
                          <OpalButton variant="secondary" size="sm" onClick={() => void handleDeploymentAction(deployment.id, 'stop')}>중지</OpalButton>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="page-panel">
                  <h2 className="text-lg font-bold">배포 로그</h2>
                  <pre className="mt-4 max-h-[28rem] overflow-auto rounded-2xl bg-slate-950 px-4 py-4 text-xs text-slate-100">{selectedLogs || '배포를 선택하면 로그가 여기에 표시됩니다.'}</pre>
                </div>

                <div className="page-panel">
                  <h2 className="text-lg font-bold">업로드된 이미지</h2>
                  <div className="mt-4 space-y-3">
                    {services?.images.map((image) => (
                      <div key={image.id} className="admin-list-card">
                        <p className="font-semibold">{image.projectTitle}</p>
                        <p className="text-xs text-slate-500">{image.imageReference || image.originalFileName}</p>
                        <p className="mt-2 text-xs text-slate-500">{image.sizeFormatted} · {image.loadStatus}</p>
                        <div className="mt-3"><OpalButton variant="secondary" size="sm" onClick={() => void handleDeleteImage(image.id)} icon={<Trash2 className="h-4 w-4" />}>이미지 삭제</OpalButton></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'projects' ? (
          <div className="admin-tab-shell">
            <div className="page-panel space-y-4">
              <div className="page-summary-strip">
                <div className="page-summary-item">
                  <span className="page-summary-label">전체 프로젝트</span>
                  <span className="page-summary-value">{projects.length}</span>
                </div>
                <div className="page-summary-item">
                  <span className="page-summary-label">표시 결과</span>
                  <span className="page-summary-value">{filteredProjects.length}</span>
                </div>
                <div className="page-summary-item">
                  <span className="page-summary-label">총 배포</span>
                  <span className="page-summary-value">{stats?.totalDeployments ?? 0}</span>
                </div>
              </div>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem]">
                <input value={search} onChange={(event) => setSearch(event.target.value)} className="form-input-soft" placeholder="프로젝트 검색" />
                <div className="inline-flex items-center justify-center rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold">결과 {filteredProjects.length}개</div>
              </div>
            </div>

            <details className="page-panel">
              <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                프로젝트 생성 열기
              </summary>
              <p className="mt-2 text-xs leading-5 text-slate-500">필요할 때만 새 프로젝트 등록 폼을 펼치도록 정리했습니다.</p>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <input value={createProjectForm.title} onChange={(event) => setCreateProjectForm((current) => ({ ...current, title: event.target.value }))} className="form-input-soft" placeholder="제목" />
                <input value={createProjectForm.author} onChange={(event) => setCreateProjectForm((current) => ({ ...current, author: event.target.value }))} className="form-input-soft" placeholder="작성자" />
                <input value={createProjectForm.department} onChange={(event) => setCreateProjectForm((current) => ({ ...current, department: event.target.value }))} className="form-input-soft" placeholder="부서" />
                <input value={createProjectForm.tags} onChange={(event) => setCreateProjectForm((current) => ({ ...current, tags: event.target.value }))} className="form-input-soft" placeholder="태그" />
                <textarea value={createProjectForm.description} onChange={(event) => setCreateProjectForm((current) => ({ ...current, description: event.target.value }))} className="form-textarea-soft lg:col-span-2" placeholder="설명" />
              </div>
              <div className="mt-4"><OpalButton variant="primary" size="sm" onClick={() => void handleCreateProject()} icon={<Plus className="h-4 w-4" />}>프로젝트 생성</OpalButton></div>
            </details>

            {filteredProjects.map((project) => (
              <div key={project.id} className="page-panel">
                {editProjectId === project.id ? (
                  <div className="grid gap-3 lg:grid-cols-2">
                    <input value={editProjectForm.title} onChange={(event) => setEditProjectForm((current) => ({ ...current, title: event.target.value }))} className="form-input-soft" />
                    <input value={editProjectForm.author} onChange={(event) => setEditProjectForm((current) => ({ ...current, author: event.target.value }))} className="form-input-soft" />
                    <input value={editProjectForm.department} onChange={(event) => setEditProjectForm((current) => ({ ...current, department: event.target.value }))} className="form-input-soft" />
                    <input value={editProjectForm.tags} onChange={(event) => setEditProjectForm((current) => ({ ...current, tags: event.target.value }))} className="form-input-soft" />
                    <textarea value={editProjectForm.description} onChange={(event) => setEditProjectForm((current) => ({ ...current, description: event.target.value }))} className="form-textarea-soft lg:col-span-2" />
                    <div className="flex gap-2 lg:col-span-2"><OpalButton variant="primary" size="sm" onClick={() => void handleSaveProject(project)} icon={<Save className="h-4 w-4" />}>저장</OpalButton><OpalButton variant="secondary" size="sm" onClick={() => setEditProjectId(null)}>취소</OpalButton></div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div><p className="text-lg font-bold">{project.title}</p><p className="mt-1 text-sm text-slate-600">{project.description}</p><p className="mt-2 text-xs text-slate-500">{project.author} · {project.department} · 별표 {project.stars}</p></div>
                    <div className="flex flex-wrap gap-2">
                      <OpalButton variant="secondary" size="sm" onClick={() => { setEditProjectId(project.id); setEditProjectForm({ title: project.title, description: project.description, author: project.author, department: project.department, tags: project.tags.join(', ') }) }} icon={<Pencil className="h-4 w-4" />}>편집</OpalButton>
                      <OpalButton variant="secondary" size="sm" onClick={() => void handleDeleteProject(project.id)} icon={<Trash2 className="h-4 w-4" />}>삭제</OpalButton>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : null}

        {tab === 'accounts' ? (
          <div className="admin-tab-shell">
            <div className="page-panel">
              <div className="page-summary-strip">
                <div className="page-summary-item">
                  <span className="page-summary-label">전체 계정</span>
                  <span className="page-summary-value">{users.length}</span>
                </div>
                <div className="page-summary-item">
                  <span className="page-summary-label">활성 계정</span>
                  <span className="page-summary-value">{users.filter((user) => user.is_active).length}</span>
                </div>
                <div className="page-summary-item">
                  <span className="page-summary-label">권한 유형</span>
                  <span className="page-summary-value">3</span>
                </div>
              </div>
            </div>

            <details className="page-panel">
              <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                관리자 계정 생성 열기
              </summary>
              <p className="mt-2 text-xs leading-5 text-slate-500">계정 생성은 기본으로 접어 두고, 운영 목록을 먼저 확인할 수 있게 했습니다.</p>
              <div className="mt-4 grid gap-3 lg:grid-cols-4">
                <input value={createUserForm.username} onChange={(event) => setCreateUserForm((current) => ({ ...current, username: event.target.value }))} className="form-input-soft" placeholder="아이디" />
                <input value={createUserForm.email} onChange={(event) => setCreateUserForm((current) => ({ ...current, email: event.target.value }))} className="form-input-soft" placeholder="이메일" />
                <input type="password" value={createUserForm.password} onChange={(event) => setCreateUserForm((current) => ({ ...current, password: event.target.value }))} className="form-input-soft" placeholder="비밀번호" />
                <select value={createUserForm.role} onChange={(event) => setCreateUserForm((current) => ({ ...current, role: event.target.value as AdminRole }))} className="form-select-soft"><option value="super_admin">super_admin</option><option value="admin">admin</option><option value="moderator">moderator</option></select>
              </div>
              <div className="mt-4"><OpalButton variant="primary" size="sm" onClick={() => void handleCreateUser()} icon={<UserPlus className="h-4 w-4" />}>계정 생성</OpalButton></div>
            </details>

            {users.map((user) => (
              <div key={user.id} className="page-panel">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div><p className="font-semibold">{user.username}</p><p className="text-sm text-slate-600">{user.email}</p><p className="mt-1 text-xs text-slate-500">생성 {formatDate(user.created_at)} · 최근 로그인 {formatDate(user.last_login_at)}</p></div>
                  <div className="flex flex-wrap gap-2">
                    <select value={user.role} onChange={(event) => void handleRoleChange(user, event.target.value as AdminRole)} className="form-select-soft rounded-full px-3 py-2 text-sm font-semibold"><option value="super_admin">super_admin</option><option value="admin">admin</option><option value="moderator">moderator</option></select>
                    <button type="button" onClick={() => void handleToggleUser(user)} className={`rounded-full px-3 py-2 text-sm font-semibold ${user.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>{user.is_active ? '활성' : '비활성'}</button>
                    <OpalButton variant="secondary" size="sm" onClick={() => void handleDeleteUser(user.id)} icon={<Trash2 className="h-4 w-4" />}>삭제</OpalButton>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {tab === 'content' ? (
          <div className="admin-tab-shell">
            <div className="page-panel flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="page-summary-strip">
                <div className="page-summary-item">
                  <span className="page-summary-label">관리 항목</span>
                  <span className="page-summary-value">{contentEntries.length}</span>
                </div>
                <div className="page-summary-item">
                  <span className="page-summary-label">긴 문구</span>
                  <span className="page-summary-value">{contentEntries.filter((entry) => entry.isMultiline).length}</span>
                </div>
                <div className="page-summary-item">
                  <span className="page-summary-label">짧은 문구</span>
                  <span className="page-summary-value">{contentEntries.filter((entry) => !entry.isMultiline).length}</span>
                </div>
              </div>
              <OpalButton variant="primary" size="sm" onClick={() => void handleSaveContent()} icon={<Save className="h-4 w-4" />}>문구 저장</OpalButton>
            </div>
            {contentEntries.map((entry) => (
              <div key={entry.key} className="page-panel">
                <p className="font-semibold">{entry.label}</p>
                <p className="mt-1 text-xs text-slate-500">{entry.description}</p>
                {entry.isMultiline ? (
                  <textarea value={contentDrafts[entry.key] ?? ''} onChange={(event) => setContentDrafts((current) => ({ ...current, [entry.key]: event.target.value }))} className="form-textarea-soft mt-3" />
                ) : (
                  <input value={contentDrafts[entry.key] ?? ''} onChange={(event) => setContentDrafts((current) => ({ ...current, [entry.key]: event.target.value }))} className="form-input-soft mt-3" />
                )}
              </div>
            ))}
          </div>
        ) : null}

        {tab === 'audit' ? (
          <div className="admin-tab-shell">
            <div className="page-panel space-y-4">
              <div className="flex items-center justify-between">
                <div><h2 className="text-lg font-bold">백업</h2><p className="text-sm text-slate-500">운영 데이터를 백업하고 내려받을 수 있습니다.</p></div>
                <OpalButton variant="primary" size="sm" onClick={() => void handleCreateBackup()} icon={<Plus className="h-4 w-4" />}>백업 생성</OpalButton>
              </div>
              <div className="page-summary-strip">
                <div className="page-summary-item">
                  <span className="page-summary-label">백업 수</span>
                  <span className="page-summary-value">{backups.length}</span>
                </div>
                <div className="page-summary-item">
                  <span className="page-summary-label">감사 로그</span>
                  <span className="page-summary-value">{auditLogs.length}</span>
                </div>
                <div className="page-summary-item">
                  <span className="page-summary-label">상태</span>
                  <span className="page-summary-value">{health?.status ?? '-'}</span>
                </div>
              </div>
              <div className="space-y-3">
                {backups.map((backup) => (
                  <div key={backup.id} className="admin-list-card">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div><p className="font-semibold">{backup.name}</p><p className="text-xs text-slate-500">{backup.filename} · {formatBytes(backup.size)} · {formatDate(backup.createdAt)}</p></div>
                      <div className="flex flex-wrap gap-2"><OpalButton variant="secondary" size="sm" onClick={() => void handleDownloadBackup(backup.id)} icon={<Download className="h-4 w-4" />}>다운로드</OpalButton><OpalButton variant="secondary" size="sm" onClick={() => void handleDeleteBackup(backup.id)} icon={<Trash2 className="h-4 w-4" />}>삭제</OpalButton></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="page-panel">
              <h2 className="text-lg font-bold">감사 로그</h2>
              <div className="mt-4 space-y-3">
                {auditLogs.map((log) => (
                  <div key={log.id} className="admin-list-card">
                    <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between"><p className="font-semibold">{log.action}</p><p className="text-xs text-slate-500">{formatDate(log.created_at)}</p></div>
                    {log.details ? <pre className="mt-3 overflow-auto rounded-xl bg-slate-50 px-3 py-3 text-xs text-slate-600">{JSON.stringify(log.details, null, 2)}</pre> : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'airgap' ? <AdminAirgapOperationsPanel session={session} /> : null}
      </PlatformFrame>
    </div>
  )
}
