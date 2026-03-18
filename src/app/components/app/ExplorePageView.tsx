import { memo, useEffect, useState } from 'react'
import { Link2, Plus, RotateCcw, Sparkles, Star, X } from 'lucide-react'
import { CategoryFilterButton, FilterChip, Pill } from '../common'
import { OpalButton } from '../opal'
import type { CategoryDefinition, Project, SortOption } from '../../lib/project-utils'
import { fetchPublicSiteContent, readSiteContentValue, type PublicSiteContent } from '../../lib/site-content-api'

export interface ActiveFilterChip {
  key: string
  label: string
  value: string | number
  onRemove: () => void
}

interface ExplorePageViewProps {
  activeFilterCount: number
  activeFilterChips: ActiveFilterChip[]
  showFavoritesOnly: boolean
  showNewOnly: boolean
  activeCategoryLabel: string
  activeDepartmentLabel: string
  activeSortLabel: string
  minStars: number
  visibleProjects: Project[]
  selectedCategory: string
  selectedDepartment: string
  sortBy: SortOption
  categoryDefinitions: CategoryDefinition[]
  categoryLabels: Record<string, string>
  categoryCounts: Record<string, number>
  sortOptionLabels: Record<SortOption, string>
  departmentOptions: string[]
  onToggleFavoritesOnly: () => void
  onToggleNewOnly: () => void
  onFavoriteVisible: () => void
  onShareCurrentView: () => void
  onResetFilters: () => void
  onSelectCategory: (categoryId: string) => void
  onSortChange: (sortBy: SortOption) => void
  onDepartmentChange: (department: string) => void
  onMinStarsChange: (value: number) => void
  renderProjectCard: (project: Project, rank?: number, revealIndex?: number) => React.ReactNode
}

const MIN_STAR_PRESETS = [0, 50, 100, 150] as const

