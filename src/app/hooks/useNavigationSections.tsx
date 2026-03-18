import { useMemo } from 'react'
import { Briefcase, FolderGit2, Home, MessageSquare, Trophy, User } from 'lucide-react'
import type { NavigationSection } from '../components/common'
import type { PageId } from '../types/page'

interface UseNavigationSectionsOptions {
  visibleProjectCount: number
  discussionCount: number
  favoriteCount: number
}

export function useNavigationSections({
  visibleProjectCount,
  discussionCount,
  favoriteCount,
}: UseNavigationSectionsOptions) {
  return useMemo<NavigationSection<PageId>[]>(
    () => [
      {
        items: [
          { id: 'home', label: '홈', icon: <Home className="h-4 w-4" strokeWidth={1.5} /> },
          { id: 'ranking', label: '랭킹', icon: <Trophy className="h-4 w-4" strokeWidth={1.5} /> },
          {
            id: 'projects',
            label: '프로젝트',
            icon: <FolderGit2 className="h-4 w-4" strokeWidth={1.5} />,
            badge: visibleProjectCount,
          },
          {
            id: 'community',
            label: '커뮤니티',
            icon: <MessageSquare className="h-4 w-4" strokeWidth={1.5} />,
            badge: discussionCount,
          },
          { id: 'workspace', label: '워크스페이스', icon: <Briefcase className="h-4 w-4" strokeWidth={1.5} /> },
        ],
      },
      {
        items: [
          {
            id: 'profile',
            label: '프로필',
            icon: <User className="h-4 w-4" strokeWidth={1.5} />,
            badge: favoriteCount > 0 ? favoriteCount : undefined,
          },
        ],
      },
    ],
    [discussionCount, favoriteCount, visibleProjectCount],
  )
}

