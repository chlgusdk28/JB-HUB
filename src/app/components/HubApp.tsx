import { useEffect, useMemo, useState } from 'react'
import {
  FolderGit2,
  Home,
  LayoutGrid,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trophy,
} from 'lucide-react'
import { QuietProjectDetail } from './QuietProjectDetail'
import { RankingPage } from './RankingPage'
import { CommunityDiscussion } from './CommunityDiscussion'
import { KnowledgeHubPage } from './KnowledgeHubPage'
import { NewProjectEditor } from './NewProjectEditor'
import { ProjectPreviewCard } from './common'
import { useToast } from './ToastProvider'
import { copyTextToClipboard } from '../lib/clipboard'
import { createProject, fetchProjects } from '../lib/projects-api'
import { initialDiscussions, type DiscussionCategory, type DiscussionPost } from '../data/discussions'

type PageId = 'home' | 'projects' | 'ranking' | 'community' | 'knowledge' | 'project-detail'
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
  department: 'IT 운영',
}

const FAVORITES_STORAGE_KEY = 'hub:favorites'
const RECENT_STORAGE_KEY = 'hub:recent-projects'

const NEW_PROJECT_CATEGORIES = ['협업', 'AI', '검색', '문서', '자동화', '보안']

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

    return parsed
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
  } catch {
    return []
  }
}

function writeStoredNumberList(storageKey: string, values: number[]) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(storageKey, JSON.stringify(values))
}

