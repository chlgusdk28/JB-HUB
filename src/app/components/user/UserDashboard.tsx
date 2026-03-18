import { useState, useEffect } from 'react'
import { Activity, TrendingUp, Star, Eye, BookOpen, Trophy, Target, Flame, MessageCircle } from 'lucide-react'
import { getBookmarkedIds, getRecentlyViewed } from './UserBookmarks'

interface ActivityItem {
  id: string
  type: 'view' | 'bookmark' | 'like'
  projectName: string
  projectId: number
  timestamp: string
}

interface UserStats {
  totalViews: number
  totalBookmarks: number
  totalProjects: number
  totalDepartments: number
  recentlyActive: boolean
  topDepartments: { name: string; count: number }[]
  topTags: { name: string; count: number }[]
  weeklyActivity: { day: string; count: number }[]
}

interface UserDashboardProps {
  projects?: any[]
  favoriteIds?: number[]
  onProjectClick?: (projectId: number) => void
  onNavigateToPage?: (pageId: string) => void
}

export function UserDashboard({ projects, favoriteIds, onProjectClick, onNavigateToPage }: UserDashboardProps) {
  const [stats, setStats] = useState<UserStats | null>(null)
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchUserStats()
    fetchActivities()
  }, [])

  const fetchUserStats = async () => {
    setIsLoading(true)
    try {
      const recentlyViewed = getRecentlyViewed()
      const bookmarkedIds = getBookmarkedIds()

      // 부서별 통계
      const deptCounts: { [key: string]: number } = {}
      recentlyViewed.forEach(({ project }) => {
        deptCounts[project.department] = (deptCounts[project.department] || 0) + 1
      })

      // 태그별 통계
      const tagCounts: { [key: string]: number } = {}
      recentlyViewed.forEach(({ project }) => {
        project.tags?.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1
        })
      })

      // 주간 활동
      const weeklyActivity = []
      for (let i = 6; i >= 0; i--) {
        const date = new Date()
        date.setDate(date.getDate() - i)
        const dateStr = date.toLocaleDateString('ko-KR', { weekday: 'short' })
        weeklyActivity.push({
          day: dateStr,
          count: Math.floor(Math.random() * 10), // 데모 데이터
        })
      }

      setStats({
        totalViews: recentlyViewed.reduce((sum, { project }) => sum + (project.views || 0), 0),
        totalBookmarks: bookmarkedIds.length,
        totalProjects: 50, // API에서 가져올 수 있음
        totalDepartments: Object.keys(deptCounts).length,
        recentlyActive: recentlyViewed.length > 0,
        topDepartments: Object.entries(deptCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5),
        topTags: Object.entries(tagCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        weeklyActivity,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const fetchActivities = async () => {
    try {
      // 데모 활동 데이터
      const activities: ActivityItem[] = [
        {
          id: '1',
          type: 'view',
          projectName: 'AI 챗봇 자동 응답 시스템',
          projectId: 1,
          timestamp: new Date(Date.now() - 300000).toISOString(),
        },
        {
          id: '2',
          type: 'bookmark',
          projectName: 'React 디자인 시스템',
          projectId: 3,
          timestamp: new Date(Date.now() - 3600000).toISOString(),
        },
      ]
      setActivities(activities)
    } catch {
      setActivities([])
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[280px] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[#315779]"></div>
      </div>
    )
  }

  const getActivityIcon = (type: ActivityItem['type']) => {
    switch (type) {
      case 'view': return Eye
      case 'bookmark': return Star
      case 'like': return Flame
      default: return Activity
    }
  }

  const getActivityColor = (type: ActivityItem['type']) => {
    switch (type) {
      case 'view': return 'text-sky-700 bg-sky-100'
      case 'bookmark': return 'text-slate-700 bg-slate-100'
      case 'like': return 'text-rose-700 bg-rose-100'
      default: return 'text-slate-600 bg-slate-100'
    }
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    if (diff < 60000) return '방금 전'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`
    return date.toLocaleDateString('ko-KR')
  }

  const maxActivityCount = Math.max(...stats?.weeklyActivity.map(d => d.count), 1)

  return (
    <div className="page-shell">
      {/* Header */}
      <header className="surface-panel rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigateToPage?.('home')}
              className="glass-inline-button !px-3 !py-1.5 text-xs"
            >
              ← 홈
            </button>
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">내 대시보드</h1>
          </div>
          <button
            onClick={() => onNavigateToPage?.('profile')}
            className="glass-inline-button !px-3 !py-1.5 text-xs"
          >
            프로필 편집
          </button>
        </div>
      </header>

      <div className="space-y-6">
        {/* 환영 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="surface-soft rounded-2xl p-5">
            <Eye className="mb-2 h-7 w-7 text-slate-700" />
            <p className="text-sm text-slate-500">조회수</p>
            <p className="text-2xl font-bold text-slate-900">{stats?.totalViews || 0}</p>
          </div>

          <div className="surface-soft rounded-2xl p-5">
            <Star className="mb-2 h-7 w-7 text-slate-700" />
            <p className="text-sm text-slate-500">저장한 프로젝트</p>
            <p className="text-2xl font-bold text-slate-900">{stats?.totalBookmarks || 0}</p>
          </div>

          <div className="surface-soft rounded-2xl p-5">
            <Trophy className="mb-2 h-7 w-7 text-slate-700" />
            <p className="text-sm text-slate-500">활동 점수</p>
            <p className="text-2xl font-bold text-slate-900">{stats?.recentlyActive ? '활동 중' : '활동 필요'}</p>
          </div>

          <div className="surface-soft rounded-2xl p-5">
            <Target className="mb-2 h-7 w-7 text-slate-700" />
            <p className="text-sm text-slate-500">관심 부서</p>
            <p className="text-2xl font-bold text-slate-900">{stats?.totalDepartments || 0}개</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 주간 활동 */}
          <div className="surface-panel rounded-2xl p-5">
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
              <TrendingUp className="h-5 w-5 text-slate-700" />
              주간 활동
            </h3>
            <div className="space-y-3">
              {stats?.weeklyActivity.map((item, i) => {
                const height = (item.count / maxActivityCount) * 100
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-12 text-sm text-slate-600">{item.day}</span>
                    <div className="h-6 flex-1 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#7f97b0] to-[#4f7394] transition-all duration-500"
                        style={{ width: `${Math.max(height, 4)}%` }}
                      />
                    </div>
                    <span className="w-6 text-sm font-medium text-slate-700">{item.count}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 관심 부서 */}
          <div className="surface-panel rounded-2xl p-5">
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
              <BookOpen className="h-5 w-5 text-slate-700" />
              관심 부서
            </h3>
            <div className="space-y-2">
              {stats?.topDepartments.map((dept, i) => (
                <div key={dept.name} className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">{dept.name}</span>
                  <span className="text-sm text-slate-500">{dept.count}회</span>
                </div>
              ))}
              {stats?.topDepartments.length === 0 && (
                <p className="py-4 text-center text-sm text-slate-500">
                  프로젝트를 둘러보면 관심사가 분석됩니다.
                </p>
              )}
            </div>
          </div>

          {/* 최근 활동 */}
          <div className="surface-panel rounded-2xl p-5">
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
              <Activity className="h-5 w-5 text-slate-700" />
              최근 활동
            </h3>
            <div className="space-y-3">
              {activities.map((activity) => {
                const Icon = getActivityIcon(activity.type)
                return (
                  <div
                    key={activity.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors hover:bg-slate-50"
                    onClick={() => onProjectClick?.(activity.projectId)}
                  >
                    <div className={`p-2 rounded-full ${getActivityColor(activity.type)}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {activity.projectName}
                      </p>
                      <p className="text-xs text-slate-500">{formatTime(activity.timestamp)}</p>
                    </div>
                  </div>
                )
              })}
              {activities.length === 0 && (
                <p className="py-4 text-center text-sm text-slate-500">
                  아직 활동 내역이 없습니다.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 관심 태그 */}
        {stats?.topTags && stats.topTags.length > 0 && (
          <div className="surface-panel mt-6 rounded-2xl p-5">
            <h3 className="mb-4 font-semibold text-slate-900">관심 태그</h3>
            <div className="flex flex-wrap gap-2">
              {stats.topTags.map((tag) => (
                <button
                  key={tag.name}
                  onClick={() => onNavigateToPage?.('projects')}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                >
                  {tag.name} ({tag.count})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 빠른 링크 */}
        <div className="surface-panel mt-6 rounded-2xl p-5">
          <h3 className="mb-4 font-semibold text-slate-900">빠른 링크</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button
              onClick={() => onNavigateToPage?.('home')}
              className="rounded-xl border border-slate-200 p-4 text-center transition-colors hover:bg-slate-50"
            >
              <BookOpen className="mx-auto mb-2 h-6 w-6 text-slate-700" />
              <p className="text-sm font-medium">전체 프로젝트</p>
            </button>
            <button
              onClick={() => onNavigateToPage?.('profile')}
              className="rounded-xl border border-slate-200 p-4 text-center transition-colors hover:bg-slate-50"
            >
              <Star className="mx-auto mb-2 h-6 w-6 text-slate-700" />
              <p className="text-sm font-medium">저장한 프로젝트</p>
            </button>
            <button
              onClick={() => onNavigateToPage?.('community')}
              className="rounded-xl border border-slate-200 p-4 text-center transition-colors hover:bg-slate-50"
            >
              <MessageCircle className="mx-auto mb-2 h-6 w-6 text-slate-700" />
              <p className="text-sm font-medium">커뮤니티</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
