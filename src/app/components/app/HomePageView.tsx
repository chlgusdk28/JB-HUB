import { memo, useEffect, useState, type ReactNode } from 'react'
import { Clock3, Download, RotateCcw, Sparkles } from 'lucide-react'
import { PageHeader, PageShell, Pill, ProjectSection } from '../common'
import { OpalButton } from '../opal'
import type { Project } from '../../lib/project-utils'
import { fetchPublicSiteContent, readSiteContentValue, type PublicSiteContent } from '../../lib/site-content-api'

export interface SummaryMetricItem {
  key: string
  label: string
  value: string | number
  className?: string
  valueClassName?: string
}

interface HomePageViewProps {
  shellDensity?: 'comfortable' | 'compact'
  activeCategoryLabel: string
  activeSortLabel: string
  visibleProjectsCount: number
  summaryMetrics: SummaryMetricItem[]
  bestProjects: Project[]
  risingProjects: Project[]
  favoriteProjects: Project[]
  recentProjects: Project[]
  onExportFavorites: () => void
  onResetFilters: () => void
  onSurpriseMe: () => void
  renderProjectCard: (project: Project, rank?: number, revealIndex?: number) => ReactNode
}

function HomePageViewBase({
  shellDensity = 'comfortable',
  activeCategoryLabel,
  activeSortLabel,
  visibleProjectsCount,
  summaryMetrics,
  bestProjects,
  risingProjects,
  favoriteProjects,
  recentProjects,
  onExportFavorites,
  onResetFilters,
  onSurpriseMe,
  renderProjectCard,
}: HomePageViewProps) {
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

  const eyebrow = readSiteContentValue(siteContent, 'home.eyebrow', 'JB Hub · 사내 프로젝트 허브')
  const homeTitle = readSiteContentValue(siteContent, 'home.title', '흩어진 업무 도구를 한 곳에서')
  const homeHighlight = readSiteContentValue(siteContent, 'home.highlight', '빠르게 탐색하고 비교하세요')
  const homeDescription = readSiteContentValue(
    siteContent,
    'home.description',
    '카테고리, 부서, 스타 조건으로 필요한 프로젝트를 즉시 찾고 팀에 맞는 도구를 빠르게 선택할 수 있습니다.',
  )

  const homeProjectSections = [
    {
      key: 'top-stars',
      title: '인기 프로젝트',
      projects: bestProjects,
      forceRender: true,
      gridClassName: 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3',
      rightSlot: <Pill variant="subtle">추천 3개</Pill>,
      rankOffset: 1,
      revealOffset: 0,
    },
    {
      key: 'trending',
      title: '상승 중인 프로젝트',
      projects: risingProjects.slice(0, 3),
      rankOffset: undefined,
      revealOffset: 2,
    },
    {
      key: 'recent',
      title: '최근 본 프로젝트',
      projects: recentProjects.slice(0, 3),
      icon: <Clock3 className="h-4 w-4 text-slate-600" />,
      rankOffset: undefined,
      revealOffset: 2,
    },
  ]

  return (
    <PageShell density={shellDensity === 'compact' ? 'compact' : 'relaxed'}>
      <PageHeader
        variant="feature"
        eyebrow={eyebrow}
        title={
          <>
            {homeTitle}
            <span className="text-gradient-brand block">{homeHighlight}</span>
          </>
        }
        description={homeDescription}
        actions={
          <>
            <OpalButton variant="secondary" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={onResetFilters}>
              필터 초기화
            </OpalButton>
            <OpalButton variant="primary" size="sm" icon={<Sparkles className="h-4 w-4" />} onClick={onSurpriseMe}>
              랜덤 추천
            </OpalButton>
          </>
        }
        meta={
          <>
            <Pill variant="subtle">카테고리: {activeCategoryLabel}</Pill>
            <Pill variant="subtle">정렬: {activeSortLabel}</Pill>
            <Pill variant="subtle">즐겨찾기 {favoriteProjects.length}</Pill>
          </>
        }
      />

      <section className="page-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2.5">
            {summaryMetrics.map((metric) => (
              <div
                key={metric.key}
                className={`rounded-full border border-slate-200/80 bg-white/85 px-3 py-2 text-sm text-slate-700 ${metric.className ?? ''}`}
              >
                <span className="text-xs font-medium text-slate-500">{metric.label}</span>
                <span className={`ml-2 font-semibold text-slate-900 ${metric.valueClassName ?? ''}`}>{metric.value}</span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={onExportFavorites}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200/80 bg-white/82 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white hover:text-slate-900"
          >
            <Download className="h-4 w-4" />
            즐겨찾기 내보내기
          </button>
        </div>

        <p className="mt-3 text-sm text-slate-500">
          현재 {visibleProjectsCount}개의 프로젝트가 보이고 있습니다. 자주 쓰는 항목은 컬렉션에서 다시 확인할 수 있어요.
        </p>
      </section>

      {homeProjectSections.map((section) => (
        <ProjectSection
          key={section.key}
          title={section.title}
          projects={section.projects}
          forceRender={section.forceRender}
          gridClassName={section.gridClassName}
          icon={section.icon}
          rightSlot={section.rightSlot}
          renderProjectCard={(project, index) =>
            renderProjectCard(
              project,
              section.rankOffset ? index + section.rankOffset : undefined,
              index + section.revealOffset,
            )
          }
        />
      ))}
    </PageShell>
  )
}

export const HomePageView = memo(HomePageViewBase)
HomePageView.displayName = 'HomePageView'
