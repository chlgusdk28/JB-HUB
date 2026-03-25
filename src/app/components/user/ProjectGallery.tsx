import { useMemo, useState } from 'react'
import { Grid, Image, List, RotateCcw, Sparkles } from 'lucide-react'
import { PageHeader, PageShell, Pill } from '../common'

interface Project {
  id: number
  title: string
  description: string
  author: string
  department: string
  tags: string[]
  stars: number
  forks: number
  views: number
  comments: number
  updatedAt: string
  imageUrl?: string
  badge?: string
  trend?: string
}

type ViewMode = 'grid' | 'list' | 'card' | 'compact'
type SortMode = 'newest' | 'stars' | 'views' | 'comments'

interface ProjectGalleryProps {
  projects: Project[]
  onProjectClick: (projectId: number) => void
}

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  grid: '그리드',
  list: '리스트',
  card: '카드',
  compact: '컴팩트',
}

const SORT_MODE_LABELS: Record<SortMode, string> = {
  newest: '기본',
  stars: '스타',
  views: '조회수',
  comments: '댓글',
}

const VIEW_MODE_ICONS: Record<ViewMode, typeof Grid> = {
  grid: Grid,
  list: List,
  card: Sparkles,
  compact: Image,
}

export function ProjectGallery({ projects, onProjectClick }: ProjectGalleryProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [sortBy, setSortBy] = useState<SortMode>('newest')
  const [filterTag, setFilterTag] = useState('')
  const [filterDepartment, setFilterDepartment] = useState('')

  const allTags = useMemo(
    () => Array.from(new Set(projects.flatMap((project) => project.tags ?? []))).sort(),
    [projects],
  )
  const allDepartments = useMemo(
    () => Array.from(new Set(projects.map((project) => project.department))).sort(),
    [projects],
  )

  const filteredProjects = useMemo(() => {
    const filtered = projects
      .filter((project) => !filterTag || project.tags?.includes(filterTag))
      .filter((project) => !filterDepartment || project.department === filterDepartment)

    switch (sortBy) {
      case 'stars':
        return [...filtered].sort((a, b) => b.stars - a.stars)
      case 'views':
        return [...filtered].sort((a, b) => b.views - a.views)
      case 'comments':
        return [...filtered].sort((a, b) => b.comments - a.comments)
      case 'newest':
      default:
        return filtered
    }
  }, [filterDepartment, filterTag, projects, sortBy])

  const activeFilterCount = Number(Boolean(filterTag)) + Number(Boolean(filterDepartment))
  const renderTrendBadge = (trend?: string) => {
    if (trend === 'up') {
      return (
        <span className="rounded-full border border-sky-200 bg-sky-100/80 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
          상승
        </span>
      )
    }
    if (trend === 'down') {
      return (
        <span className="rounded-full border border-rose-200 bg-rose-100/80 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
          하락
        </span>
      )
    }
    if (trend === 'stable') {
      return (
        <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
          안정
        </span>
      )
    }
    return null
  }

  return (
    <PageShell density="compact">
      <PageHeader
        variant="simple"
        eyebrow={
          <>
            <Sparkles className="h-3.5 w-3.5" />
            Visual Browser
          </>
        }
        title="프로젝트 갤러리"
        description="프로젝트를 여러 레이아웃으로 훑어보며, 같은 기준으로 빠르게 비교할 수 있는 시각 탐색 화면입니다."
        meta={
          <>
            <Pill variant="subtle">보기: {VIEW_MODE_LABELS[viewMode]}</Pill>
            <Pill variant="subtle">정렬: {SORT_MODE_LABELS[sortBy]}</Pill>
            <Pill variant="subtle">활성 필터: {activeFilterCount}</Pill>
            <Pill variant="subtle">결과: {filteredProjects.length}</Pill>
          </>
        }
      />

      <section className="page-panel space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="page-summary-strip">
            <div className="page-summary-item">
              <span className="page-summary-label">전체 프로젝트</span>
              <span className="page-summary-value">{projects.length}</span>
            </div>
            <div className="page-summary-item">
              <span className="page-summary-label">현재 표시</span>
              <span className="page-summary-value">{filteredProjects.length}</span>
            </div>
            <div className="page-summary-item">
              <span className="page-summary-label">부서 범위</span>
              <span className="page-summary-value">{allDepartments.length}</span>
            </div>
            <div className="page-summary-item">
              <span className="page-summary-label">태그 범위</span>
              <span className="page-summary-value">{allTags.length}</span>
            </div>
          </div>

          {activeFilterCount > 0 || sortBy !== 'newest' ? (
            <button
              type="button"
              onClick={() => {
                setSortBy('newest')
                setFilterDepartment('')
                setFilterTag('')
              }}
              className="glass-inline-button"
            >
              <RotateCcw className="h-4 w-4" />
              필터 초기화
            </button>
          ) : null}
        </div>

        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="page-toggle-cluster">
            {(Object.keys(VIEW_MODE_LABELS) as ViewMode[]).map((mode) => {
              const Icon = VIEW_MODE_ICONS[mode]
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`page-toggle-button ${
                    viewMode === mode ? 'page-toggle-button-active' : 'page-toggle-button-idle'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {VIEW_MODE_LABELS[mode]}
                </button>
              )
            })}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:min-w-[38rem]">
            <label className="space-y-2">
              <span className="field-label">정렬</span>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortMode)} className="select-soft">
                <option value="newest">기본 정렬</option>
                <option value="stars">스타순</option>
                <option value="views">조회수순</option>
                <option value="comments">댓글순</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="field-label">부서</span>
              <select value={filterDepartment} onChange={(event) => setFilterDepartment(event.target.value)} className="select-soft">
                <option value="">전체 부서</option>
                {allDepartments.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="field-label">태그</span>
              <select value={filterTag} onChange={(event) => setFilterTag(event.target.value)} className="select-soft">
                <option value="">전체 태그</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="page-toolbar-note">부서와 태그를 결합해도 같은 시각 리듬으로 비교되도록 정리했습니다.</span>
          <span className="page-toolbar-note">총 {filteredProjects.length}개 프로젝트</span>
        </div>
      </section>

      {filteredProjects.length === 0 ? (
        <div className="empty-panel">
          <Sparkles className="mx-auto mb-4 h-16 w-16 text-slate-300" />
          <p className="text-lg font-medium text-slate-700">조건에 맞는 프로젝트가 없습니다.</p>
          <p className="mt-1 text-sm text-slate-500">필터를 조정하거나 다른 태그를 선택해 보세요.</p>
        </div>
      ) : null}

      {viewMode === 'grid' ? (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredProjects.map((project) => (
            <article
              key={project.id}
              onClick={() => onProjectClick(project.id)}
              className="group cursor-pointer overflow-hidden rounded-[24px] border border-slate-200/85 bg-white/96 shadow-[0_12px_26px_rgba(17,37,56,0.08)] transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_18px_32px_rgba(14,33,51,0.12)]"
            >
              <div className="relative h-36 bg-gradient-to-br from-slate-600 to-slate-800">
                {project.imageUrl ? (
                  <img src={project.imageUrl} alt={project.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Image className="h-12 w-12 text-white/50" />
                  </div>
                )}
                {project.badge ? (
                  <span className="absolute right-3 top-3 rounded-full border border-slate-200 bg-white/95 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {project.badge}
                  </span>
                ) : null}
              </div>

              <div className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 text-base font-semibold text-slate-900">{project.title}</h3>
                  {renderTrendBadge(project.trend)}
                </div>
                <p className="line-clamp-2 text-sm text-slate-500">{project.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  {project.tags.slice(0, 2).map((tag) => (
                    <span key={tag} className="rounded-full border border-slate-200 bg-slate-100/80 px-2 py-0.5 text-xs text-slate-700">
                      {tag}
                    </span>
                  ))}
                  {project.tags.length > 2 ? (
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600">
                      +{project.tags.length - 2}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{project.department}</span>
                  <div className="flex items-center gap-2">
                    <span>스타 {project.stars}</span>
                    <span>조회 {project.views}</span>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {viewMode === 'list' ? (
        <section className="page-panel overflow-hidden p-0">
          {filteredProjects.map((project, index) => (
            <article
              key={project.id}
              onClick={() => onProjectClick(project.id)}
              className="flex cursor-pointer items-center gap-4 border-b border-slate-200/80 px-4 py-4 transition-colors last:border-b-0 hover:bg-slate-50/70"
            >
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-[#4f7394] text-base font-bold text-white">
                {index + 1}
              </div>
              <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-slate-100">
                {project.imageUrl ? (
                  <img src={project.imageUrl} alt="" className="h-full w-full rounded-2xl object-cover" />
                ) : (
                  <Image className="h-6 w-6 text-slate-400" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="truncate font-semibold text-slate-900">{project.title}</h3>
                  {project.badge ? (
                    <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                      {project.badge}
                    </span>
                  ) : null}
                  {renderTrendBadge(project.trend)}
                </div>
                <p className="truncate text-sm text-slate-500">{project.description}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{project.department}</span>
                  <span>{project.author}</span>
                  {project.tags.slice(0, 2).map((tag) => (
                    <span key={tag} className="rounded-full border border-slate-200 bg-white px-2 py-0.5">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-right text-sm text-slate-500">
                <div className="mb-1 flex items-center gap-3">
                  <span>스타 {project.stars}</span>
                  <span>조회 {project.views}</span>
                  <span>댓글 {project.comments}</span>
                </div>
                <span className="text-xs text-slate-400">{project.updatedAt}</span>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {viewMode === 'card' ? (
        <section className="page-card-grid">
          {filteredProjects.map((project) => (
            <article
              key={project.id}
              onClick={() => onProjectClick(project.id)}
              className="group cursor-pointer rounded-[26px] border border-slate-200/85 bg-white/96 p-6 shadow-[0_12px_26px_rgba(17,37,56,0.08)] transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_18px_32px_rgba(14,33,51,0.12)]"
            >
              <div className="mb-4 flex items-start gap-4">
                <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-br from-slate-600 to-slate-800">
                  {project.imageUrl ? (
                    <img src={project.imageUrl} alt="" className="h-full w-full rounded-[22px] object-cover" />
                  ) : (
                    <Image className="h-8 w-8 text-white/50" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <h3 className="line-clamp-2 font-semibold text-slate-900">{project.title}</h3>
                    {renderTrendBadge(project.trend)}
                  </div>
                  <p className="text-sm text-slate-500">
                    {project.department} · {project.author}
                  </p>
                </div>
              </div>

              <p className="mb-4 line-clamp-2 text-sm text-slate-600">{project.description}</p>

              <div className="mb-4 flex flex-wrap gap-2">
                {project.tags.slice(0, 4).map((tag) => (
                  <span key={tag} className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-sm text-slate-700">
                    {tag}
                  </span>
                ))}
                {project.tags.length > 4 ? (
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-500">
                    +{project.tags.length - 4}
                  </span>
                ) : null}
              </div>

              <div className="flex items-center justify-between border-t border-slate-200/80 pt-4 text-sm text-slate-500">
                <div className="flex flex-wrap items-center gap-4">
                  <span>스타 {project.stars}</span>
                  <span>포크 {project.forks}</span>
                  <span>조회 {project.views}</span>
                  <span>댓글 {project.comments}</span>
                </div>
                <span className="text-xs text-slate-400">{project.updatedAt}</span>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {viewMode === 'compact' ? (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {filteredProjects.map((project) => (
            <article
              key={project.id}
              onClick={() => onProjectClick(project.id)}
              className="cursor-pointer rounded-[20px] border border-slate-200 bg-white/94 p-3 transition-[box-shadow,border-color] hover:border-slate-300 hover:shadow-sm"
            >
              <h4 className="mb-1 line-clamp-2 text-sm font-semibold text-slate-900">{project.title}</h4>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="truncate">{project.department}</span>
                <span>스타 {project.stars}</span>
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </PageShell>
  )
}
