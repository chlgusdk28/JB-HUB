import { useState, useEffect } from 'react'
import { Bell, X, Check, CheckCircle, MessageSquare, TrendingUp, AlertCircle, Trash2 } from 'lucide-react'

export type NotificationType = 'project_update' | 'new_comment' | 'reply' | 'trending' | 'system'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  projectId?: number
  projectName?: string
  read: boolean
  createdAt: string
}

const STORAGE_KEY = 'jb-hub:notifications'

// 저장소에서 알림 불러오기
export function getUserNotifications(): Notification[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

// 저장소에 알림 저장
function saveNotifications(notifications: Notification[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications))
  } catch (e) {
    console.error('Failed to save notifications:', e)
  }
}

// 알림 추가
export function addNotification(notification: Omit<Notification, 'id' | 'read' | 'createdAt'>) {
  const notifications = getUserNotifications()
  const newNotification: Notification = {
    ...notification,
    id: Date.now().toString(),
    read: false,
    createdAt: new Date().toISOString(),
  }
  notifications.unshift(newNotification)
  // 최대 100개만 저장
  saveNotifications(notifications.slice(0, 100))
  return newNotification
}

// 읽음 표시
export function markAsRead(id: string) {
  const notifications = getUserNotifications()
  const updated = notifications.map(n =>
    n.id === id ? { ...n, read: true } : n
  )
  saveNotifications(updated)
}

// 모두 읽음 표시
export function markAllAsRead() {
  const notifications = getUserNotifications()
  const updated = notifications.map(n => ({ ...n, read: true }))
  saveNotifications(updated)
}

// 안 읽은 알림 수
export function getUnreadCount(): number {
  return getUserNotifications().filter(n => !n.read).length
}

// 알림 삭제
export function deleteNotification(id: string) {
  const notifications = getUserNotifications()
  const updated = notifications.filter(n => n.id !== id)
  saveNotifications(updated)
}

// 알림 생성 헬퍼 함수들
export function notifyProjectUpdate(projectId: number, projectName: string, message: string) {
  return addNotification({
    type: 'project_update',
    title: `${projectName} 업데이트`,
    message,
    projectId,
    projectName,
  })
}

export function notifyNewComment(projectId: number, projectName: string, commenter: string) {
  return addNotification({
    type: 'new_comment',
    title: `${projectName}에 새 댓글`,
    message: `${commenter}님이 댓글을 남겼습니다.`,
    projectId,
    projectName,
  })
}

export function notifyReply(projectName: string, replier: string) {
  return addNotification({
    type: 'reply',
    title: `${projectName}에서 답글`,
    message: `${replier}님이 답글을 달았습니다.`,
    projectName,
  })
}

export function notifyTrending(projectName: string, rank: number) {
  return addNotification({
    type: 'trending',
    title: `🔥 인기 프로젝트`,
    message: `${projectName}이(가) ${rank}위에 올랐습니다!`,
    projectName,
  })
}

export function notifySystem(message: string) {
  return addNotification({
    type: 'system',
    title: '시스템 알림',
    message,
  })
}

interface NotificationBellProps {
  onClick?: () => void
}

export function NotificationBell({ onClick }: NotificationBellProps) {
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    setUnreadCount(getUnreadCount())

    const handleStorageChange = () => {
      setUnreadCount(getUnreadCount())
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  return (
    <button
      onClick={onClick}
      className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
      aria-label="알림"
    >
      <Bell className="w-5 h-5 text-gray-700" />
      {unreadCount > 0 && (
        <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  )
}

interface NotificationPanelProps {
  projectId?: number
  onClose: () => void
}

export function NotificationPanel({ projectId, onClose }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  useEffect(() => {
    loadNotifications()
  }, [projectId])

  const loadNotifications = () => {
    let all = getUserNotifications()
    if (projectId) {
      all = all.filter(n => n.projectId === projectId)
    }
    setNotifications(all)
  }

  const handleMarkAsRead = (id: string) => {
    markAsRead(id)
    setNotifications(notifications.map(n =>
      n.id === id ? { ...n, read: true } : n
    ))
  }

  const handleMarkAllAsRead = () => {
    markAllAsRead()
    setNotifications(notifications.map(n => ({ ...n, read: true })))
  }

  const handleDelete = (id: string) => {
    deleteNotification(id)
    setNotifications(notifications.filter(n => n.id !== id))
  }

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case 'project_update': return <CheckCircle className="w-5 h-5 text-sky-700" />
      case 'new_comment': return <MessageSquare className="w-5 h-5 text-slate-700" />
      case 'reply': return <MessageSquare className="w-5 h-5 text-slate-700" />
      case 'trending': return <TrendingUp className="w-5 h-5 text-sky-700" />
      case 'system': return <AlertCircle className="w-5 h-5 text-slate-600" />
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    if (diff < 60000) return '방금 전'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}일 전`
    return date.toLocaleDateString('ko-KR')
  }

  const filteredNotifications = notifications.filter(n =>
    filter === 'all' ? true : !n.read
  )

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-slate-900/40 backdrop-blur-[2px]">
      <div className="h-screen w-full max-w-md border-l border-slate-200 bg-white/96 shadow-[0_14px_30px_rgba(10,34,56,0.18)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">알림</h2>
            <p className="text-sm text-slate-500">
              {notifications.filter(n => !n.read).length}개 안 읽음
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 transition-colors hover:bg-slate-100"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Filter */}
        <div className="flex gap-2 border-b border-slate-200 p-4">
          <button
            onClick={() => setFilter('all')}
            className={`chip-filter ${
              filter === 'all'
                ? 'chip-filter-active'
                : 'chip-filter-idle'
            }`}
          >
            전체
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`chip-filter ${
              filter === 'unread'
                ? 'chip-filter-active'
                : 'chip-filter-idle'
            }`}
          >
            안 읽음
          </button>
          {notifications.some(n => !n.read) && (
            <button
              onClick={handleMarkAllAsRead}
              className="ml-auto rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            >
              모두 읽음
            </button>
          )}
        </div>

        {/* Notifications */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 180px)' }}>
          {filteredNotifications.length === 0 ? (
            <div className="p-8 text-center">
              <Bell className="mx-auto mb-4 h-16 w-16 text-slate-300" />
              <p className="text-slate-500">
                {filter === 'unread' ? '안 읽은 알림이 없습니다.' : '알림이 없습니다.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 transition-colors hover:bg-slate-50 ${
                    !notification.read ? 'bg-sky-50/70' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {getIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-900">
                            {notification.title}
                          </p>
                          <p className="mt-0.5 text-sm text-slate-600">
                            {notification.message}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {formatTime(notification.createdAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {!notification.read && (
                            <button
                              onClick={() => handleMarkAsRead(notification.id)}
                              className="rounded p-1 transition-colors hover:bg-slate-200"
                              title="읽음 표시"
                            >
                              <Check className="h-4 w-4 text-slate-500" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(notification.id)}
                            className="rounded p-1 transition-colors hover:bg-rose-100"
                            title="삭제"
                          >
                            <Trash2 className="h-4 w-4 text-slate-400 hover:text-rose-600" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
