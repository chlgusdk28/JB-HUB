import { useState, useEffect, useMemo } from 'react'
import { Calendar, Clock, Eye, Star, MessageSquare, TrendingUp, Filter } from 'lucide-react'

interface TimelineEvent {
  id: string
  type: 'view' | 'bookmark' | 'comment' | 'like' | 'share' | 'create'
  projectName: string
  projectId: number
  timestamp: string
  details?: string
}

interface ActivityTimelineProps {
  projects?: any[]
  bookmarkedIds?: number[]
}

export function ActivityTimeline({ projects = [], bookmarkedIds = [] }: ActivityTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'all'>('week')
  const [eventType, setEventType] = useState<string>('all')

  useEffect(() => {
    loadEvents()
  }, [projects, bookmarkedIds])

  const loadEvents = () => {
    // localStorage에서 활동 기록 불러오기
    try {
      const recentlyViewed = JSON.parse(localStorage.getItem('jb-hub:recently-viewed') || '[]')
      const eventList: TimelineEvent[] = []

      // 최근 본 프로젝트 이벤트
      recentlyViewed.forEach((item: any) => {
        eventList.push({
          id: `view-${item.project.id}-${item.timestamp}`,
          type: 'view',
          projectName: item.project.title,
          projectId: item.project.id,
          timestamp: item.timestamp,
        })
      })

      // 북마크 이벤트
      bookmarkedIds.forEach((id) => {
        const project = projects.find((p) => p.id === id)
        if (project) {
          eventList.push({
            id: `bookmark-${id}`,
            type: 'bookmark',
            projectName: project.title,
            projectId: id,
            timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(), // 데모용
          })
        }
      })

      // 데모용 추가 이벤트
      eventList.push(
        {
          id: 'comment-1',
          type: 'comment',
          projectName: 'AI 챗봇 자동 응답 시스템',
          projectId: 1,
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          details: '댓글을 작성했습니다',
        },
        {
          id: 'share-1',
          type: 'share',
          projectName: 'React 디자인 시스템',
          projectId: 3,
          timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
          details: '프로젝트를 공유했습니다',
        }
      )

      // 시간순 정렬
      eventList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

      setEvents(eventList)
    } catch (e) {
      console.error('Failed to load events:', e)
    }
  }

  const filteredEvents = useMemo(() => {
    const now = new Date()
    return events.filter((event) => {
      const eventDate = new Date(event.timestamp)
      const diffDays = Math.floor((now.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24))

      if (timeRange === 'week' && diffDays > 7) return false
      if (timeRange === 'month' && diffDays > 30) return false

      if (eventType !== 'all' && event.type !== eventType) return false

      return true
    })
  }, [events, timeRange, eventType])

  const groupedEvents = useMemo(() => {
    const groups: Record<string, TimelineEvent[]> = {}

    filteredEvents.forEach((event) => {
      const date = new Date(event.timestamp)
      const today = new Date()
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)

      let dateKey: string
      if (date.toDateString() === today.toDateString()) {
        dateKey = '오늘'
      } else if (date.toDateString() === yesterday.toDateString()) {
        dateKey = '어제'
      } else {
        dateKey = date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
      }

      if (!groups[dateKey]) {
        groups[dateKey] = []
      }
      groups[dateKey].push(event)
    })

    return groups
  }, [filteredEvents])

  const getEventIcon = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'view': return { icon: Eye, color: 'text-blue-600 bg-blue-100' }
      case 'bookmark': return { icon: Star, color: 'text-yellow-600 bg-yellow-100' }
      case 'comment': return { icon: MessageSquare, color: 'text-green-600 bg-green-100' }
      case 'like': return { icon: TrendingUp, color: 'text-red-600 bg-red-100' }
      case 'share': return { icon: ShareIcon, color: 'text-purple-600 bg-purple-100' }
      default: return { icon: Clock, color: 'text-gray-600 bg-gray-100' }
    }
  }

  const getEventLabel = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'view': return '조회함'
      case 'bookmark': return '저장함'
      case 'comment': return '댓글 작성'
      case 'like': return '좋아요'
      case 'share': return '공유함'
      default: return '활동'
    }
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    if (diff < 60000) return '방금 전'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  }

  // 활동 통계
  const stats = useMemo(() => {
    const todayEvents = filteredEvents.filter((e) => {
      const date = new Date(e.timestamp)
      const today = new Date()
      return date.toDateString() === today.toDateString()
    })

    return {
      today: todayEvents.length,
      total: filteredEvents.length,
      byType: {
        view: filteredEvents.filter((e) => e.type === 'view').length,
        bookmark: filteredEvents.filter((e) => e.type === 'bookmark').length,
        comment: filteredEvents.filter((e) => e.type === 'comment').length,
      },
    }
  }, [filteredEvents])

  return (
    <div className="space-y-6">
      {/* 헤더 및 통계 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">활동 타임라인</h3>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex gap-2 text-sm">
            <button
              onClick={() => setTimeRange('week')}
              className={`px-3 py-1 rounded-lg ${
                timeRange === 'week'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              1주일
            </button>
            <button
              onClick={() => setTimeRange('month')}
              className={`px-3 py-1 rounded-lg ${
                timeRange === 'month'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              1개월
            </button>
            <button
              onClick={() => setTimeRange('all')}
              className={`px-3 py-1 rounded-lg ${
                timeRange === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              전체
            </button>
          </div>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="px-3 py-1 border border-gray-300 rounded-lg text-sm"
          >
            <option value="all">전체 활동</option>
            <option value="view">조회</option>
            <option value="bookmark">저장</option>
            <option value="comment">댓글</option>
          </select>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-2xl font-bold text-blue-600">{stats.today}</div>
          <div className="text-sm text-gray-500">오늘 활동</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-2xl font-bold text-green-600">{stats.total}</div>
          <div className="text-sm text-gray-500">전체 활동</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-2xl font-bold text-yellow-600">{stats.byType.bookmark}</div>
          <div className="text-sm text-gray-500">저장한 프로젝트</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-2xl font-bold text-purple-600">{stats.byType.view}</div>
          <div className="text-sm text-gray-500">조회한 프로젝트</div>
        </div>
      </div>

      {/* 타임라인 */}
      <div className="space-y-6">
        {Object.keys(groupedEvents).length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <Calendar className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500">활동 내역이 없습니다.</p>
            <p className="text-sm text-gray-400 mt-1">프로젝트를 둘러보고 활동을 시작해보세요!</p>
          </div>
        ) : (
          Object.entries(groupedEvents).map(([dateLabel, dateEvents]) => (
            <div key={dateLabel}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-px h-6 bg-gray-300"></div>
                <span className="text-sm font-medium text-gray-600">{dateLabel}</span>
              </div>
              <div className="ml-4 space-y-2">
                {dateEvents.map((event) => {
                  const { icon: Icon, color } = getEventIcon(event.type)
                  return (
                    <div
                      key={event.id}
                      className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:shadow-sm transition-shadow"
                    >
                      <div className={`p-2 rounded-full ${color} flex-shrink-0`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-gray-900">{event.projectName}</p>
                          <span className="text-xs text-gray-400">{formatTime(event.timestamp)}</span>
                        </div>
                        <p className="text-sm text-gray-600">{getEventLabel(event.type)}</p>
                        {event.details && (
                          <p className="text-xs text-gray-500 mt-1">{event.details}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// Simple Share icon component
function ShareIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
      />
    </svg>
  )
}
