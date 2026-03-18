import { memo, useEffect, useState } from 'react'
import { Clock3, Download, RotateCcw, Sparkles } from 'lucide-react'
import { MetricCard, Pill, ProjectSection } from '../common'
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
  renderProjectCard: (project: Project, rank?: number, revealIndex?: number) => React.ReactNode
}

function HomePageViewBase({
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
      rightSlot: <Pill variant="subtle">스타 상위 3개</Pill>,
      rankOffset: 1,
      revealOffset: 0,
    },
    {
      key: 'trending',
      title: '상승 중인 프로젝트',
      projects: risingProjects.slice(0, 4),
      rankOffset: undefined,
      revealOffset: 2,
    },
    {
      key: 'favorites',
      title: '내 즐겨찾기',
      projects: favoriteProjects.slice(0, 4),
      rankOffset: undefined,
      revealOffset: 2,
    },
    {
      key: 'recent',
      title: '최근 본 프로젝트',
      projects: recentProjects.slice(0, 4),
      icon: <Clock3 className="h-5 w-5 text-slate-600" />,
      rankOffset: undefined,
      revealOffset: 2,
    },
  ]

  return (
    <div className="page-shell-relaxed page-shell-no-top">
      <header className="fade-up pt-8 sm:pt-12 lg:pt-16">
        <div className="hero-panel">
          <div className="floating-orb-hero-right" />
          <div className="floating-orb-hero-left" />
          <div className="relative z-10 hero-panel-grid">
            <div className="hero-panel-copy">
              <p className="inline-flex items-center gap-2 rounded-full border border-white/45 bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-50">
                {eyebrow}
              </p>
              <h1 className="text-3xl font-extrabold leading-[1.06] tracking-tight text-white sm:text-4xl lg:text-5xl">
                {homeTitle}
                <span className="text-gradient-brand block">{homeHighlight}</span>
              </h1>
              <p className="text-sm text-slate-100 sm:text-base">{homeDescription}</p>
            </div>
            <div className="hero-spotlight-card">
              <div className="hero-spotlight-grid">
                {summaryMetrics.slice(0, 4).map((metric) => (
                  <div key={`hero-${metric.key}`} className="hero-spotlight-item">
                    <span className="hero-spotlight-label">{metric.label}</span>
                    <strong className="hero-spotlight-value">{metric.value}</strong>
                  </div>
                ))}
              </div>
            </div>
            <div className="action-row hero-panel-actions">
              <OpalButton variant="secondary" size="sm" icon={<Download className="h-4 w-4" />} onClick={onExportFavorites}>
                즐겨찾기 내보내기
              </OpalButton>
              <OpalButton variant="secondary" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={onResetFilters}>
                필터 초기화
              </OpalButton>
              <OpalButton variant="primary" size="sm" icon={<Sparkles className="h-4 w-4" />} onClick={onSurpriseMe}>
                랜덤 추천
              </OpalButton>
            </div>
          </div>
          <div className="pill-row relative z-10 mt-5">
            <Pill>카테고리: {activeCategoryLabel}</Pill>
            <Pill>정렬: {activeSortLabel}</Pill>
            <Pill>결과: {visibleProjectsCount}</Pill>
          </div>
        </div>
      </header>

      <section className="home-metric-grid grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summaryMetrics.map((metric) => (
          <MetricCard
            key={metric.key}
            label={metric.label}
            value={metric.value}
            className={metric.className}
            valueClassName={metric.valueClassName}
          />
        ))}
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
    </div>
  )
}

export const HomePageView = memo(HomePageViewBase)
HomePageView.displayName = 'HomePageView'
