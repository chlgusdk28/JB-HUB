import { memo, useEffect, useState, type ReactNode } from 'react'
import { Link2, Plus, RotateCcw, Sparkles, Star, X } from 'lucide-react'
import { CategoryFilterButton, FilterChip, PageHeader, PageShell, Pill } from '../common'
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
  shellDensity?: 'comfortable' | 'compact'
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
  renderProjectCard: (project: Project, rank?: number, revealIndex?: number) => ReactNode
}

const MIN_STAR_PRESETS = [0, 50, 100, 150] as const

function ExplorePageViewBase({
  shellDensity = 'comfortable',
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
    '카테고리와 부서, 정렬 기준만 빠르게 맞춰도 필요한 프로젝트를 한눈에 찾을 수 있도록 정리했습니다.',
  )

  return (
    <PageShell density={shellDensity === 'compact' ? 'compact' : 'default'}>
      <PageHeader
        eyebrow="Project Explorer"
        title={exploreTitle}
        description={exploreDescription}
        meta={
          <>
            <Pill variant="subtle">{visibleProjects.length}개 프로젝트</Pill>
            <Pill variant="subtle">필터 {activeFilterCount}개</Pill>
          </>
        }
      />

      <section className="page-panel space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <div className="page-toggle-cluster">
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
            </div>
            <p className="text-xs text-slate-500">
              현재 기준: {activeCategoryLabel} · {activeDepartmentLabel} · {activeSortLabel}
            </p>
          </div>

          <div className="page-toolbar-cluster">
            <OpalButton variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={onFavoriteVisible}>
              현재 목록 저장
            </OpalButton>
            <OpalButton variant="secondary" size="sm" icon={<Link2 className="h-4 w-4" />} onClick={onShareCurrentView}>
              보기 공유
            </OpalButton>
            <OpalButton variant="secondary" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={onResetFilters}>
              초기화
            </OpalButton>
          </div>
        </div>

        <div className="explore-active-filter-shell">
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
            <p className="text-xs text-slate-500">필터 없이 전체 목록을 보고 있습니다.</p>
          )}
        </div>

        <div className="space-y-3 border-t border-slate-200/80 pt-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">카테고리</p>
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

          <div className="grid gap-3 md:grid-cols-3">
            <label htmlFor="sort-projects" className="space-y-2">
              <span className="field-label">정렬</span>
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
            </label>

            <label htmlFor="department-projects" className="space-y-2">
              <span className="field-label">부서</span>
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
            </label>

            <label htmlFor="min-stars" className="space-y-2">
              <span className="field-label">최소 스타</span>
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
            </label>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {MIN_STAR_PRESETS.map((preset) => {
              const active = Math.max(0, Math.floor(minStars)) === preset
              return (
                <FilterChip key={`min-star-${preset}`} onClick={() => onMinStarsChange(preset)} isActive={active}>
                  {preset === 0 ? '제한 없음' : `${preset}+`}
                </FilterChip>
              )
            })}
          </div>

          <p className="text-xs text-slate-500">빠른 검색은 `/` 또는 `Ctrl/Cmd + K`를 사용할 수 있어요.</p>
        </div>
      </section>

      <section className="explore-results-grid">
        {visibleProjects.map((project, index) => renderProjectCard(project, undefined, index))}
        {visibleProjects.length === 0 ? (
          <div className="empty-panel">
            <p className="mb-3">지금 조건에 맞는 프로젝트가 없습니다.</p>
            <p className="mb-4 text-xs text-slate-500">
              검색어나 카테고리, 최소 스타, 부서 조건을 조금 완화해서 다시 탐색해 보세요.
            </p>
            <OpalButton variant="secondary" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={onResetFilters}>
              초기화
            </OpalButton>
          </div>
        ) : null}
      </section>
    </PageShell>
  )
}

export const ExplorePageView = memo(ExplorePageViewBase)
ExplorePageView.displayName = 'ExplorePageView'