function ProjectCard({
  project,
  isFavorite,
  onOpen,
  onToggleFavorite,
}: {
  project: HubProject
  isFavorite: boolean
  onOpen: () => void
  onToggleFavorite: () => void
}) {
  return (
    <article className="rounded-[1.8rem] border border-slate-200/80 bg-white/92 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">{project.department}</span>
            <span>{project.author}</span>
            <span>·</span>
            <span>{project.createdAt}</span>
          </div>
          <h3 className="text-xl font-black tracking-[-0.03em] text-slate-950">{project.title}</h3>
        </div>
        <button
          type="button"
          onClick={onToggleFavorite}
          className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition ${
            isFavorite
              ? 'border-amber-200 bg-amber-50 text-amber-600'
              : 'border-slate-200 bg-white text-slate-400 hover:text-slate-700'
          }`}
          aria-label="즐겨찾기 추가"
        >
          <Star className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
        </button>
      </div>

      <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{project.description}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {project.tags.slice(0, 4).map((tag) => (
          <span key={`${project.id}-${tag}`} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
            #{tag}
          </span>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-500">
        <span>별표 {project.stars}</span>
        <span>포크 {project.forks}</span>
        <span>댓글 {project.comments}</span>
        <span>조회 {project.views.toLocaleString('ko-KR')}</span>
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="mt-5 inline-flex items-center justify-center rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        상세 보기
      </button>
    </article>
  )
}

export default function HubApp() {
  const toast = useToast()
  const [page, setPage] = useState<PageId>('home')
  const [projects, setProjects] = useState<HubProject[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedDepartment, setSelectedDepartment] = useState('all')
  const [sortBy, setSortBy] = useState<ProjectSort>('stars')
  const [minStars, setMinStars] = useState(0)
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [showNewOnly, setShowNewOnly] = useState(false)
  const [projectCardDensity] = useState<ProjectCardDensity>('comfortable')
  const [favoriteProjectIds, setFavoriteProjectIds] = useState<number[]>([])
  const [recentProjectIds, setRecentProjectIds] = useState<number[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [discussions, setDiscussions] = useState<DiscussionPost[]>(initialDiscussions)
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  useEffect(() => {
    document.title = 'JB Hub'
    setFavoriteProjectIds(readStoredNumberList(FAVORITES_STORAGE_KEY))
    setRecentProjectIds(readStoredNumberList(RECENT_STORAGE_KEY))
  }, [])

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
      const normalized = payload.map((project) => normalizeProject(project as unknown as Record<string, unknown>))
      setProjects(normalized)
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

  const departments = useMemo(() => {
    const values = Array.from(new Set(projects.map((project) => project.department).filter(Boolean))).sort()
    return ['all', ...values]
  }, [projects])

  const filteredProjects = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    const nextProjects = projects.filter((project) => {
      const projectCategory = resolveProjectCategory(project)
      if (selectedCategory !== 'all' && projectCategory !== selectedCategory) {
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
  }, [favoriteProjectIds, minStars, projects, search, selectedCategory, selectedDepartment, showFavoritesOnly, showNewOnly, sortBy])

  const favoriteProjects = useMemo(
    () => projects.filter((project) => favoriteProjectIds.includes(project.id)),
    [favoriteProjectIds, projects],
  )

  const recentProjects = useMemo(() => {
    const map = new Map(projects.map((project) => [project.id, project]))
    return recentProjectIds.map((id) => map.get(id)).filter((project): project is HubProject => Boolean(project))
  }, [projects, recentProjectIds])

  const featuredProjects = useMemo(() => filteredProjects.slice(0, 3), [filteredProjects])
  const risingProjects = useMemo(() => projects.filter((project) => project.trend === 'rising').slice(0, 4), [projects])
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  )

  const relatedProjects = useMemo(() => {
    if (!selectedProject) {
      return []
    }

    return projects
      .filter((project) => project.id !== selectedProject.id)
      .filter((project) => project.department === selectedProject.department || project.tags.some((tag) => selectedProject.tags.includes(tag)))
      .slice(0, 4)
  }, [projects, selectedProject])

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
        author: CURRENT_USER.name,
        department: CURRENT_USER.department,
        category: input.category,
        tags: input.tags,
        likes: 0,
        views: 0,
        comments: 0,
        createdAt: '방금 전',
      },
      ...current,
    ])
    toast.success('새 토론을 등록했습니다.')
  }

  async function handleShareProject(project: HubProject) {
    const shareUrl = `${window.location.origin}/#project-${project.id}`
    const copied = await copyTextToClipboard(shareUrl)
    if (copied) {
      toast.success('프로젝트 링크를 복사했습니다.')
      return
    }
    toast.warning('링크 복사에 실패했습니다.')
  }

  function renderHomePage() {
    return (
      <div className="space-y-8">
        <section className="rounded-[2.4rem] border border-slate-200/80 bg-slate-950 px-6 py-8 text-white shadow-[0_30px_90px_rgba(15,23,42,0.18)] sm:px-8">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100">
                JB Hub
              </p>
              <h1 className="mt-4 text-4xl font-black tracking-[-0.05em] text-white sm:text-5xl">
                프로젝트 허브 모드를
                <br />
                다시 구성했습니다.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200 sm:text-base">
                탐색, 랭킹, 커뮤니티, 지식 공유, 프로젝트 상세 화면까지 한곳에서 다시 볼 수 있는 허브 인터페이스입니다.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setPage('projects')}
                  className="rounded-full bg-cyan-300 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"
                >
                  프로젝트 탐색
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(true)}
                  className="rounded-full border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
                >
                  새 프로젝트 등록
                </button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-[1.7rem] border border-white/10 bg-white/10 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">전체 프로젝트</p>
                <div className="mt-3 text-4xl font-black tracking-[-0.05em]">{projects.length}</div>
              </div>
              <div className="rounded-[1.7rem] border border-white/10 bg-white/10 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">즐겨찾기</p>
                <div className="mt-3 text-4xl font-black tracking-[-0.05em]">{favoriteProjects.length}</div>
              </div>
              <div className="rounded-[1.7rem] border border-white/10 bg-white/10 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">상승 중</p>
                <div className="mt-3 text-4xl font-black tracking-[-0.05em]">{risingProjects.length}</div>
              </div>
              <div className="rounded-[1.7rem] border border-white/10 bg-white/10 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">최근 본 프로젝트</p>
                <div className="mt-3 text-4xl font-black tracking-[-0.05em]">{recentProjects.length}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black tracking-[-0.04em] text-slate-950">추천 프로젝트</h2>
              <button type="button" onClick={() => setPage('projects')} className="text-sm font-semibold text-slate-600 transition hover:text-slate-950">
                전체 보기
              </button>
            </div>
            <div className="grid gap-4">
              {featuredProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  isFavorite={favoriteProjectIds.includes(project.id)}
                  onOpen={() => openProject(project.id)}
                  onToggleFavorite={() => toggleFavorite(project.id)}
                />
              ))}
              {!isLoading && featuredProjects.length === 0 ? (
                <div className="rounded-[1.8rem] border border-dashed border-slate-300 bg-white/70 px-5 py-12 text-center text-sm text-slate-500">
                  표시할 프로젝트가 없습니다.
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-6">
            <section className="rounded-[2rem] border border-slate-200/80 bg-white/90 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
              <h2 className="text-2xl font-black tracking-[-0.04em] text-slate-950">최근 본 프로젝트</h2>
              <div className="mt-4 space-y-3">
                {recentProjects.slice(0, 4).map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => openProject(project.id)}
                    className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-white"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{project.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{project.department} · {project.author}</p>
                    </div>
                    <span className="text-xs font-semibold text-slate-500">조회 {project.views}</span>
                  </button>
                ))}
                {recentProjects.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                    아직 열어본 프로젝트가 없습니다.
                  </p>
                ) : null}
              </div>
            </section>

            <section className="rounded-[2rem] border border-slate-200/80 bg-white/90 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
              <h2 className="text-2xl font-black tracking-[-0.04em] text-slate-950">즐겨찾기</h2>
              <div className="mt-4 space-y-3">
                {favoriteProjects.slice(0, 4).map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => openProject(project.id)}
                    className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-white"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{project.title}</p>
                      <p className="mt-1 text-xs text-slate-500">별표 {project.stars} · 댓글 {project.comments}</p>
                    </div>
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  </button>
                ))}
                {favoriteProjects.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                    즐겨찾기한 프로젝트가 없습니다.
                  </p>
                ) : null}
              </div>
            </section>
          </div>
        </section>
      </div>
    )
  }

  function renderProjectsPage() {
    return (
      <div className="space-y-6">
        <section className="rounded-[2rem] border border-slate-200/80 bg-white/90 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-[-0.04em] text-slate-950">프로젝트 탐색</h1>
              <p className="mt-2 text-sm text-slate-600">프로젝트를 검색하고 필터링한 뒤, 상세 화면에서 파일과 Docker 정보까지 확인할 수 있습니다.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void loadProjects()}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-950 hover:text-slate-950"
              >
                <RefreshCw className="h-4 w-4" />
                새로고침
              </button>
              <button
                type="button"
                onClick={() => setIsCreateOpen(true)}
                className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" />새 프로젝트
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr_0.7fr_0.7fr]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="제목, 설명, 태그, 작성자를 검색하세요."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-slate-950 focus:bg-white"
              />
            </label>
            <select
              value={selectedDepartment}
              onChange={(event) => setSelectedDepartment(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-950 focus:bg-white"
            >
              {departments.map((department) => (
                <option key={department} value={department}>
                  {department === 'all' ? '전체 부서' : department}
                </option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as ProjectSort)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-950 focus:bg-white"
            >
              <option value="stars">별표 많은 순</option>
              <option value="views">조회 많은 순</option>
              <option value="comments">댓글 많은 순</option>
              <option value="newest">최신 순</option>
            </select>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowFavoritesOnly((current) => !current)}
                className={`flex-1 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                  showFavoritesOnly ? 'bg-amber-100 text-amber-700' : 'border border-slate-200 bg-slate-50 text-slate-600'
                }`}
              >
                즐겨찾기만
              </button>
              <button
                type="button"
                onClick={() => setShowNewOnly((current) => !current)}
                className={`flex-1 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                  showNewOnly ? 'bg-cyan-100 text-cyan-700' : 'border border-slate-200 bg-slate-50 text-slate-600'
                }`}
              >
                신규만
              </button>
            </div>
          </div>
        </section>

        {loadError ? (
          <div className="rounded-[1.8rem] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{loadError}</div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-2">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              isFavorite={favoriteProjectIds.includes(project.id)}
              onOpen={() => openProject(project.id)}
              onToggleFavorite={() => toggleFavorite(project.id)}
            />
          ))}
          {!isLoading && filteredProjects.length === 0 ? (
            <div className="rounded-[1.8rem] border border-dashed border-slate-300 bg-white/70 px-5 py-16 text-center text-sm text-slate-500 lg:col-span-2">
              현재 조건에 맞는 프로젝트가 없습니다.
            </div>
          ) : null}
        </section>
      </div>
    )
  }

  function renderMainContent() {
    if (page === 'project-detail' && selectedProject) {
      return (
        <QuietProjectDetail
          project={selectedProject as never}
          relatedProjects={relatedProjects as never}
          isFavorite={favoriteProjectIds.includes(selectedProject.id)}
          currentUserName={CURRENT_USER.name}
          canManageFiles={selectedProject.author === CURRENT_USER.name}
          onToggleFavorite={toggleFavorite}
          onOpenProject={openProject}
          onShare={() => void handleShareProject(selectedProject)}
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

    if (page === 'projects') {
      return renderProjectsPage()
    }

    return renderHomePage()
  }

  const navigationItems: Array<{ id: PageId; label: string; icon: typeof Home }> = [
    { id: 'home', label: '홈', icon: Home },
    { id: 'projects', label: '탐색', icon: LayoutGrid },
    { id: 'ranking', label: '랭킹', icon: Trophy },
    { id: 'community', label: '커뮤니티', icon: MessageSquare },
    { id: 'knowledge', label: '지식 허브', icon: FolderGit2 },
  ]

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(251,191,36,0.12),transparent_24%),linear-gradient(180deg,#f8fbff_0%,#eff4fb_42%,#f4f7fb_100%)] text-slate-900">
      {isCreateOpen ? (
        <NewProjectEditor
          onClose={() => setIsCreateOpen(false)}
          onSubmit={(projectData) => handleCreateProject(projectData as unknown as Record<string, unknown>)}
          departmentOptions={departments}
          categoryOptions={NEW_PROJECT_CATEGORIES}
          initialAuthor={CURRENT_USER.name}
          initialDepartment={CURRENT_USER.department}
        />
      ) : null}

      <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-[2rem] border border-white/70 bg-white/78 px-5 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-slate-950 px-3 py-2 text-sm font-black tracking-[0.18em] text-white">JB</div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">프로젝트 허브</p>
                <h1 className="text-xl font-black tracking-[-0.04em] text-slate-950 sm:text-2xl">JB Hub</h1>
              </div>
            </div>

            <nav className="flex flex-wrap gap-2">
              {navigationItems.map((item) => {
                const Icon = item.icon
                const active = page === item.id || (item.id === 'projects' && page === 'project-detail')
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPage(item.id)}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                      active
                        ? 'bg-slate-950 text-white'
                        : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-950 hover:text-slate-950'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                )
              })}
            </nav>
          </div>
        </header>

        {renderMainContent()}
      </div>
    </div>
  )
}
