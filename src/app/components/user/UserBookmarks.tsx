import { useState, useEffect } from 'react'
import { Bookmark, BookmarkCheck } from 'lucide-react'

interface RecentlyViewedProject {
  project: any
  timestamp: string
}

const BOOKMARKS_KEY = 'jb-hub:bookmarks'
const RECENTLY_VIEWED_KEY = 'jb-hub:recently-viewed'

// 사용자 데이터 가져오기
interface UserData {
  bookmarks: Set<number>
  recentlyViewed: RecentlyViewedProject[]
}

function getUserData(): UserData {
  try {
    const bookmarksData = localStorage.getItem(BOOKMARKS_KEY)
    const recentlyViewedData = localStorage.getItem(RECENTLY_VIEWED_KEY)

    const bookmarks = new Set(
      bookmarksData ? JSON.parse(bookmarksData) : []
    )

    const recentlyViewed: RecentlyViewedProject[] = recentlyViewedData
      ? JSON.parse(recentlyViewedData)
      : []

    return { bookmarks, recentlyViewed }
  } catch {
    return { bookmarks: new Set(), recentlyViewed: [] }
  }
}

function saveUserData(data: UserData) {
  try {
    localStorage.setItem(
      BOOKMARKS_KEY,
      JSON.stringify(Array.from(data.bookmarks))
    )
  } catch (e) {
    console.error('Failed to save bookmarks:', e)
  }

  try {
    localStorage.setItem(
      RECENTLY_VIEWED_KEY,
      JSON.stringify(data.recentlyViewed)
    )
  } catch (e) {
    console.error('Failed to save recently viewed:', e)
  }
}

// 북마크 토글
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

// 북마크 확인
export function isBookmarked(projectId: number): boolean {
  const { bookmarks } = getUserData()
  return bookmarks.has(projectId)
}

// 북마크된 ID 목록
export function getBookmarkedIds(): number[] {
  const { bookmarks } = getUserData()
  return Array.from(bookmarks)
}

// 최근 본 프로젝트에 추가
export function addToRecentlyViewed(project: any) {
  const data = getUserData()

  // 이미 있는 경우 제거
  data.recentlyViewed = data.recentlyViewed.filter(
    (item) => item.project.id !== project.id
  )

  // 맨 앞에 추가
  data.recentlyViewed.unshift({
    project,
    timestamp: new Date().toISOString(),
  })

  // 최대 50개만 저장
  data.recentlyViewed = data.recentlyViewed.slice(0, 50)

  saveUserData(data)
}

// 최근 본 프로젝트 목록
export function getRecentlyViewed(): RecentlyViewedProject[] {
  const { recentlyViewed } = getUserData()
  return recentlyViewed
}

interface BookmarkButtonProps {
  projectId: number
  isBookmarked?: boolean
  onToggle?: (isBookmarked: boolean) => void
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}

export function BookmarkButton({
  projectId,
  isBookmarked: controlledBookmarked,
  onToggle,
  size = 'md',
  showLabel = false,
}: BookmarkButtonProps) {
  const [internalBookmarked, setInternalBookmarked] = useState(() =>
    controlledBookmarked ?? isBookmarked(projectId)
  )

  const isBookmarked = controlledBookmarked ?? internalBookmarked

  const handleToggle = () => {
    const newState = toggleBookmark(projectId)
    if (controlledBookmarked === undefined) {
      setInternalBookmarked(newState)
    }
    onToggle?.(newState)
  }

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  }

  return (
    <button
      onClick={handleToggle}
      className={`flex items-center gap-1.5 p-2 rounded-lg transition-all ${
        isBookmarked
          ? 'text-yellow-600 bg-yellow-50 hover:bg-yellow-100'
          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
      }`}
      title={isBookmarked ? '저장 취소' : '저장하기'}
    >
      {isBookmarked ? (
        <BookmarkCheck className={sizeClasses[size]} />
      ) : (
        <Bookmark className={sizeClasses[size]} />
      )}
      {showLabel && (
        <span className="text-sm font-medium">
          {isBookmarked ? '저장됨' : '저장'}
        </span>
      )}
    </button>
  )
}