function ExplorePageViewBase({
  activeFilterCount,
  activeFilterChips,
  showFavoritesOnly,
  showNewOnly,
  activeCategoryLabel,
  activeDepartmentLabel,
  activeSortLabel,
  minStars,
  visibleProjects,
  selectedCategory,
  selectedDepartment,
  sortBy,
  categoryDefinitions,
  categoryLabels,
  categoryCounts,
  sortOptionLabels,
  departmentOptions,
  onToggleFavoritesOnly,
  onToggleNewOnly,
  onFavoriteVisible,
  onShareCurrentView,
  onResetFilters,
  onSelectCategory,
  onSortChange,
  onDepartmentChange,
  onMinStarsChange,
  renderProjectCard,
}: ExplorePageViewProps) {
  const [siteContent, setSiteContent] = useState<PublicSiteContent | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadSiteContent() {
      try {
        const nextContent = await fetchPublicSiteContent()
        if (!cancelled) {
          setSiteContent(nextContent)
        }
      } catch {
        if (!cancelled) {
          setSiteContent({})
        }
      }
    }

    void loadSiteContent()

    return () => {
      cancelled = true
    }
  }, [])

  const exploreTitle = readSiteContentValue(siteContent, 'explore.title', '프로젝트 탐색')
  const exploreDescription = readSiteContentValue(
    siteContent,
    'explore.description',
    '카테고리, 부서, 즐겨찾기, 신규 여부, 최소 스타 조건을 조합해 필요한 프로젝트를 빠르게 찾으세요.',
  )

  return (
    <div className="page-shell">
      <header className="page-header-plain explore-stage space-y-4">
        <div className="explore-intro-grid">
          <div className="fade-up flex flex-col gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">{exploreTitle}</h1>
            <p className="max-w-4xl text-sm text-slate-600 xl:max-w-5xl">{exploreDescription}</p>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
              현재 적용 중인 필터 {activeFilterCount}개
            </p>
          </div>
          <div className="explore-summary-card fade-up">
            <div className="explore-summary-grid">
              <div className="explore-summary-item">
                <span className="explore-summary-label">Results</span>
                <strong className="explore-summary-value">{visibleProjects.length}</strong>
              </div>
              <div className="explore-summary-item">
                <span className="explore-summary-label">Filters</span>
                <strong className="explore-summary-value">{activeFilterCount}</strong>
              </div>
              <div className="explore-summary-item">
                <span className="explore-summary-label">Stars</span>
                <strong className="explore-summary-value">{Math.max(0, minStars)}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="filter-panel">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="action-row action-row-scroll">
              <OpalButton
                variant={showFavoritesOnly ? 'primary' : 'secondary'}
                size="sm"
                icon={<Star className={`h-4 w-4 ${showFavoritesOnly ? 'fill-white text-white' : ''}`} />}
                onClick={onToggleFavoritesOnly}
                aria-pressed={showFavoritesOnly}
              >
                즐겨찾기만
              </OpalButton>
              <OpalButton
                variant={showNewOnly ? 'primary' : 'secondary'}
                size="sm"
                icon={<Sparkles className={`h-4 w-4 ${showNewOnly ? 'text-white' : ''}`} />}
                onClick={onToggleNewOnly}
                aria-pressed={showNewOnly}
              >
                신규만
              </OpalButton>
              <OpalButton variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={onFavoriteVisible}>
                현재 목록 저장
              </OpalButton>
              <OpalButton variant="secondary" size="sm" icon={<Link2 className="h-4 w-4" />} onClick={onShareCurrentView}>
                현재 보기 공유
              </OpalButton>
              <OpalButton variant="secondary" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={onResetFilters}>
                필터 초기화
              </OpalButton>
            </div>

            <div className="pill-row">
              <Pill variant="subtle">카테고리: {activeCategoryLabel}</Pill>
              <Pill variant="subtle">부서: {activeDepartmentLabel}</Pill>
              <Pill variant="subtle">정렬: {activeSortLabel}</Pill>
              <Pill variant="subtle">최소 스타: {Math.max(0, minStars)}</Pill>
              <Pill variant="subtle">결과: {visibleProjects.length}</Pill>
            </div>
          </div>

          <div className="explore-active-filter-shell mt-4">
            {activeFilterChips.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {activeFilterChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={chip.onRemove}
                    className="filter-chip-removable"
                    aria-label={`${chip.label} 필터 제거`}
                  >
                    <span className="font-semibold">{chip.label}</span>
                    <span>{chip.value}</span>
                    <X className="h-3.5 w-3.5" />
                  </button>
                ))}
                <button type="button" onClick={onResetFilters} className="filter-chip-clear">
                  모두 해제
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                적용 중인 필터가 없습니다. 카테고리와 정렬 조건을 조합해서 탐색 범위를 좁혀보세요.
              </p>
            )}
          </div>

          <div className="explore-filter-grid">
            <div className="explore-category-panel">
              <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">카테고리</div>
              <div className="flex flex-wrap gap-2">
                {categoryDefinitions.map((category) => (
                  <CategoryFilterButton
                    key={category.id}
                    label={categoryLabels[category.id] ?? category.id}
                    count={categoryCounts[category.id] ?? 0}
                    isActive={selectedCategory === category.id}
                    onClick={() => onSelectCategory(category.id)}
                  />
                ))}
              </div>
            </div>

            <div className="explore-refine-panel">
              <label htmlFor="sort-projects" className="field-label">
                정렬
              </label>
              <select
                id="sort-projects"
                value={sortBy}
                onChange={(event) => onSortChange(event.target.value as SortOption)}
                className="select-soft"
              >
                {Object.entries(sortOptionLabels).map(([option, label]) => (
                  <option key={option} value={option}>
                    {label}
                  </option>
                ))}
              </select>

              <label htmlFor="department-projects" className="field-label">
                부서
              </label>
              <select
                id="department-projects"
                value={selectedDepartment}
                onChange={(event) => onDepartmentChange(event.target.value)}
                className="select-soft"
              >
                {departmentOptions.map((department) => (
                  <option key={department} value={department}>
                    {department === 'all' ? '전체 부서' : department}
                  </option>
                ))}
              </select>

              <label htmlFor="min-stars" className="field-label">
                최소 스타
              </label>
              <input
                id="min-stars"
                type="number"
                min={0}
                step={1}
                value={Math.max(0, minStars)}
                onChange={(event) => {
                  const value = Number.parseInt(event.target.value, 10)
                  onMinStarsChange(Number.isNaN(value) ? 0 : Math.max(0, value))
                }}
                className="select-soft"
              />

              <div className="flex flex-wrap gap-1.5">
                {MIN_STAR_PRESETS.map((preset) => {
                  const active = Math.max(0, Math.floor(minStars)) === preset
                  return (
                    <FilterChip
                      key={`min-star-${preset}`}
                      onClick={() => onMinStarsChange(preset)}
                      isActive={active}
                    >
                      {preset === 0 ? '제한 없음' : `${preset}+`}
                    </FilterChip>
                  )
                })}
              </div>
              <p className="text-xs text-slate-500">빠른 검색 단축키: `/` 또는 `Ctrl/Cmd + K`</p>
            </div>
          </div>
        </div>
      </header>

      <section className="explore-results-grid">
        {visibleProjects.map((project, index) => renderProjectCard(project, undefined, index))}
        {visibleProjects.length === 0 ? (
          <div className="empty-panel">
            <p className="mb-3">현재 필터 조건에 맞는 프로젝트가 없습니다.</p>
            <p className="mb-4 text-xs text-slate-500">
              검색어를 줄이거나 카테고리, 최소 스타, 부서 조건을 완화해서 다시 탐색해 보세요.
            </p>
            <OpalButton variant="secondary" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={onResetFilters}>
              필터 초기화
            </OpalButton>
          </div>
        ) : null}
      </section>
    </div>
  )
}

export const ExplorePageView = memo(ExplorePageViewBase)
ExplorePageView.displayName = 'ExplorePageView'
