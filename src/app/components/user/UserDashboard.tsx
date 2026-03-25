import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  BookOpen,
  Eye,
  FolderGit2,
  MessageCircle,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { PageHeader, PageShell, Pill } from '../common'
import { OpalCard } from '../opal/OpalCard'
import { getBookmarkedIds, getRecentlyViewed } from './UserBookmarks'

interface DashboardProject {
  id: number
  title: string
  department: string
  tags?: string[]
  views?: number
  stars?: number
}

interface RecentlyViewedItem {
  project: DashboardProject
  timestamp: string
}

interface DashboardStats {
  totalViews: number
  totalBookmarks: number
  totalProjects: number
  totalDepartments: number
  recentlyActive: boolean
  topDepartments: Array<{ name: string; count: number }>
  topTags: Array<{ name: string; count: number }>
  weeklyActivity: Array<{ day: string; count: number }>
}

interface UserDashboardProps {
  projects?: DashboardProject[]
  favoriteIds?: number[]
  recentProjectIds?: number[]
  onProjectClick?: (projectId: number) => void
  onNavigateToPage?: (pageId: string) => void
  showHeader?: boolean
}

const QUICK_LINKS = [
  {
    id: 'projects',
    label: '프로젝트 탐색',
    description: '전체 프로젝트 목록과 필터 화면으로 이동합니다.',
    icon: FolderGit2,
  },
  {
    id: 'profile',
    label: '내 프로필',
    description: '내가 만든 프로젝트와 즐겨찾기를 한 번에 확인합니다.',
    icon: Sparkles,
  },
  {
    id: 'community',
    label: '커뮤니티',
    description: '질문과 피드백을 주고받는 대화 공간으로 이동합니다.',
    icon: MessageCircle,
  },
  {
    id: 'knowledge',
    label: '지식 허브',
    description: '문서와 답변 기록을 빠르게 찾아봅니다.',
    icon: BookOpen,
  },
] as const

function buildWeeklyActivity(items: RecentlyViewedItem[]) {
  const now = new Date()
  const dailyCounts = new Map<string, number>()

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(now)
    date.setDate(now.getDate() - offset)
    dailyCounts.set(date.toDateString(), 0)
  }

  items.forEach((item) => {
    const viewedAt = new Date(item.timestamp)
    const key = viewedAt.toDateString()

    if (dailyCounts.has(key)) {
      dailyCounts.set(key, (dailyCounts.get(key) ?? 0) + 1)
    }
  })

  return Array.from(dailyCounts.entries()).map(([key, count]) => ({
    day: new Date(key).toLocaleDateString('ko-KR', { weekday: 'short' }),
    count,
  }))
}

function formatRelativeTime(timestamp: string) {
  const viewedAt = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - viewedAt.getTime()

  if (diff < 1000 * 60) {
    return '방금 전'
  }
  if (diff < 1000 * 60 * 60) {
    return `${Math.floor(diff / (1000 * 60))}분 전`
  }
  if (diff < 1000 * 60 * 60 * 24) {
    return `${Math.floor(diff / (1000 * 60 * 60))}시간 전`
  }

  return viewedAt.toLocaleDateString('ko-KR')
}

function buildFallbackRecentItems(projects: DashboardProject[], recentProjectIds: number[]) {
  return recentProjectIds
    .map((projectId, index) => {
      const project = projects.find((candidate) => candidate.id === projectId)
      if (!project) {
        return null
      }

      const viewedAt = new Date()
      viewedAt.setMinutes(viewedAt.getMinutes() - index * 12)

      return {
        project,
        timestamp: viewedAt.toISOString(),
      }
    })
    .filter((item): item is RecentlyViewedItem => Boolean(item))
}

