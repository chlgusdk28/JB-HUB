import { FormEvent, useMemo, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { CheckCircle2, Edit3, FolderGit2, Save, Search, Settings2, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react'
import { OpalButton } from './opal/OpalButton'
import { OpalCard } from './opal/OpalCard'
import { Pill } from './common'
import { usePersistentState } from '../hooks/usePersistentState'
import type { Project } from '../lib/project-utils'

type AdminTab = 'members' | 'projects' | 'settings'
type MemberRole = 'member' | 'manager' | 'admin'

interface AdminMember {
  id: number
  name: string
  username: string
  email: string
  role: MemberRole
  isActive: boolean
  joinedAt: string
  lastLoginAt: string
}

interface PlatformSettings {
  registrationOpen: boolean
  maintenanceMode: boolean
  allowProjectCreation: boolean
  auditLogEnabled: boolean
  notifyOnNewProject: boolean
  maxUploadMb: number
  defaultVisibility: 'private' | 'department' | 'public'
}

interface ProjectDraft {
  title: string
  description: string
  author: string
  department: string
  tags: string
}

interface NormalizedProject {
  id: string
  title: string
  description: string
  author: string
  department: string
  stars: number
  views: number
  tags: string[]
  isNew: boolean
  createdAt: string
}

interface AdminControlPageProps {
  projects: Project[]
  onProjectsChange: (updater: (prev: Project[]) => Project[]) => void
  onToast?: (message: string) => void
  currentAdminName: string
}

const DEFAULT_MEMBERS: AdminMember[] = [
  {
    id: 1,
    name: '운영 관리자',
    username: '1',
    email: 'admin@jb-hub.local',
    role: 'admin',
    isActive: true,
    joinedAt: '2026-01-02T09:00:00.000Z',
    lastLoginAt: new Date().toISOString(),
  },
  {
    id: 2,
    name: '프로젝트 매니저',
    username: 'pm',
    email: 'pm@jb-hub.local',
    role: 'manager',
    isActive: true,
    joinedAt: '2026-01-05T09:00:00.000Z',
    lastLoginAt: new Date(Date.now() - 1000 * 60 * 60 * 7).toISOString(),
  },
  {
    id: 3,
    name: '일반 회원',
    username: 'member',
    email: 'member@jb-hub.local',
    role: 'member',
    isActive: true,
    joinedAt: '2026-01-10T09:00:00.000Z',
    lastLoginAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
  },
]

const DEFAULT_SETTINGS: PlatformSettings = {
  registrationOpen: true,
  maintenanceMode: false,
  allowProjectCreation: true,
  auditLogEnabled: true,
  notifyOnNewProject: true,
  maxUploadMb: 50,
  defaultVisibility: 'department',
}

const EMPTY_PROJECT_DRAFT: ProjectDraft = {
  title: '',
  description: '',
  author: '',
  department: '',
  tags: '',
}

const ADMIN_TAB_ORDER: AdminTab[] = ['members', 'projects', 'settings']

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  return value as Record<string, unknown>
}

function toText(value: unknown, fallback = '') {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number') {
    return String(value)
  }
  return fallback
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

function toBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    if (value === 'true' || value === '1') {
      return true
    }
    if (value === 'false' || value === '0') {
      return false
    }
  }
  if (typeof value === 'number') {
    return value === 1
  }
  return fallback
}

function parseTagsInput(input: string) {
  return input
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag, index, tags) => tags.indexOf(tag) === index)
}

function getAuthorLabel(author: unknown) {
  if (typeof author === 'string') {
    return author
  }
  const authorRecord = asRecord(author)
  if (authorRecord && typeof authorRecord.name === 'string') {
    return authorRecord.name
  }
  return '작성자 미상'
}

function formatDate(value: string) {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return '-'
  }
  return new Date(parsed).toLocaleString('ko-KR')
}

function normalizeProject(project: unknown, index: number): NormalizedProject {
  const record = asRecord(project) ?? {}
  const idValue = record.id ?? `project-${index}`

  const tagsValue = Array.isArray(record.tags)
    ? record.tags.filter((tag): tag is string => typeof tag === 'string')
    : []

  return {
    id: String(idValue),
    title: toText(record.title, '제목 없음'),
    description: toText(record.description, ''),
    author: getAuthorLabel(record.author),
    department: toText(record.department, '미지정'),
    stars: toNumber(record.stars, 0),
    views: toNumber(record.views, 0),
    tags: tagsValue,
    isNew: toBoolean(record.isNew ?? record.is_new, false),
    createdAt: toText(record.createdAt ?? record.created_at_label, '-'),
  }
}

