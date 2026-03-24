import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Briefcase,
  Building2,
  FileText,
  FolderGit2,
  Home,
  Image,
  LayoutGrid,
  LogOut,
  Map as MapIcon,
  MessageSquare,
  Plus,
  RefreshCw,
  Settings,
  Trophy,
  User,
  Wrench,
} from 'lucide-react'
import { HomePageView, type SummaryMetricItem } from './app/HomePageView'
import { ExplorePageView, type ActiveFilterChip } from './app/ExplorePageView'
import { PlatformFrame, ProjectPreviewCard, type NavigationSection } from './common'
import { QuietProjectDetail } from './QuietProjectDetail'
import { RankingPage } from './RankingPage'
import { CommunityDiscussion } from './CommunityDiscussion'
import { KnowledgeHubPage } from './KnowledgeHubPage'
import { NewProjectEditor } from './NewProjectEditor'
import { Workspace } from './Workspace'
import { UserProfile } from './UserProfile'
import { OrgChartPage } from './OrgChartPage'
import { ProjectGallery } from './user/ProjectGallery'
import { ProjectCollections } from './user/ProjectCollections'
import { UserAchievements } from './user/UserAchievements'
import { UserDashboard } from './user/UserDashboard'
import { ProjectRoadmap } from './user/ProjectRoadmap'
import { UserSettings } from './user/UserSettings'
import { ToolsPage } from './ToolsPage'
import { useToast } from './ToastProvider'
import { copyTextToClipboard } from '../lib/clipboard'
import type { HubSession } from '../lib/hub-auth'
import { applyUserSettings, loadUserSettings, saveUserSettings, type UserSettingsState } from '../lib/user-settings'
import { createProject, fetchProjects } from '../lib/projects-api'
import { initialDiscussions, type DiscussionCategory, type DiscussionPost } from '../data/discussions'

type PageId =
  | 'home'
  | 'projects'
  | 'workspace'
  | 'dashboard'
  | 'ranking'
  | 'community'
  | 'knowledge'
  | 'gallery'
  | 'collections'
  | 'tools'
  | 'achievements'
  | 'roadmap'
  | 'org-chart'
  | 'profile'
  | 'settings'
  | 'project-detail'
type ProjectSort = 'stars' | 'views' | 'comments' | 'newest'
type ProjectCardDensity = 'comfortable' | 'compact'

interface HubProject {
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
  trend: string
  badge?: string
}

const CURRENT_USER = {
  name: 'J. Kim',
  department: 'IT 디지털',
}

type CurrentUserProfile = HubSession

interface RestoredHubAppProps {
  currentUser?: CurrentUserProfile
  onLogout?: () => void
  onOpenAdminConsole?: () => void
}

const DEFAULT_CURRENT_USER: HubSession = {
  id: 'default-hub-user',
  username: 'jkim',
  ...CURRENT_USER,
  role: 'member',
  loginAt: new Date(0).toISOString(),
}

const FAVORITES_STORAGE_KEY = 'hub:favorites'
const RECENT_STORAGE_KEY = 'hub:recent-projects'

const CATEGORY_DEFINITIONS = [
  { id: 'all', label: '전체', icon: 'LayoutGrid', color: '#1f3e5a' },
  { id: 'ai', label: 'AI', icon: 'Sparkles', color: '#ef4444' },
  { id: 'automation', label: '자동화', icon: 'Workflow', color: '#0f766e' },
  { id: 'docs', label: '문서', icon: 'FileText', color: '#6366f1' },
  { id: 'devops', label: 'DevOps', icon: 'Blocks', color: '#f59e0b' },
  { id: 'security', label: '보안', icon: 'ShieldCheck', color: '#334155' },
  { id: 'collaboration', label: '협업', icon: 'Users', color: '#2563eb' },
] as const

const SORT_LABELS: Record<ProjectSort, string> = {
  stars: '스타 순',
  views: '조회수 순',
  comments: '댓글 순',
  newest: '최신 순',
}

const HUB_PAGE_IDS: PageId[] = [
  'home',
  'projects',
  'workspace',
  'dashboard',
  'ranking',
  'community',
  'knowledge',
  'gallery',
  'collections',
  'achievements',
  'roadmap',
  'org-chart',
  'profile',
  'settings',
  'project-detail',
]

function parseBooleanParam(value: string | null) {
  return value === 'true' || value === '1'
}

function parsePageParam(value: string | null): PageId | null {
  if (!value) {
    return null
  }

  return HUB_PAGE_IDS.includes(value as PageId) ? (value as PageId) : null
}

