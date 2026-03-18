import { useMemo, useState } from 'react'
import { Grid, Image, List, Sparkles } from 'lucide-react'
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

  const renderTrendBadge = (trend?: string) => {
    if (trend === 'up') {
      return <span className="rounded-full border border-sky-200 bg-sky-100/80 px-2 py-0.5 text-[11px] font-semibold text-sky-700">상승</span>
    }
    if (trend === 'down') {
      return <span className="rounded-full border border-rose-200 bg-rose-100/80 px-2 py-0.5 text-[11px] font-semibold text-rose-700">하락</span>
    }
    if (trend === 'stable') {
      return <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">안정</span>
    }
    return null
  }

  return (
    <PageShell density="compact">
      <PageHeader
        eyebrow={
          <>
            <Sparkles className="h-3.5 w-3.5" />
            Visual Browser
          </>
        }
        title="프로젝트 갤러리"
        description="프로젝트를 다양한 밀도와 표현 방식으로 살펴보면서 빠르게 비교할 수 있습니다."
        meta={
          <>
            <Pill variant="subtle">보기: {VIEW_MODE_LABELS[viewMode]}</Pill>
            <Pill variant="subtle">정렬: {SORT_MODE_LABELS[sortBy]}</Pill>
            <Pill variant="subtle">결과: {filteredProjects.length}</Pill>
          </>
        }
      />

      <section className="page-panel flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-full border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`chip-filter !px-2.5 !py-1 ${viewMode === 'grid' ? 'chip-filter-active' : 'chip-filter-idle'}`}
              title="그리드 뷰"
            >
              <Grid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`chip-filter !px-2.5 !py-1 ${viewMode === 'list' ? 'chip-filter-active' : 'chip-filter-idle'}`}
              title="리스트 뷰"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('card')}
              className={`chip-filter !px-2.5 !py-1 ${viewMode === 'card' ? 'chip-filter-active' : 'chip-filter-idle'}`}
              title="카드 뷰"
            >
              <Sparkles className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('compact')}
              className={`chip-filter !px-2.5 !py-1 ${viewMode === 'compact' ? 'chip-filter-active' : 'chip-filter-idle'}`}
              title="컴팩트 뷰"
            >
              <Image className="h-4 w-4" />
            </button>
          </div>

          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as SortMode)}
            className="select-soft max-w-[10rem]"
          >
            <option value="newest">기본 정렬</option>
            <option value="stars">스타순</option>
            <option value="views">조회수순</option>
            <option value="comments">댓글순</option>
          </select>

          <select
            value={filterDepartment}
            onChange={(event) => setFilterDepartment(event.target.value)}
            className="select-soft max-w-[11rem]"
          >
            <option value="">전체 부서</option>
            {allDepartments.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </select>

          <select
            value={filterTag}
            onChange={(event) => setFilterTag(event.target.value)}
            className="select-soft max-w-[11rem]"
          >
            <option value="">전체 태그</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>

          <div className="ml-auto text-sm text-slate-500">{filteredProjects.length}개 프로젝트</div>
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
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredProjects.map((project) => (
            <article
              key={project.id}
              onClick={() => onProjectClick(project.id)}
              className="group cursor-pointer overflow-hidden rounded-2xl border border-slate-200/85 bg-white/96 shadow-[0_8px_18px_rgba(17,37,56,0.08)] transition-[box-shadow,border-color] duration-200 hover:border-slate-300 hover:shadow-[0_14px_24px_rgba(14,33,51,0.12)]"
            >
              <div className="relative h-36 bg-gradient-to-br from-slate-600 to-slate-700">
                {project.imageUrl ? (
                  <img src={project.imageUrl} alt={project.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Image className="h-12 w-12 text-white/50" />
                  </div>
                )}
                {project.badge ? (
                  <span className="absolute right-2 top-2 rounded-full border border-slate-200 bg-white/95 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {project.badge}
                  </span>
                ) : null}
              </div>

              <div className="p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 font-medium text-slate-900">{project.title}</h3>
                  {renderTrendBadge(project.trend)}
                </div>
                <p className="mb-3 line-clamp-2 text-sm text-slate-500">{project.description}</p>
                <div className="mb-3 flex flex-wrap gap-1">
                  {project.tags.slice(0, 2).map((tag) => (
                    <span key={tag} className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                      {tag}
                    </span>
                  ))}
                  {project.tags.length > 2 ? (
                    <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600">
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
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white/96">
          {filteredProjects.map((project, index) => (
            <article
              key={project.id}
              onClick={() => onProjectClick(project.id)}
              className="flex cursor-pointer items-center gap-4 border-b border-slate-200 p-4 transition-colors last:border-b-0 hover:bg-slate-50"
            >
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-[#4f7394]">
                <span className="text-lg font-bold text-white">{index + 1}</span>
              </div>
              <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100">
                {project.imageUrl ? (
                  <img src={project.imageUrl} alt="" className="h-full w-full rounded-lg object-cover" />
                ) : (
                  <Image className="h-6 w-6 text-slate-400" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="truncate font-medium text-slate-900">{project.title}</h3>
                  {project.badge ? (
                    <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                      {project.badge}
                    </span>
                  ) : null}
                  {renderTrendBadge(project.trend)}
                </div>
                <p className="truncate text-sm text-slate-500">{project.description}</p>
                <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                  <span>{project.department}</span>
                  <span>&middot;</span>
                  <span>{project.author}</span>
                  {project.tags.slice(0, 2).map((tag) => (
                    <span key={tag} className="rounded border border-slate-200 bg-white px-2 py-0.5">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-right">
                <div className="mb-1 flex items-center gap-3 text-sm text-slate-500">
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
        <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {filteredProjects.map((project) => (
            <article
              key={project.id}
              onClick={() => onProjectClick(project.id)}
              className="group cursor-pointer rounded-2xl border border-slate-200/85 bg-white/96 p-6 shadow-[0_8px_18px_rgba(17,37,56,0.08)] transition-[box-shadow,border-color] duration-200 hover:border-slate-300 hover:shadow-[0_14px_24px_rgba(14,33,51,0.12)]"
            >
              <div className="mb-4 flex items-start gap-4">
                <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-600 to-slate-700">
                  {project.imageUrl ? (
                    <img src={project.imageUrl} alt="" className="h-full w-full rounded-lg object-cover" />
                  ) : (
                    <Image className="h-8 w-8 text-white/50" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-slate-900">{project.title}</h3>
                    {renderTrendBadge(project.trend)}
                  </div>
                  <p className="text-sm text-slate-500">
                    {project.department} &middot; {project.author}
                  </p>
                </div>
              </div>

              <p className="mb-4 line-clamp-2 text-sm text-slate-600">{project.description}</p>

              <div className="mb-4 flex flex-wrap gap-2">
                {project.tags.map((tag) => (
                  <span key={tag} className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-sm text-slate-700">
                    {tag}
                  </span>
                ))}
              </div>

              <div className="flex items-center justify-between border-t border-slate-200 pt-4">
                <div className="flex items-center gap-4 text-sm text-slate-500">
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
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          {filteredProjects.map((project) => (
            <article
              key={project.id}
              onClick={() => onProjectClick(project.id)}
              className="cursor-pointer rounded-xl border border-slate-200 bg-white p-3 transition-[box-shadow,border-color] hover:border-slate-300 hover:shadow-sm"
            >
              <h4 className="mb-1 line-clamp-2 text-sm font-medium text-slate-900">{project.title}</h4>
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