function getRoleLabel(role: MemberRole) {
  switch (role) {
    case 'admin':
      return '관리자'
    case 'manager':
      return '매니저'
    case 'member':
    default:
      return '회원'
  }
}

export function AdminControlPage({ projects, onProjectsChange, onToast, currentAdminName }: AdminControlPageProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('members')
  const [members, setMembers] = usePersistentState<AdminMember[]>('jb-hub:admin:members', DEFAULT_MEMBERS)
  const [settings, setSettings] = usePersistentState<PlatformSettings>('jb-hub:admin:settings', DEFAULT_SETTINGS)

  const [memberName, setMemberName] = useState('')
  const [memberUsername, setMemberUsername] = useState('')
  const [memberEmail, setMemberEmail] = useState('')
  const [memberRole, setMemberRole] = useState<MemberRole>('member')

  const [searchQuery, setSearchQuery] = useState('')
  const [newProjectDraft, setNewProjectDraft] = useState<ProjectDraft>(EMPTY_PROJECT_DRAFT)
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [editingDraft, setEditingDraft] = useState<ProjectDraft>(EMPTY_PROJECT_DRAFT)

  const normalizedProjects = useMemo(() => projects.map(normalizeProject), [projects])

  const filteredProjects = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    if (!normalizedQuery) {
      return normalizedProjects
    }

    return normalizedProjects.filter((project) => {
      return (
        project.title.toLowerCase().includes(normalizedQuery) ||
        project.description.toLowerCase().includes(normalizedQuery) ||
        project.author.toLowerCase().includes(normalizedQuery) ||
        project.department.toLowerCase().includes(normalizedQuery) ||
        project.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery))
      )
    })
  }, [normalizedProjects, searchQuery])

  const summary = useMemo(
    () => ({
      members: members.length,
      activeMembers: members.filter((member) => member.isActive).length,
      projects: normalizedProjects.length,
      newProjects: normalizedProjects.filter((project) => project.isNew).length,
      admins: members.filter((member) => member.role === 'admin').length,
    }),
    [members, normalizedProjects],
  )

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, currentTab: AdminTab) => {
    const currentIndex = ADMIN_TAB_ORDER.indexOf(currentTab)
    if (currentIndex < 0) {
      return
    }

    let nextTab: AdminTab | null = null
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextTab = ADMIN_TAB_ORDER[(currentIndex + 1) % ADMIN_TAB_ORDER.length]
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        nextTab = ADMIN_TAB_ORDER[(currentIndex - 1 + ADMIN_TAB_ORDER.length) % ADMIN_TAB_ORDER.length]
        break
      case 'Home':
        nextTab = ADMIN_TAB_ORDER[0]
        break
      case 'End':
        nextTab = ADMIN_TAB_ORDER[ADMIN_TAB_ORDER.length - 1]
        break
      default:
        break
    }

    if (!nextTab) {
      return
    }

    event.preventDefault()
    setActiveTab(nextTab)
    if (typeof document !== 'undefined') {
      window.requestAnimationFrame(() => {
        const nextElement = document.getElementById(`admin-tab-${nextTab}`)
        if (nextElement instanceof HTMLButtonElement) {
          nextElement.focus()
        }
      })
    }
  }

  const handleAddMember = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const normalizedName = memberName.trim()
    const normalizedUsername = memberUsername.trim()
    const normalizedEmail = memberEmail.trim()

    if (!normalizedName || !normalizedUsername || !normalizedEmail) {
      onToast?.('회원 이름, 아이디, 이메일을 모두 입력해 주세요.')
      return
    }

    const newMember: AdminMember = {
      id: Date.now(),
      name: normalizedName,
      username: normalizedUsername,
      email: normalizedEmail,
      role: memberRole,
      isActive: true,
      joinedAt: new Date().toISOString(),
      lastLoginAt: '-',
    }

    setMembers((prev) => [newMember, ...prev])
    setMemberName('')
    setMemberUsername('')
    setMemberEmail('')
    setMemberRole('member')
    onToast?.('새 회원을 추가했습니다.')
  }

  const handleToggleMemberActive = (memberId: number) => {
    setMembers((prev) => prev.map((member) => (member.id === memberId ? { ...member, isActive: !member.isActive } : member)))
  }

  const handleChangeMemberRole = (memberId: number, role: MemberRole) => {
    setMembers((prev) => prev.map((member) => (member.id === memberId ? { ...member, role } : member)))
  }

  const handleDeleteMember = (memberId: number) => {
    const target = members.find((member) => member.id === memberId)
    if (!target) {
      return
    }

    if (target.role === 'admin' && members.filter((member) => member.role === 'admin').length <= 1) {
      onToast?.('최소 1명의 관리자 계정은 유지되어야 합니다.')
      return
    }

    setMembers((prev) => prev.filter((member) => member.id !== memberId))
    onToast?.('회원을 삭제했습니다.')
  }

  const handleCreateProject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const normalizedTitle = newProjectDraft.title.trim()
    if (!normalizedTitle) {
      onToast?.('프로젝트 제목을 입력해 주세요.')
      return
    }

    const createdProject = {
      id: Date.now(),
      title: normalizedTitle,
      description: newProjectDraft.description.trim(),
      author: newProjectDraft.author.trim() || currentAdminName,
      department: newProjectDraft.department.trim() || '미지정',
      stars: 0,
      forks: 0,
      comments: 0,
      views: 0,
      tags: parseTagsInput(newProjectDraft.tags),
      createdAt: '방금 전',
      isNew: true,
      badge: '신규',
    }

    onProjectsChange((prev) => [createdProject, ...prev])
    setNewProjectDraft(EMPTY_PROJECT_DRAFT)
    onToast?.('새 프로젝트를 등록했습니다.')
  }

  const handleStartProjectEdit = (project: NormalizedProject) => {
    setEditingProjectId(project.id)
    setEditingDraft({
      title: project.title,
      description: project.description,
      author: project.author,
      department: project.department,
      tags: project.tags.join(', '),
    })
  }

  const handleSaveProjectEdit = () => {
    if (!editingProjectId) {
      return
    }

    const normalizedTitle = editingDraft.title.trim()
    if (!normalizedTitle) {
      onToast?.('프로젝트 제목을 입력해 주세요.')
      return
    }

    const parsedTags = parseTagsInput(editingDraft.tags)

    onProjectsChange((prev) =>
      prev.map((item, index) => {
        const record = asRecord(item)
        const itemId = record && 'id' in record ? String(record.id) : `project-${index}`

        if (itemId !== editingProjectId) {
          return item
        }

        return {
          ...(record ?? {}),
          id: record?.id ?? editingProjectId,
          title: normalizedTitle,
          description: editingDraft.description.trim(),
          author: editingDraft.author.trim() || '미지정',
          department: editingDraft.department.trim() || '미지정',
          tags: parsedTags,
          updatedAt: new Date().toISOString(),
        }
      }),
    )

    setEditingProjectId(null)
    setEditingDraft(EMPTY_PROJECT_DRAFT)
    onToast?.('프로젝트를 수정했습니다.')
  }

  const handleDeleteProject = (projectId: string) => {
    onProjectsChange((prev) =>
      prev.filter((item, index) => {
        const record = asRecord(item)
        const itemId = record && 'id' in record ? String(record.id) : `project-${index}`
        return itemId !== projectId
      }),
    )
    onToast?.('프로젝트를 삭제했습니다.')
  }

  const handleSaveSettings = () => {
    onToast?.('관리 설정을 저장했습니다.')
  }

  return (
    <div className="page-shell-relaxed">
      <header className="hero-panel">
        <div className="floating-orb-hero-right" />
        <div className="floating-orb-hero-left" />
        <div className="relative z-10 space-y-5">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/45 bg-white/15 px-3 py-1 text-xs font-semibold tracking-[0.08em] text-slate-50">
            Admin Console
            <span className="h-1 w-1 rounded-full bg-slate-200" />
            운영 제어센터
          </p>
          <h1 className="max-w-4xl text-2xl font-bold leading-[1.12] tracking-tight text-white sm:text-3xl lg:text-4xl">
            어드민 페이지
            <span className="text-gradient-brand block">회원, 프로젝트, 전반 설정을 통합 관리합니다.</span>
          </h1>
          <div className="pill-row">
            <Pill>접속 관리자 {currentAdminName}</Pill>
            <Pill>회원 {summary.members}명</Pill>
            <Pill>활성 회원 {summary.activeMembers}명</Pill>
            <Pill>프로젝트 {summary.projects}개</Pill>
            <Pill>신규 프로젝트 {summary.newProjects}개</Pill>
            <Pill>관리자 계정 {summary.admins}명</Pill>
          </div>
        </div>
      </header>

      <div className="action-row" role="tablist" aria-label="어드민 관리 탭">
        <button
          id="admin-tab-members"
          type="button"
          role="tab"
          aria-selected={activeTab === 'members'}
          aria-controls="admin-panel-members"
          tabIndex={activeTab === 'members' ? 0 : -1}
          onClick={() => setActiveTab('members')}
          onKeyDown={(event) => handleTabKeyDown(event, 'members')}
          className={`chip-filter inline-flex items-center gap-1.5 ${activeTab === 'members' ? 'chip-filter-active' : 'chip-filter-idle'}`}
        >
          <Users className="h-3.5 w-3.5" /> 회원관리
        </button>
        <button
          id="admin-tab-projects"
          type="button"
          role="tab"
          aria-selected={activeTab === 'projects'}
          aria-controls="admin-panel-projects"
          tabIndex={activeTab === 'projects' ? 0 : -1}
          onClick={() => setActiveTab('projects')}
          onKeyDown={(event) => handleTabKeyDown(event, 'projects')}
          className={`chip-filter inline-flex items-center gap-1.5 ${activeTab === 'projects' ? 'chip-filter-active' : 'chip-filter-idle'}`}
        >
          <FolderGit2 className="h-3.5 w-3.5" /> 프로젝트 관리
        </button>
        <button
          id="admin-tab-settings"
          type="button"
          role="tab"
          aria-selected={activeTab === 'settings'}
          aria-controls="admin-panel-settings"
          tabIndex={activeTab === 'settings' ? 0 : -1}
          onClick={() => setActiveTab('settings')}
          onKeyDown={(event) => handleTabKeyDown(event, 'settings')}
          className={`chip-filter inline-flex items-center gap-1.5 ${activeTab === 'settings' ? 'chip-filter-active' : 'chip-filter-idle'}`}
        >
          <Settings2 className="h-3.5 w-3.5" /> 전역 설정
        </button>
      </div>

      {activeTab === 'members' ? (
        <div id="admin-panel-members" role="tabpanel" aria-labelledby="admin-tab-members" className="space-y-4">
          <OpalCard elevation="minimal" padding="comfortable">
            <form onSubmit={handleAddMember} className="grid grid-cols-1 gap-3 lg:grid-cols-5">
              <input
                value={memberName}
                onChange={(event) => setMemberName(event.target.value)}
                placeholder="이름"
                className="select-soft"
              />
              <input
                value={memberUsername}
                onChange={(event) => setMemberUsername(event.target.value)}
                placeholder="아이디"
                className="select-soft"
              />
              <input
                value={memberEmail}
                onChange={(event) => setMemberEmail(event.target.value)}
                placeholder="이메일"
                className="select-soft"
              />
              <select
                value={memberRole}
                onChange={(event) => setMemberRole(event.target.value as MemberRole)}
                className="select-soft"
              >
                <option value="member">회원</option>
                <option value="manager">매니저</option>
                <option value="admin">관리자</option>
              </select>
              <OpalButton type="submit" variant="primary" size="sm" icon={<UserPlus className="h-4 w-4" />}>
                회원 추가
              </OpalButton>
            </form>
          </OpalCard>

          <div className="space-y-3">
            {members.map((member) => (
              <OpalCard key={member.id} elevation="minimal" padding="compact">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <p className="text-base font-semibold text-slate-900">
                      {member.name} <span className="text-sm font-medium text-slate-500">@{member.username}</span>
                    </p>
                    <p className="text-sm text-slate-600">{member.email}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>가입일 {formatDate(member.joinedAt)}</span>
                      <span>최근 로그인 {member.lastLoginAt === '-' ? '-' : formatDate(member.lastLoginAt)}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        member.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {member.isActive ? '활성' : '비활성'}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {getRoleLabel(member.role)}
                    </span>
                    <select
                      value={member.role}
                      onChange={(event) => handleChangeMemberRole(member.id, event.target.value as MemberRole)}
                      className="select-soft !w-auto !py-1.5"
                    >
                      <option value="member">회원</option>
                      <option value="manager">매니저</option>
                      <option value="admin">관리자</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleToggleMemberActive(member.id)}
                      className="chip-filter chip-filter-idle"
                    >
                      {member.isActive ? '비활성화' : '활성화'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteMember(member.id)}
                      className="chip-filter chip-filter-idle text-rose-700"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </OpalCard>
            ))}
          </div>
        </div>
      ) : null}

      {activeTab === 'projects' ? (
        <div id="admin-panel-projects" role="tabpanel" aria-labelledby="admin-tab-projects" className="space-y-4">
          <OpalCard elevation="minimal" padding="comfortable">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="프로젝트 검색 (제목, 작성자, 부서, 태그)"
                  className="w-full rounded-xl border border-slate-300 bg-white/90 py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none ring-slate-200 transition focus:border-slate-500 focus:ring-2"
                />
              </div>
              <div className="inline-flex items-center rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-600">
                결과 {filteredProjects.length}개
              </div>
            </div>
          </OpalCard>

          <OpalCard elevation="minimal" padding="comfortable">
            <form onSubmit={handleCreateProject} className="grid grid-cols-1 gap-3 lg:grid-cols-5">
              <input
                value={newProjectDraft.title}
                onChange={(event) => setNewProjectDraft((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="새 프로젝트 제목"
                className="select-soft lg:col-span-2"
              />
              <input
                value={newProjectDraft.author}
                onChange={(event) => setNewProjectDraft((prev) => ({ ...prev, author: event.target.value }))}
                placeholder="작성자"
                className="select-soft"
              />
              <input
                value={newProjectDraft.department}
                onChange={(event) => setNewProjectDraft((prev) => ({ ...prev, department: event.target.value }))}
                placeholder="부서"
                className="select-soft"
              />
              <OpalButton type="submit" variant="primary" size="sm">
                프로젝트 추가
              </OpalButton>
              <textarea
                rows={3}
                value={newProjectDraft.description}
                onChange={(event) => setNewProjectDraft((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="프로젝트 설명"
                className="select-soft lg:col-span-3"
              />
              <input
                value={newProjectDraft.tags}
                onChange={(event) => setNewProjectDraft((prev) => ({ ...prev, tags: event.target.value }))}
                placeholder="태그 (쉼표 구분)"
                className="select-soft lg:col-span-2"
              />
            </form>
          </OpalCard>

          <div className="space-y-3">
            {filteredProjects.map((project) => {
              const isEditing = editingProjectId === project.id

              return (
                <OpalCard key={project.id} elevation="minimal" padding="compact">
                  {isEditing ? (
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
                      <input
                        value={editingDraft.title}
                        onChange={(event) => setEditingDraft((prev) => ({ ...prev, title: event.target.value }))}
                        className="select-soft lg:col-span-2"
                      />
                      <input
                        value={editingDraft.author}
                        onChange={(event) => setEditingDraft((prev) => ({ ...prev, author: event.target.value }))}
                        className="select-soft"
                      />
                      <input
                        value={editingDraft.department}
                        onChange={(event) => setEditingDraft((prev) => ({ ...prev, department: event.target.value }))}
                        className="select-soft"
                      />
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <OpalButton
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setEditingProjectId(null)
                            setEditingDraft(EMPTY_PROJECT_DRAFT)
                          }}
                        >
                          취소
                        </OpalButton>
                        <OpalButton variant="primary" size="sm" icon={<Save className="h-4 w-4" />} onClick={handleSaveProjectEdit}>
                          저장
                        </OpalButton>
                      </div>
                      <textarea
                        rows={3}
                        value={editingDraft.description}
                        onChange={(event) => setEditingDraft((prev) => ({ ...prev, description: event.target.value }))}
                        className="select-soft lg:col-span-3"
                      />
                      <input
                        value={editingDraft.tags}
                        onChange={(event) => setEditingDraft((prev) => ({ ...prev, tags: event.target.value }))}
                        className="select-soft lg:col-span-2"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-slate-900">{project.title}</p>
                          {project.isNew ? (
                            <span className="rounded-full border border-emerald-200 bg-emerald-100/80 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                              NEW
                            </span>
                          ) : null}
                        </div>
                        <p className="text-sm leading-relaxed text-slate-600">{project.description || '설명이 없습니다.'}</p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>작성자 {project.author}</span>
                          <span>부서 {project.department}</span>
                          <span>스타 {project.stars}</span>
                          <span>조회수 {project.views}</span>
                          <span>등록 {project.createdAt}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {project.tags.length > 0 ? (
                            project.tags.map((tag) => (
                              <span key={`${project.id}-${tag}`} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600">
                                #{tag}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-500">태그 없음</span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => handleStartProjectEdit(project)} className="chip-filter chip-filter-idle inline-flex items-center gap-1.5">
                          <Edit3 className="h-3.5 w-3.5" /> 편집
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteProject(project.id)}
                          className="chip-filter chip-filter-idle inline-flex items-center gap-1.5 text-rose-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> 삭제
                        </button>
                      </div>
                    </div>
                  )}
                </OpalCard>
              )
            })}

            {filteredProjects.length === 0 ? (
              <div className="empty-panel">
                <p className="text-sm text-slate-600">검색 조건에 맞는 프로젝트가 없습니다.</p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {activeTab === 'settings' ? (
        <div id="admin-panel-settings" role="tabpanel" aria-labelledby="admin-tab-settings" className="space-y-4">
          <OpalCard elevation="minimal" padding="comfortable">
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-slate-900">플랫폼 전역 설정</h2>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                  <span className="text-sm font-medium text-slate-700">회원가입 허용</span>
                  <input
                    type="checkbox"
                    checked={settings.registrationOpen}
                    onChange={(event) => setSettings((prev) => ({ ...prev, registrationOpen: event.target.checked }))}
                  />
                </label>

                <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                  <span className="text-sm font-medium text-slate-700">유지보수 모드</span>
                  <input
                    type="checkbox"
                    checked={settings.maintenanceMode}
                    onChange={(event) => setSettings((prev) => ({ ...prev, maintenanceMode: event.target.checked }))}
                  />
                </label>

                <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                  <span className="text-sm font-medium text-slate-700">프로젝트 생성 허용</span>
                  <input
                    type="checkbox"
                    checked={settings.allowProjectCreation}
                    onChange={(event) => setSettings((prev) => ({ ...prev, allowProjectCreation: event.target.checked }))}
                  />
                </label>

                <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                  <span className="text-sm font-medium text-slate-700">감사 로그 기록</span>
                  <input
                    type="checkbox"
                    checked={settings.auditLogEnabled}
                    onChange={(event) => setSettings((prev) => ({ ...prev, auditLogEnabled: event.target.checked }))}
                  />
                </label>

                <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                  <span className="text-sm font-medium text-slate-700">신규 프로젝트 알림</span>
                  <input
                    type="checkbox"
                    checked={settings.notifyOnNewProject}
                    onChange={(event) => setSettings((prev) => ({ ...prev, notifyOnNewProject: event.target.checked }))}
                  />
                </label>

                <label className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                  <span className="mb-2 block text-sm font-medium text-slate-700">업로드 제한 (MB)</span>
                  <input
                    type="number"
                    min={1}
                    value={settings.maxUploadMb}
                    onChange={(event) => {
                      const parsed = Number.parseInt(event.target.value, 10)
                      setSettings((prev) => ({ ...prev, maxUploadMb: Number.isNaN(parsed) ? 1 : Math.max(1, parsed) }))
                    }}
                    className="select-soft"
                  />
                </label>

                <label className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 lg:col-span-2">
                  <span className="mb-2 block text-sm font-medium text-slate-700">기본 공개 범위</span>
                  <select
                    value={settings.defaultVisibility}
                    onChange={(event) =>
                      setSettings((prev) => ({
                        ...prev,
                        defaultVisibility: event.target.value as PlatformSettings['defaultVisibility'],
                      }))
                    }
                    className="select-soft max-w-xs"
                  >
                    <option value="private">비공개</option>
                    <option value="department">부서 공개</option>
                    <option value="public">전체 공개</option>
                  </select>
                </label>
              </div>

              <div className="flex justify-end">
                <OpalButton variant="primary" size="sm" icon={<ShieldCheck className="h-4 w-4" />} onClick={handleSaveSettings}>
                  설정 저장
                </OpalButton>
              </div>
            </div>
          </OpalCard>
        </div>
      ) : null}
    </div>
  )
}
