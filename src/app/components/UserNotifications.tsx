import { useState, useEffect } from 'react'
import { Bell, X, Check, CheckCheck, Star, MessageSquare, TrendingUp } from 'lucide-react'

interface Notification {
  id: string
  type: 'project_update' | 'new_comment' | 'reply' | 'trending' | 'system'
  title: string
  message: string
  link?: string
  read: boolean
  createdAt: string
  data?: any
}

const NOTIFICATIONS_KEY = 'jbhub_notifications'

export function getUserNotifications(): Notification[] {
  try {
    const stored = localStorage.getItem(NOTIFICATIONS_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // Ignore error
  }
  return []
}

export function saveNotifications(notifications: Notification[]) {
  localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications.slice(0, 100)))
}

export function addNotification(notification: Omit<Notification, 'id' | 'createdAt'>) {
  const notifications = getUserNotifications()
  const newNotification: Notification = {
    ...notification,
    id: Date.now().toString() + Math.random().toString(36).substring(2),
    createdAt: new Date().toISOString(),
  }
  saveNotifications([newNotification, ...notifications])
  return newNotification
}

export function markAsRead(notificationId: string) {
  const notifications = getUserNotifications()
  const updated = notifications.map(n =>
    n.id === notificationId ? { ...n, read: true } : n
  )
  saveNotifications(updated)
}

export function markAllAsRead() {
  const notifications = getUserNotifications()
  const updated = notifications.map(n => ({ ...n, read: true }))
  saveNotifications(updated)
}

export function getUnreadCount(): number {
  const notifications = getUserNotifications()
  return notifications.filter(n => !n.read).length
}

// 알림 버튼 컴포넌트
interface NotificationBellProps {
  onOpen?: () => void
}

export function NotificationBell({ onOpen }: NotificationBellProps) {
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    setUnreadCount(getUnreadCount())

    // 30초마다 카운트 업데이트
    const interval = setInterval(() => {
      setUnreadCount(getUnreadCount())
    }, 30000)

    return () => clearInterval(interval)
  }, [])

  return (
    <button
      onClick={onOpen}
      className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
      title="알림"
    >
      <Bell className="w-5 h-5" />
      {unreadCount > 0 && (
        <span className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white text-xs font-medium rounded-full flex items-center justify-center">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  )
}

// 알림 패널 컴포넌트
interface NotificationPanelProps {
  isOpen: boolean
  onClose: () => void
  onNavigate?: (path: string) => void
}

export function NotificationPanel({ isOpen, onClose, onNavigate }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  useEffect(() => {
    if (isOpen) {
      setNotifications(getUserNotifications())
    }
  }, [isOpen])

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
    const updated = notifications.filter(n => n.id !== id)
    saveNotifications(updated)
    setNotifications(updated)
  }

  const handleClearAll = () => {
    if (!confirm('모든 알림을 삭제하시겠습니까?')) return
    saveNotifications([])
    setNotifications([])
  }

  const handleClick = (notification: Notification) => {
    if (!notification.read) {
      handleMarkAsRead(notification.id)
    }
    if (notification.link && onNavigate) {
      onNavigate(notification.link)
      onClose()
    }
  }

  const getNotificationIcon = (type: Notification['type']) => {
    const icons = {
      project_update: TrendingUp,
      new_comment: MessageSquare,
      reply: MessageSquare,
      trending: Star,
      system: Bell,
    }
    return icons[type] || Bell
  }

  const getNotificationColor = (type: Notification['type']) => {
    const colors = {
      project_update: 'bg-blue-100 text-blue-600',
      new_comment: 'bg-green-100 text-green-600',
      reply: 'bg-purple-100 text-purple-600',
      trending: 'bg-yellow-100 text-yellow-600',
      system: 'bg-gray-100 text-gray-600',
    }
    return colors[type] || colors.system
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

  const filteredNotifications = filter === 'unread'
    ? notifications.filter(n => !n.read)
    : notifications

  const unreadCount = notifications.filter(n => !n.read).length

  if (!isOpen) return null

  return (
    <>
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />
      <div className="fixed right-4 top-16 w-96 bg-white rounded-lg shadow-xl z-50 max-h-[calc(100vh-120px)] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-gray-900">알림</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                모두 읽음
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 text-sm rounded-full ${
                filter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              전체 ({notifications.length})
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-3 py-1 text-sm rounded-full ${
                filter === 'unread'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              안 읽음 ({unreadCount})
            </button>
          </div>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto">
          {filteredNotifications.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Bell className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>{filter === 'unread' ? '읽지 않은 알림이 없습니다.' : '알림이 없습니다.'}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredNotifications.map((notification) => {
                const Icon = getNotificationIcon(notification.type)
                return (
                  <div
                    key={notification.id}
                    onClick={() => handleClick(notification)}
                    className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                      !notification.read ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${getNotificationColor(notification.type)}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className={`text-sm font-medium ${
                              notification.read ? 'text-gray-700' : 'text-gray-900'
                            }`}>
                              {notification.title}
                            </p>
                            <p className={`text-xs mt-1 ${
                              notification.read ? 'text-gray-400' : 'text-gray-500'
                            }`}>
                              {notification.message}
                            </p>
                          </div>
                          {!notification.read && (
                            <span className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0 mt-1" />
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-gray-400">
                            {formatTime(notification.createdAt)}
                          </span>
                          <div className="flex items-center gap-1">
                            {!notification.read && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleMarkAsRead(notification.id)
                                }}
                                className="p-1 text-gray-400 hover:text-blue-600"
                                title="읽음 표시"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(notification.id)
                              }}
                              className="p-1 text-gray-400 hover:text-red-600"
                              title="삭제"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="p-3 border-t border-gray-200 flex justify-center">
            <button
              onClick={handleClearAll}
              className="text-sm text-red-600 hover:text-red-700"
            >
              모든 알림 삭제
            </button>
          </div>
        )}
      </div>
    </>
  )
}

// 알림 생성 헬퍼 함수
export function notifyProjectUpdate(projectId: number, projectName: string) {
  return addNotification({
    type: 'project_update',
    title: '프로젝트가 업데이트되었습니다',
    message: `${projectName}에 새로운 변경사항이 있습니다.`,
    link: `/project/${projectId}`,
    read: false,
  })
}

export function notifyNewComment(projectId: number, projectName: string, author: string) {
  return addNotification({
    type: 'new_comment',
    title: '새 댓글이 달렸습니다',
    message: `${projectName}에 ${author}님이 댓글을 남겼습니다.`,
    link: `/project/${projectId}#comments`,
    read: false,
  })
}

export function notifyReply(projectId: number, projectName: string, author: string) {
  return addNotification({
    type: 'reply',
    title: '답글이 달렸습니다',
    message: `${author}님이 내 댓글에 답글을 달았습니다.`,
    link: `/project/${projectId}#comments`,
    read: false,
  })
}

export function notifyTrending(projectId: number, projectName: string) {
  return addNotification({
    type: 'trending',
    title: '인기 프로젝트',
    message: `${projectName}이 인기 프로젝트에 올랐습니다!`,
    link: `/project/${projectId}`,
    read: false,
  })
}

export function notifySystem(title: string, message: string, link?: string) {
  return addNotification({
    type: 'system',
    title,
    message,
    link,
    read: false,
  })
}