function readHubUrlState() {
  if (typeof window === 'undefined') {
    return null
  }

  const url = new URL(window.location.href)
  const project = Number(url.searchParams.get('project') ?? '')
  const stars = Number(url.searchParams.get('stars') ?? '')
  const sort = url.searchParams.get('sort')

  return {
    page: parsePageParam(url.searchParams.get('page')),
    projectId: Number.isFinite(project) && project > 0 ? project : null,
    category: url.searchParams.get('category') ?? 'all',
    department: url.searchParams.get('department') ?? 'all',
    sortBy: sort === 'views' || sort === 'comments' || sort === 'newest' || sort === 'stars' ? sort : 'stars',
    minStars: Number.isFinite(stars) && stars > 0 ? stars : 0,
    showFavoritesOnly: parseBooleanParam(url.searchParams.get('favorites')),
    showNewOnly: parseBooleanParam(url.searchParams.get('newOnly')),
    search: url.searchParams.get('q') ?? '',
  } as const
}

function buildHubUrl(options: {
  page: PageId
  projectId: number | null
  category: string
  department: string
  sortBy: ProjectSort
  minStars: number
  showFavoritesOnly: boolean
  showNewOnly: boolean
  search: string
}) {
  if (typeof window === 'undefined') {
    return '/'
  }

  const url = new URL(window.location.origin + '/')
  if (options.page !== 'home') {
    url.searchParams.set('page', options.page)
  }

  if (options.page === 'projects' || options.page === 'project-detail') {
    if (options.category !== 'all') {
      url.searchParams.set('category', options.category)
    }
    if (options.department !== 'all') {
      url.searchParams.set('department', options.department)
    }
    if (options.sortBy !== 'stars') {
      url.searchParams.set('sort', options.sortBy)
    }
    if (options.minStars > 0) {
      url.searchParams.set('stars', String(options.minStars))
    }
    if (options.showFavoritesOnly) {
      url.searchParams.set('favorites', 'true')
    }
    if (options.showNewOnly) {
      url.searchParams.set('newOnly', 'true')
    }
    if (options.search.trim()) {
      url.searchParams.set('q', options.search.trim())
    }
  }

  if (options.page === 'project-detail' && options.projectId) {
    url.searchParams.set('project', String(options.projectId))
  }

  return `${url.pathname}${url.search}`
}

function resolvePageFromUrlState(state: ReturnType<typeof readHubUrlState> | null): PageId {
  if (!state) {
    return 'home'
  }

  if (state.projectId) {
    return 'project-detail'
  }

  if (state.page && state.page !== 'project-detail') {
    return state.page
  }

  if (
    state.category !== 'all' ||
    state.department !== 'all' ||
    state.search.trim() ||
    state.showFavoritesOnly ||
    state.showNewOnly ||
    state.minStars > 0 ||
    state.sortBy !== 'stars'
  ) {
    return 'projects'
  }

  return 'home'
}

function normalizeProject(raw: Record<string, unknown>): HubProject {
  return {
    id: Number(raw.id ?? 0),
    title: String(raw.title ?? ''),
    description: String(raw.description ?? ''),
    author: String(raw.author ?? ''),
    department: String(raw.department ?? ''),
    stars: Number(raw.stars ?? 0),
    forks: Number(raw.forks ?? 0),
    comments: Number(raw.comments ?? 0),
    views: Number(raw.views ?? 0),
    tags: Array.isArray(raw.tags) ? raw.tags.map((tag) => String(tag)) : [],
    createdAt: String(raw.createdAt ?? raw.created_at_label ?? '최근'),
    isNew: Boolean(raw.isNew ?? raw.is_new ?? false),
    trend: String(raw.trend ?? 'stable'),
    badge: raw.badge ? String(raw.badge) : undefined,
  }
}

function resolveProjectCategory(project: HubProject) {
  const normalizedTags = project.tags.map((tag) => tag.toLowerCase())
  const normalizedDepartment = project.department.toLowerCase()

  if (normalizedTags.some((tag) => tag.includes('ai') || tag.includes('llm') || tag.includes('rag'))) {
    return 'ai'
  }
  if (normalizedTags.some((tag) => tag.includes('auto') || tag.includes('workflow') || tag.includes('rpa'))) {
    return 'automation'
  }
  if (normalizedTags.some((tag) => tag.includes('doc') || tag.includes('wiki') || tag.includes('cms'))) {
    return 'docs'
  }
  if (
    normalizedTags.some((tag) => tag.includes('docker') || tag.includes('devops') || tag.includes('gitlab')) ||
    normalizedDepartment.includes('platform')
  ) {
    return 'devops'
  }
  if (normalizedTags.some((tag) => tag.includes('security') || tag.includes('auth') || tag.includes('vault'))) {
    return 'security'
  }
  if (normalizedTags.some((tag) => tag.includes('collab') || tag.includes('messenger') || tag.includes('chat'))) {
    return 'collaboration'
  }
  return 'all'
}

