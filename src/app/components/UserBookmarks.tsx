import { useState, useEffect } from 'react'

interface Project {
  id: number
  title: string
  description: string
  author: string
  department: string
  tags: string[]
  stars: number
  forks: number
  views: number
  comments: number
  updatedAt: string
  isNew?: boolean
  trend?: string
  badge?: string
}

interface BookmarkState {
  bookmarks: Set<number>
  recentlyViewed: Array<{ project: Project; viewedAt: string }>
}

const STORAGE_KEY = 'jbhub_user_data'

export function getUserData(): BookmarkState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const data = JSON.parse(stored)
      return {
        bookmarks: new Set(data.bookmarks || []),
        recentlyViewed: (data.recentlyViewed || []).map((item: any) => ({
          ...item,
          viewedAt: new Date(item.viewedAt).toISOString(),
        })),
      }
    }
  } catch {
    // Ignore error
  }
  return { bookmarks: new Set(), recentlyViewed: [] }
}

export function saveUserData(data: BookmarkState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    bookmarks: Array.from(data.bookmarks),
    recentlyViewed: data.recentlyViewed.slice(0, 50), // 최대 50개 저장
  }))
}

export function toggleBookmark(projectId: number): boolean {
  const data = getUserData()
  if (data.bookmarks.has(projectId)) {
    data.bookmarks.delete(projectId)
  } else {
    data.bookmarks.add(projectId)
  }
  saveUserData(data)
  return data.bookmarks.has(projectId)
}

export function isBookmarked(projectId: number): boolean {
  const data = getUserData()
  return data.bookmarks.has(projectId)
}

export function addToRecentlyViewed(project: Project) {
  const data = getUserData()
  // 중복 제거하고 맨 앞에 추가
  data.recentlyViewed = data.recentlyViewed.filter(
    (item) => item.project.id !== project.id
  )
  data.recentlyViewed.unshift({
    project,
    viewedAt: new Date().toISOString(),
  })
  saveUserData(data)
}

export function getRecentlyViewed(): Array<{ project: Project; viewedAt: string }> {
  const data = getUserData()
  return data.recentlyViewed.slice(0, 20) // 최대 20개 반환
}

export function getBookmarkedIds(): number[] {
  const data = getUserData()
  return Array.from(data.bookmarks)
}

// 북마크 버튼 컴포넌트
interface BookmarkButtonProps {
  projectId: number
  className?: string
  onToggle?: (isBookmarked: boolean) => void
}

export function BookmarkButton({ projectId, className = '', onToggle }: BookmarkButtonProps) {
  const [bookmarked, setBookmarked] = useState(false)

  useEffect(() => {
    setBookmarked(isBookmarked(projectId))
  }, [projectId])

  const handleToggle = () => {
    const newState = toggleBookmark(projectId)
    setBookmarked(newState)
    onToggle?.(newState)
  }

  return (
    <button
      onClick={handleToggle}
      className={`flex items-center gap-1 transition-colors ${className} ${
        bookmarked ? 'text-yellow-500' : 'text-gray-400 hover:text-gray-600'
      }`}
      title={bookmarked ? '북마크 제거' : '북마크 추가'}
    >
      <svg
        className="w-5 h-5"
        fill={bookmarked ? 'currentColor' : 'none'}
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
        />
      </svg>
      <span className="text-sm">{bookmarked ? '저장됨' : '저장'}</span>
    </button>
  )
}
