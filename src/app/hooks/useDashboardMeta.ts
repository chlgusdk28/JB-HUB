import { useMemo } from 'react'
import type { CategoryDefinition, SortOption } from '../lib/project-utils'
import type { SummaryMetricItem } from '../components/app/HomePageView'

interface UseDashboardMetaOptions {
  allProjectCount: number
  visibleProjectCount: number
  favoriteCount: number
  deferredSearchQuery: string
  categoryDefinitions: CategoryDefinition[]
  categoryLabels: Record<string, string>
}

export function useDashboardMeta({
  allProjectCount,
  visibleProjectCount,
  favoriteCount,
  deferredSearchQuery,
  categoryDefinitions,
  categoryLabels,
}: UseDashboardMetaOptions) {
  const summaryMetrics = useMemo<SummaryMetricItem[]>(
    () => [
      { key: 'total', label: '전체 프로젝트', value: allProjectCount, className: 'stagger-1' },
      { key: 'visible', label: '검색 결과', value: visibleProjectCount, className: 'stagger-2' },
      { key: 'favorites', label: '즐겨찾기', value: favoriteCount, className: 'stagger-3' },
      {
        key: 'query',
        label: '검색어',
        value: deferredSearchQuery.trim() ? deferredSearchQuery : '없음',
        className: 'stagger-4',
        valueClassName: 'text-sm font-semibold',
      },
    ],
    [allProjectCount, visibleProjectCount, favoriteCount, deferredSearchQuery],
  )

  const categoryOptions = useMemo(
    () =>
      categoryDefinitions
        .filter((category) => category.id !== 'all')
        .map((category) => categoryLabels[category.id] ?? category.id),
    [categoryDefinitions, categoryLabels],
  )

  return {
    categoryOptions,
    summaryMetrics,
  }
}