function readStoredNumberList(storageKey: string) {
  if (typeof window === 'undefined') {
    return []
  }

  const raw = window.localStorage.getItem(storageKey)
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
  } catch {
    return []
  }
}

function writeStoredNumberList(storageKey: string, values: number[]) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(storageKey, JSON.stringify(values))
  }
}

export default function RestoredHubApp({
  currentUser = DEFAULT_CURRENT_USER,
  onLogout,
  onOpenAdminConsole,
}: RestoredHubAppProps) {
  const toast = useToast()
  const initialUrlState = useMemo(() => readHubUrlState(), [])
  const [page, setPage] = useState<PageId>(() => resolvePageFromUrlState(initialUrlState))
  const [projects, setProjects] = useState<HubProject[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState(initialUrlState?.search ?? '')
  const [selectedCategory, setSelectedCategory] = useState(initialUrlState?.category ?? 'all')
  const [selectedDepartment, setSelectedDepartment] = useState(initialUrlState?.department ?? 'all')
  const [sortBy, setSortBy] = useState<ProjectSort>(initialUrlState?.sortBy ?? 'stars')
  const [minStars, setMinStars] = useState(initialUrlState?.minStars ?? 0)
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(initialUrlState?.showFavoritesOnly ?? false)
  const [showNewOnly, setShowNewOnly] = useState(initialUrlState?.showNewOnly ?? false)
  const [favoriteProjectIds, setFavoriteProjectIds] = useState<number[]>([])
  const [recentProjectIds, setRecentProjectIds] = useState<number[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(initialUrlState?.projectId ?? null)
  const [discussions, setDiscussions] = useState<DiscussionPost[]>(initialDiscussions)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [userSettings, setUserSettings] = useState<UserSettingsState>(() => loadUserSettings())
  const projectCardDensity: ProjectCardDensity = userSettings.density === 'compact' ? 'compact' : 'comfortable'
  const hasSyncedHistoryRef = useRef(false)
  const isHandlingPopStateRef = useRef(false)
  const lastHistorySnapshotRef = useRef({
    page: resolvePageFromUrlState(initialUrlState),
    projectId: initialUrlState?.projectId ?? null,
  })

  useEffect(() => {
    document.title = 'JB Hub'
    setFavoriteProjectIds(readStoredNumberList(FAVORITES_STORAGE_KEY))
    setRecentProjectIds(readStoredNumberList(RECENT_STORAGE_KEY))
  }, [])

  useEffect(() => {
    applyUserSettings(userSettings)
  }, [userSettings])

  useEffect(() => {
    writeStoredNumberList(FAVORITES_STORAGE_KEY, favoriteProjectIds)
  }, [favoriteProjectIds])

  useEffect(() => {
    writeStoredNumberList(RECENT_STORAGE_KEY, recentProjectIds)
  }, [recentProjectIds])

  async function loadProjects() {
    setIsLoading(true)
    setLoadError(null)

    try {
      const payload = await fetchProjects()
      setProjects(payload.map((project) => normalizeProject(project as unknown as Record<string, unknown>)))
    } catch (error) {
      const message = error instanceof Error ? error.message : '프로젝트 목록을 불러오지 못했습니다.'
      setLoadError(message)
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadProjects()
  }, [])

  useEffect(() => {
    if (projects.length === 0) {
      return
    }

    if (selectedProjectId !== null && !projects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(null)
      setPage('projects')
      return
    }

    if (selectedProjectId !== null) {
      setPage('project-detail')
    } else {
      const restoredPage = resolvePageFromUrlState(initialUrlState)
      if (restoredPage !== 'project-detail') {
        setPage(restoredPage)
      }
    }
  }, [initialUrlState, projects, selectedProjectId])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const nextUrl = buildHubUrl({
      page,
      projectId: selectedProjectId,
      category: selectedCategory,
      department: selectedDepartment,
      sortBy,
      minStars,
      showFavoritesOnly,
      showNewOnly,
      search,
    })

    const currentUrl = `${window.location.pathname}${window.location.search}`
    if (currentUrl !== nextUrl) {
      const shouldPushHistory =
        hasSyncedHistoryRef.current &&
        !isHandlingPopStateRef.current &&
        (lastHistorySnapshotRef.current.page !== page || lastHistorySnapshotRef.current.projectId !== selectedProjectId)

      if (shouldPushHistory) {
        window.history.pushState(window.history.state, '', nextUrl)
      } else {
        window.history.replaceState(window.history.state, '', nextUrl)
      }
    }

    lastHistorySnapshotRef.current = { page, projectId: selectedProjectId }
    hasSyncedHistoryRef.current = true
    isHandlingPopStateRef.current = false
  }, [page, selectedProjectId, selectedCategory, selectedDepartment, sortBy, minStars, showFavoritesOnly, showNewOnly, search])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handlePopState = () => {
      const nextState = readHubUrlState()
      if (!nextState) {
        return
      }

      isHandlingPopStateRef.current = true
      setSelectedProjectId(nextState.projectId)
      setSelectedCategory(nextState.category)
      setSelectedDepartment(nextState.department)
      setSortBy(nextState.sortBy)
      setMinStars(nextState.minStars)
      setShowFavoritesOnly(nextState.showFavoritesOnly)
      setShowNewOnly(nextState.showNewOnly)
      setSearch(nextState.search)
      setPage(resolvePageFromUrlState(nextState))
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  function scrollToPageTop(behavior: ScrollBehavior = 'smooth') {
    if (typeof window === 'undefined') {
      return
    }

    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior })
    })
  }

  function navigateToPage(nextPage: PageId) {
    if (nextPage === 'project-detail') {
      return
    }

    if (selectedProjectId === null && page === nextPage) {
      scrollToPageTop()
      return
    }

    setSelectedProjectId(null)
    setPage(nextPage)
    scrollToPageTop()
  }

  const departments = useMemo(() => {
    const values = Array.from(new Set(projects.map((project) => project.department).filter(Boolean))).sort()
    return ['all', ...values]
  }, [projects])

  const filteredProjects = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    const nextProjects = projects.filter((project) => {
      if (selectedCategory !== 'all' && resolveProjectCategory(project) !== selectedCategory) {
        return false
      }
      if (selectedDepartment !== 'all' && project.department !== selectedDepartment) {
        return false
      }
      if (project.stars < minStars) {
        return false
      }
      if (showFavoritesOnly && !favoriteProjectIds.includes(project.id)) {
        return false
      }
      if (showNewOnly && !project.isNew) {
        return false
      }
      if (!normalizedSearch) {
        return true
      }

      return (
        project.title.toLowerCase().includes(normalizedSearch) ||
        project.description.toLowerCase().includes(normalizedSearch) ||
        project.author.toLowerCase().includes(normalizedSearch) ||
        project.department.toLowerCase().includes(normalizedSearch) ||
        project.tags.some((tag) => tag.toLowerCase().includes(normalizedSearch))
      )
    })

    return [...nextProjects].sort((left, right) => {
      if (sortBy === 'views') {
        return right.views - left.views
      }
      if (sortBy === 'comments') {
        return right.comments - left.comments
      }
      if (sortBy === 'newest') {
        return Number(right.isNew) - Number(left.isNew) || right.id - left.id
      }
      return right.stars - left.stars
    })
  }, [
    favoriteProjectIds,
    minStars,
    projects,
    search,
    selectedCategory,
    selectedDepartment,
    showFavoritesOnly,
    showNewOnly,
    sortBy,
  ])

  const categoryCounts = useMemo(() => {
    return projects.reduce<Record<string, number>>((accumulator, project) => {
      const categoryId = resolveProjectCategory(project)
      accumulator.all = (accumulator.all ?? 0) + 1
      accumulator[categoryId] = (accumulator[categoryId] ?? 0) + 1
      return accumulator
    }, { all: 0 })
  }, [projects])

  const favoriteProjects = useMemo(
    () => projects.filter((project) => favoriteProjectIds.includes(project.id)),
    [favoriteProjectIds, projects],
  )

  const recentProjects = useMemo(() => {
    const projectMap = new Map(projects.map((project) => [project.id, project]))
    return recentProjectIds.map((id) => projectMap.get(id)).filter((project): project is HubProject => Boolean(project))
  }, [projects, recentProjectIds])

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  )

  const primaryProject = useMemo(
    () => selectedProject ?? filteredProjects[0] ?? projects[0] ?? null,
    [filteredProjects, projects, selectedProject],
  )

  const relatedProjects = useMemo(() => {
    if (!selectedProject) {
      return []
    }

    return projects
      .filter((project) => project.id !== selectedProject.id)
      .filter(
        (project) =>
          project.department === selectedProject.department ||
          project.tags.some((tag) => selectedProject.tags.includes(tag)),
      )
      .slice(0, 4)
  }, [projects, selectedProject])

  const risingProjects = useMemo(() => projects.filter((project) => project.trend === 'rising').slice(0, 4), [projects])

  const galleryProjects = useMemo(
    () =>
      projects.map((project) => ({
        ...project,
        updatedAt: project.createdAt,
        trend: project.trend === 'rising' ? 'up' : 'stable',
      })),
    [projects],
  )

  const achievementStats = useMemo(
    () => ({
      projectsViewed: recentProjectIds.length,
      bookmarksCount: favoriteProjectIds.length,
      commentsCount: discussions.length,
      likesCount: favoriteProjectIds.length,
      sharesCount: selectedProjectId ? 1 : 0,
      daysActive: Math.max(1, recentProjectIds.length),
      currentLevel: Math.max(1, Math.ceil((favoriteProjectIds.length + recentProjectIds.length) / 2)),
      currentXp: favoriteProjectIds.length * 120 + recentProjectIds.length * 80,
      currentStreak: Math.min(7, Math.max(1, recentProjectIds.length)),
      questsCompleted: favoriteProjectIds.length,
    }),
    [discussions.length, favoriteProjectIds.length, recentProjectIds.length, selectedProjectId],
  )

  function toggleFavorite(projectId: number) {
    setFavoriteProjectIds((current) =>
      current.includes(projectId) ? current.filter((id) => id !== projectId) : [...current, projectId],
    )
  }

  function openProject(projectId: number) {
    setSelectedProjectId(projectId)
    setPage('project-detail')
    setRecentProjectIds((current) => [projectId, ...current.filter((id) => id !== projectId)].slice(0, 8))
  }

  async function handleCreateProject(projectData: Record<string, unknown>) {
    const created = await createProject(projectData as never)
    const normalized = normalizeProject(created as unknown as Record<string, unknown>)
    setProjects((current) => [normalized, ...current])
    setIsCreateOpen(false)
    toast.success('프로젝트를 생성했습니다.')
    openProject(normalized.id)
  }

  function handleCreateDiscussion(input: {
    title: string
    summary: string
    category: DiscussionCategory
    tags: string[]
  }) {
    setDiscussions((current) => [
      {
        id: (current[0]?.id ?? 100) + 1,
        projectId: selectedProjectId ?? undefined,
        title: input.title,
        summary: input.summary,
        author: currentUser.name,
        department: currentUser.department,
        category: input.category,
        tags: input.tags,
        likes: 0,
        views: 0,
        comments: 0,
        createdAt: '방금 전',
      },
      ...current,
    ])
    toast.success('토론 글을 등록했습니다.')
  }

  async function handleShareProject(project: HubProject) {
    const copied = await copyTextToClipboard(`${window.location.origin}/?project=${project.id}`)
    if (copied) {
      toast.success('프로젝트 링크를 복사했습니다.')
      return
    }
    toast.warning('프로젝트 링크 복사에 실패했습니다.')
  }

  async function handleShareCurrentView() {
    const sharePath = buildHubUrl({
      page: 'projects',
      projectId: null,
      category: selectedCategory,
      department: selectedDepartment,
      sortBy,
      minStars,
      showFavoritesOnly,
      showNewOnly,
      search,
    })
    const copied = await copyTextToClipboard(`${window.location.origin}${sharePath}`)
    if (copied) {
      toast.success('현재 보기 링크를 복사했습니다.')
      return
    }
    toast.warning('현재 보기 링크 복사에 실패했습니다.')
  }

  function handleFavoriteVisible() {
    const visibleIds = filteredProjects.map((project) => project.id)
    setFavoriteProjectIds((current) => Array.from(new Set([...current, ...visibleIds])))
    toast.success('현재 목록을 즐겨찾기에 추가했습니다.')
  }

  function handleExportFavorites() {
    const payload = favoriteProjects.map((project) => ({
      id: project.id,
      title: project.title,
      department: project.department,
      stars: project.stars,
      views: project.views,
      tags: project.tags,
    }))
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'jb-hub-favorites.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function handleResetFilters() {
    setSearch('')
    setSelectedCategory('all')
    setSelectedDepartment('all')
    setSortBy('stars')
    setMinStars(0)
    setShowFavoritesOnly(false)
    setShowNewOnly(false)
  }

  function handleSurpriseMe() {
    if (filteredProjects.length === 0) {
      toast.warning('현재 조건에서 추천할 프로젝트가 없습니다.')
      return
    }
    openProject(filteredProjects[Math.floor(Math.random() * filteredProjects.length)].id)
  }

  function renderProjectPreview(project: HubProject, rank?: number, revealIndex?: number) {
    return (
      <ProjectPreviewCard
        project={project as never}
        rank={rank}
        revealIndex={revealIndex}
        isFavorite={favoriteProjectIds.includes(project.id)}
        density={projectCardDensity}
        onToggleFavorite={toggleFavorite}
        onProjectClick={openProject}
      />
    )
  }

  function renderHomePage() {
    const summaryMetrics: SummaryMetricItem[] = [
      { key: 'total', label: '전체 프로젝트', value: projects.length },
      { key: 'favorites', label: '즐겨찾기', value: favoriteProjects.length },
      { key: 'rising', label: '상승 중', value: risingProjects.length },
      { key: 'recent', label: '최근 본 프로젝트', value: recentProjects.length },
    ]

    return (
      <HomePageView
        shellDensity={userSettings.density}
        activeCategoryLabel={CATEGORY_DEFINITIONS.find((item) => item.id === selectedCategory)?.label ?? '전체'}
        activeSortLabel={SORT_LABELS[sortBy]}
        visibleProjectsCount={filteredProjects.length}
        summaryMetrics={summaryMetrics}
        bestProjects={filteredProjects.slice(0, 3) as never}
        risingProjects={risingProjects as never}
        favoriteProjects={favoriteProjects as never}
        recentProjects={recentProjects as never}
        onExportFavorites={handleExportFavorites}
        onResetFilters={handleResetFilters}
        onSurpriseMe={handleSurpriseMe}
        renderProjectCard={renderProjectPreview}
      />
    )
  }

  function renderProjectsPage() {
    const activeFilterChips: ActiveFilterChip[] = []

    if (selectedCategory !== 'all') {
      activeFilterChips.push({
        key: 'category',
        label: '카테고리',
        value: CATEGORY_DEFINITIONS.find((item) => item.id === selectedCategory)?.label ?? selectedCategory,
        onRemove: () => setSelectedCategory('all'),
      })
    }
    if (selectedDepartment !== 'all') {
      activeFilterChips.push({
        key: 'department',
        label: '부서',
        value: selectedDepartment,
        onRemove: () => setSelectedDepartment('all'),
      })
    }
    if (minStars > 0) {
      activeFilterChips.push({
        key: 'stars',
        label: '최소 스타',
        value: minStars,
        onRemove: () => setMinStars(0),
      })
    }
    if (showFavoritesOnly) {
      activeFilterChips.push({
        key: 'favorites',
        label: '보기',
        value: '즐겨찾기만',
        onRemove: () => setShowFavoritesOnly(false),
      })
    }
    if (showNewOnly) {
      activeFilterChips.push({
        key: 'new',
        label: '보기',
        value: '신규만',
        onRemove: () => setShowNewOnly(false),
      })
    }

    return (
      <>
        {loadError ? (
          <div className="rounded-[1.8rem] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{loadError}</div>
        ) : null}
        <ExplorePageView
          shellDensity={userSettings.density}
          activeFilterCount={activeFilterChips.length}
          activeFilterChips={activeFilterChips}
          showFavoritesOnly={showFavoritesOnly}
          showNewOnly={showNewOnly}
          activeCategoryLabel={CATEGORY_DEFINITIONS.find((item) => item.id === selectedCategory)?.label ?? '전체'}
          activeDepartmentLabel={selectedDepartment === 'all' ? '전체 부서' : selectedDepartment}
          activeSortLabel={SORT_LABELS[sortBy]}
          minStars={minStars}
          visibleProjects={filteredProjects as never}
          selectedCategory={selectedCategory}
          selectedDepartment={selectedDepartment}
          sortBy={sortBy as never}
          categoryDefinitions={[...CATEGORY_DEFINITIONS] as never}
          categoryLabels={Object.fromEntries(CATEGORY_DEFINITIONS.map((item) => [item.id, item.label]))}
          categoryCounts={categoryCounts}
          sortOptionLabels={SORT_LABELS as never}
          departmentOptions={departments}
          onToggleFavoritesOnly={() => setShowFavoritesOnly((current) => !current)}
          onToggleNewOnly={() => setShowNewOnly((current) => !current)}
          onFavoriteVisible={handleFavoriteVisible}
          onShareCurrentView={() => void handleShareCurrentView()}
          onResetFilters={handleResetFilters}
          onSelectCategory={setSelectedCategory}
          onSortChange={(nextSort) => setSortBy(nextSort as ProjectSort)}
          onDepartmentChange={setSelectedDepartment}
          onMinStarsChange={setMinStars}
          renderProjectCard={renderProjectPreview}
        />
      </>
    )
  }

  function renderMainContent() {
    if (page === 'project-detail') {
      if (!selectedProject) {
        return renderProjectsPage()
      }

      return (
        <QuietProjectDetail
          project={selectedProject as never}
          relatedProjects={relatedProjects as never}
          isFavorite={favoriteProjectIds.includes(selectedProject.id)}
          currentUserName={currentUser.name}
          canManageFiles={selectedProject.author === currentUser.name}
          onToggleFavorite={toggleFavorite}
          onOpenProject={openProject}
          onShare={() => void handleShareProject(selectedProject)}
        />
      )
    }

    if (page === 'workspace') {
      return (
        <Workspace
          projects={projects as never}
          favoriteIds={favoriteProjectIds}
          recentProjectIds={recentProjectIds}
          currentUser={currentUser}
          onProjectClick={openProject}
        />
      )
    }

    if (page === 'dashboard') {
      return (
        <UserDashboard
          projects={projects as never}
          favoriteIds={favoriteProjectIds}
          recentProjectIds={recentProjectIds}
          onProjectClick={openProject}
          onNavigateToPage={(nextPage) => navigateToPage(nextPage as PageId)}
        />
      )
    }

    if (page === 'ranking') {
      return <RankingPage projects={projects as never} onProjectClick={openProject} />
    }

    if (page === 'community') {
      return (
        <CommunityDiscussion
          discussions={discussions}
          onDiscussionClick={(discussionId) => {
            const discussion = discussions.find((item) => item.id === discussionId)
            if (discussion?.projectId) {
              openProject(discussion.projectId)
            }
          }}
          onCreateDiscussion={handleCreateDiscussion}
        />
      )
    }

    if (page === 'knowledge') {
      return <KnowledgeHubPage />
    }

    if (page === 'gallery') {
      return <ProjectGallery projects={galleryProjects as never} onProjectClick={openProject} />
    }

    if (page === 'collections') {
      return <ProjectCollections projects={projects as never} onProjectClick={openProject} />
    }

    if (page === 'tools') {
      return <ToolsPage />
    }

    if (page === 'achievements') {
      return <UserAchievements {...achievementStats} />
    }

    if (page === 'roadmap') {
      return <ProjectRoadmap projectId={primaryProject?.id} projectTitle={primaryProject?.title ?? '프로젝트'} />
    }

    if (page === 'org-chart') {
      return <OrgChartPage />
    }

    if (page === 'profile') {
      return (
        <UserProfile
          projects={projects as never}
          favoriteIds={favoriteProjectIds}
          recentProjectIds={recentProjectIds}
          currentUser={currentUser}
          privacy={userSettings.privacy}
          cardDensity={projectCardDensity}
          onProjectClick={openProject}
        />
      )
    }

    if (page === 'settings') {
      return (
        <UserSettings
          value={userSettings}
          onChange={setUserSettings}
          onSave={(settings) => {
            saveUserSettings(settings)
            setUserSettings(settings)
            toast.success('개인설정을 반영했습니다.')
          }}
          currentUser={currentUser}
        />
      )
    }

    if (page === 'projects') {
      return renderProjectsPage()
    }

    return renderHomePage()
  }

  const navigationSections: NavigationSection<PageId>[] = [
    {
      title: '허브',
      items: [
        { id: 'home', label: '홈', icon: <Home className="h-4 w-4" /> },
        { id: 'projects', label: '탐색', icon: <LayoutGrid className="h-4 w-4" />, badge: filteredProjects.length },
        { id: 'workspace', label: '워크스페이스', icon: <Briefcase className="h-4 w-4" /> },
        { id: 'dashboard', label: '대시보드', icon: <FileText className="h-4 w-4" /> },
        { id: 'ranking', label: '랭킹', icon: <Trophy className="h-4 w-4" /> },
        { id: 'community', label: '커뮤니티', icon: <MessageSquare className="h-4 w-4" />, badge: discussions.length },
        { id: 'knowledge', label: '지식허브', icon: <FolderGit2 className="h-4 w-4" /> },
      ],
    },
    {
      title: '개인화',
      items: [
        { id: 'gallery', label: '갤러리', icon: <Image className="h-4 w-4" /> },
        { id: 'collections', label: '컬렉션', icon: <FolderGit2 className="h-4 w-4" />, badge: favoriteProjects.length },
        { id: 'tools', label: 'Tools', icon: <Wrench className="h-4 w-4" /> },
        { id: 'achievements', label: '업적', icon: <Trophy className="h-4 w-4" /> },
        { id: 'roadmap', label: '로드맵', icon: <MapIcon className="h-4 w-4" /> },
        { id: 'org-chart', label: '조직도', icon: <Building2 className="h-4 w-4" /> },
        { id: 'profile', label: '프로필', icon: <User className="h-4 w-4" /> },
        { id: 'settings', label: '설정', icon: <Settings className="h-4 w-4" /> },
      ],
    },
  ]

  const pageDescriptions: Record<PageId, string> = {
    home: '추천 프로젝트와 활동을 한눈에 봅니다.',
    projects: '카테고리와 부서, 인기 지표를 기준으로 프로젝트를 빠르게 탐색합니다.',
    workspace: '최근 본 프로젝트와 즐겨찾기, 개인 업무 흐름을 중심으로 정리합니다.',
    dashboard: '관심 프로젝트와 활동 지표를 대시보드 형태로 살펴봅니다.',
    ranking: '인기 프로젝트와 상승 흐름을 순위 중심으로 비교합니다.',
    community: '토론과 의견 공유를 통해 프로젝트 맥락과 피드백을 확인합니다.',
    knowledge: '지식 문서와 활용 노트를 모아 검색 가능한 허브로 제공합니다.',
    gallery: '프로젝트를 시각적으로 훑어보며 빠르게 비교합니다.',
    collections: '즐겨찾기와 큐레이션을 기반으로 개인 컬렉션을 관리합니다.',
    tools: '다른 프로젝트에서 가져온 기능과 개인용 업무 도구를 한곳에서 관리합니다.',
    achievements: '활동 기록을 업적과 경험치 중심으로 추적합니다.',
    roadmap: '핵심 프로젝트의 추진 흐름과 다음 작업을 정리합니다.',
    'org-chart': '부서와 담당 영역을 조직 구조 중심으로 확인합니다.',
    profile: '개인 활동과 관심 프로젝트 이력을 모아 봅니다.',
    settings: '허브 사용 환경과 개인 설정을 조정합니다.',
    'project-detail': '선택한 프로젝트의 개요, 파일, Docker 배포 상태를 관리합니다.',
  }

  const isProjectDetailPage = page === 'project-detail'
  const activeNavigationId: PageId = isProjectDetailPage ? 'projects' : page
  const activeNavigationLabel =
    navigationSections.flatMap((section) => section.items).find((item) => item.id === activeNavigationId)?.label ?? '홈'
  const currentContextTitle = isProjectDetailPage ? '프로젝트 상세' : activeNavigationLabel
  const currentContextCopy = selectedProject ? `${selectedProject.title}를 중심으로 작업하고 있어요.` : pageDescriptions[page]

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fbff_0%,#f1f5f9_100%)] text-slate-900">
      {isCreateOpen ? (
        <NewProjectEditor
          onClose={() => setIsCreateOpen(false)}
          onSubmit={(projectData) => handleCreateProject(projectData as unknown as Record<string, unknown>)}
          departmentOptions={departments}
          categoryOptions={['협업', 'AI', '검색', '문서', '자동화', '보안']}
          initialAuthor={currentUser.name}
          initialDepartment={currentUser.department}
        />
      ) : null}

      <PlatformFrame
        brandMark={<img src="/Logo.png" alt="" className="platform-brand-image" />}
        brandEyebrow="프로젝트 허브"
        brandTitle="JB Hub"
        brandDescription="사내 프로젝트와 작업 자료를 한곳에서 찾는 허브입니다."
        onBrandClick={() => navigateToPage('home')}
        navigationSections={navigationSections}
        activeNavigationId={activeNavigationId}
        onSelectNavigation={navigateToPage}
        sidebarLead={
          <div className="platform-context-card">
            <p className="platform-context-eyebrow">현재 보기</p>
            <p className="platform-context-title">{currentContextTitle}</p>
            <p className="platform-context-copy">{currentContextCopy}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="rounded-full border border-slate-200/80 bg-white/80 px-2.5 py-1">{currentUser.name}</span>
              <span className="rounded-full border border-slate-200/80 bg-white/80 px-2.5 py-1">
                {currentUser.department}
              </span>
              <span className="rounded-full border border-slate-200/80 bg-white/80 px-2.5 py-1">
                {currentUser.role === 'admin' ? '관리자' : '멤버'}
              </span>
              <span className="rounded-full border border-slate-200/80 bg-white/80 px-2.5 py-1">
                {userSettings.language === 'en' ? 'English' : '한국어'}
              </span>
            </div>
          </div>
        }
        sidebarFooter={
          <div className="space-y-3">
            <div className="platform-sidebar-actions">
              <button
                type="button"
                onClick={() => setIsCreateOpen(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(15,23,42,0.12)] transition hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" />
                프로젝트 생성
              </button>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <button type="button" onClick={() => void loadProjects()} className="glass-inline-button w-full justify-center">
                  <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                  새로고침
                </button>
                {currentUser.role === 'admin' && onOpenAdminConsole ? (
                  <button type="button" onClick={onOpenAdminConsole} className="glass-inline-button w-full justify-center">
                    <Settings className="h-4 w-4" />
                    관리자 콘솔
                  </button>
                ) : null}
                {onLogout ? (
                  <button
                    type="button"
                    onClick={onLogout}
                    className="glass-inline-button w-full justify-center sm:col-span-2 lg:col-span-1 xl:col-span-2"
                  >
                    <LogOut className="h-4 w-4" />
                    로그아웃
                  </button>
                ) : null}
              </div>
            </div>
            <p className="text-xs leading-5 text-slate-500">세부 필터와 화면별 제어는 각 페이지 상단에서 바로 조절할 수 있어요.</p>
          </div>
        }
      >
        {renderMainContent()}
      </PlatformFrame>
    </div>
  )
}