export function UserDashboard({
  projects = [],
  favoriteIds,
  recentProjectIds = [],
  onProjectClick,
  onNavigateToPage,
  showHeader = true,
}: UserDashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentActivities, setRecentActivities] = useState<RecentlyViewedItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setIsLoading(true)

    const storedRecentlyViewed = getRecentlyViewed() as RecentlyViewedItem[]
    const recentItems =
      storedRecentlyViewed.length > 0 ? storedRecentlyViewed : buildFallbackRecentItems(projects, recentProjectIds)
    const bookmarkedIds = favoriteIds ?? getBookmarkedIds()

    const departmentCounts = new Map<string, number>()
    const tagCounts = new Map<string, number>()

    recentItems.forEach(({ project }) => {
      if (project.department) {
        departmentCounts.set(project.department, (departmentCounts.get(project.department) ?? 0) + 1)
      }

      ;(project.tags ?? []).forEach((tag) => {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
      })
    })

    setStats({
      totalViews: recentItems.reduce((sum, item) => sum + (item.project.views ?? 0), 0),
      totalBookmarks: bookmarkedIds.length,
      totalProjects: projects.length,
      totalDepartments: new Set(projects.map((project) => project.department).filter(Boolean)).size,
      recentlyActive: recentItems.length > 0,
      topDepartments: Array.from(departmentCounts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 5),
      topTags: Array.from(tagCounts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 10),
      weeklyActivity: buildWeeklyActivity(recentItems),
    })
    setRecentActivities(recentItems.slice(0, 6))
    setIsLoading(false)
  }, [favoriteIds, projects, recentProjectIds])

  const maxActivityCount = useMemo(
    () => Math.max(...(stats?.weeklyActivity.map((item) => item.count) ?? [0]), 1),
    [stats],
  )

  return (
    <PageShell density="compact" topInset={showHeader ? 'default' : 'none'}>
      {showHeader ? (
        <PageHeader
          variant="simple"
          eyebrow={
            <>
              <Activity className="h-3.5 w-3.5" />
              Personal Dashboard
            </>
          }
        title="개인 대시보드"
        description="최근 탐색 흐름, 즐겨찾기, 자주 보는 주제를 같은 레이아웃 안에서 빠르게 확인할 수 있도록 정리한 개인 업무 보드입니다."
        />
      ) : null}

      <section className="page-panel space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="page-summary-strip">
            <div className="page-summary-item">
              <span className="page-summary-label">누적 조회 수</span>
              <span className="page-summary-value">{stats?.totalViews.toLocaleString() ?? '0'}</span>
            </div>
            <div className="page-summary-item">
              <span className="page-summary-label">즐겨찾기 프로젝트</span>
              <span className="page-summary-value">{stats?.totalBookmarks ?? 0}</span>
            </div>
            <div className="page-summary-item">
              <span className="page-summary-label">탐색한 부서 수</span>
              <span className="page-summary-value">{stats?.totalDepartments ?? 0}</span>
            </div>
            <div className="page-summary-item">
              <span className="page-summary-label">최근 본 항목</span>
              <span className="page-summary-value">{recentActivities.length}</span>
            </div>
          </div>
          <span className="page-toolbar-note">최근 활동 {recentActivities.length}건 기준으로 자주 여는 화면만 빠르게 모아두었습니다.</span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon

            return (
              <button
                key={link.id}
                type="button"
                onClick={() => onNavigateToPage?.(link.id)}
                className="rounded-3xl border border-slate-200/85 bg-white/92 p-4 text-left transition hover:border-slate-300 hover:bg-white"
              >
                <div className="flex items-start gap-3">
                  <span className="project-section-icon">
                    <Icon className="h-5 w-5 text-slate-700" />
                  </span>
                  <div>
                    <p className="font-semibold text-slate-900">{link.label}</p>
                    <p className="mt-1 text-sm text-slate-500">{link.description}</p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {isLoading ? (
        <div className="page-panel flex min-h-[280px] items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[#315779]" />
        </div>
      ) : (
        <section className="page-card-grid">
          <OpalCard padding="comfortable" elevation="minimal">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="project-section-icon">
                  <TrendingUp className="h-5 w-5 text-slate-700" />
                </span>
                <h3 className="text-lg font-semibold text-slate-900">최근 활동</h3>
              </div>
              <div className="space-y-3">
                {recentActivities.length > 0 ? (
                  recentActivities.map((activity) => (
                    <button
                      key={`${activity.project.id}-${activity.timestamp}`}
                      type="button"
                      onClick={() => onProjectClick?.(activity.project.id)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-white"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-200/80 text-slate-700">
                        <Eye className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{activity.project.title}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {activity.project.department} · {formatRelativeTime(activity.timestamp)}
                        </p>
                      </div>
                    </button>
                  ))
                ) : (
                  <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                    아직 기록된 최근 활동이 없습니다.
                  </p>
                )}
              </div>
            </div>
          </OpalCard>

          <OpalCard padding="comfortable" elevation="minimal">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="project-section-icon">
                  <Sparkles className="h-5 w-5 text-slate-700" />
                </span>
                <h3 className="text-lg font-semibold text-slate-900">최근 7일 활동</h3>
              </div>
              <div className="space-y-3">
                {stats?.weeklyActivity.map((item) => (
                  <div key={item.day} className="flex items-center gap-3">
                    <span className="w-10 text-sm text-slate-600">{item.day}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#7f97b0] to-[#4f7394]"
                        style={{
                          width: `${Math.max((item.count / maxActivityCount) * 100, item.count > 0 ? 10 : 0)}%`,
                        }}
                      />
                    </div>
                    <span className="w-6 text-right text-sm font-medium text-slate-700">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </OpalCard>

          <OpalCard padding="comfortable" elevation="minimal">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="project-section-icon">
                  <FolderGit2 className="h-5 w-5 text-slate-700" />
                </span>
                <h3 className="text-lg font-semibold text-slate-900">관심 부서</h3>
              </div>
              <div className="space-y-2">
                {stats?.topDepartments.length ? (
                  stats.topDepartments.map((department) => (
                    <div
                      key={department.name}
                      className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3"
                    >
                      <span className="text-sm text-slate-700">{department.name}</span>
                      <span className="text-sm font-semibold text-slate-900">{department.count}</span>
                    </div>
                  ))
                ) : (
                  <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                    프로젝트를 둘러보면 관심 부서 흐름이 여기에 정리됩니다.
                  </p>
                )}
              </div>
            </div>
          </OpalCard>
        </section>
      )}

      <section className="page-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">관심 태그</h2>
            <p className="mt-1 text-sm text-slate-500">
              최근 본 프로젝트를 기준으로 자주 마주친 주제를 태그 형태로 모았습니다.
            </p>
          </div>
          <Pill variant="subtle">태그 {stats?.topTags.length ?? 0}</Pill>
        </div>
        <div className="mt-5 page-tag-cloud">
          {stats?.topTags.length ? (
            stats.topTags.map((tag) => (
              <button
                key={tag.name}
                type="button"
                onClick={() => onNavigateToPage?.('projects')}
                className="chip-filter chip-filter-idle"
              >
                {tag.name} ({tag.count})
              </button>
            ))
          ) : (
            <p className="text-sm text-slate-500">아직 집계된 관심 태그가 없습니다.</p>
          )}
        </div>
      </section>
    </PageShell>
  )
}
