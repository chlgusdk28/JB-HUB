import { useMemo, useState } from 'react'
import { Eye, GitFork, Globe, Lock, Star, TrendingUp } from 'lucide-react'
import type { Project } from '../lib/project-utils'
import { OpalButton } from './opal/OpalButton'
import { OpalCard } from './opal/OpalCard'
import { OpalProjectCard } from './opal/OpalProjectCard'

interface UserProfileProps {
  projects: Project[]
  favoriteIds: number[]
  recentProjectIds: number[]
  currentUser: {
    name: string
    department: string
  }
  onProjectClick?: (projectId: number) => void
}

export function UserProfile({
  projects,
  favoriteIds,
  recentProjectIds,
  currentUser,
  onProjectClick,
}: UserProfileProps) {
  const [isPublic, setIsPublic] = useState(true)

  const ownedProjects = useMemo(
    () => projects.filter((project) => project.author === currentUser.name),
    [projects, currentUser.name],
  )

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds])

  const favoriteProjects = useMemo(
    () => projects.filter((project) => favoriteSet.has(project.id)).sort((a, b) => b.stars - a.stars),
    [projects, favoriteSet],
  )

  const recentProjects = useMemo(() => {
    return recentProjectIds
      .map((id) => projects.find((project) => project.id === id))
      .filter((project): project is Project => Boolean(project))
  }, [recentProjectIds, projects])

  const ownedStats = useMemo(() => {
    return ownedProjects.reduce(
      (acc, project) => {
        acc.stars += project.stars
        acc.forks += project.forks
        acc.views += project.views
        return acc
      },
      { stars: 0, forks: 0, views: 0 },
    )
  }, [ownedProjects])

  const topTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const project of ownedProjects) {
      for (const tag of project.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1)
      }
    }

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
  }, [ownedProjects])

  return (
    <div className="page-shell">
      <header className="surface-panel rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-200 text-2xl font-bold text-slate-700">
              {currentUser.name.slice(0, 1)}
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">{currentUser.name}</h1>
              <p className="text-sm text-slate-600">{currentUser.department}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  프로젝트 {ownedProjects.length}개
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  즐겨찾기 {favoriteProjects.length}개
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <OpalButton
              variant="secondary"
              size="sm"
              icon={isPublic ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              onClick={() => setIsPublic((prev) => !prev)}
            >
              {isPublic ? '공개 프로필' : '비공개 프로필'}
            </OpalButton>
            <OpalButton variant="secondary" size="sm">
              공유
            </OpalButton>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <OpalCard padding="comfortable" elevation="minimal">
          <div className="flex items-center gap-3">
            <Star className="h-5 w-5 text-slate-700" />
            <div>
              <p className="text-xs text-slate-500">총 스타</p>
              <p className="text-xl font-semibold text-slate-900">{ownedStats.stars}</p>
            </div>
          </div>
        </OpalCard>
        <OpalCard padding="comfortable" elevation="minimal">
          <div className="flex items-center gap-3">
            <GitFork className="h-5 w-5 text-slate-700" />
            <div>
              <p className="text-xs text-slate-500">총 포크</p>
              <p className="text-xl font-semibold text-slate-900">{ownedStats.forks}</p>
            </div>
          </div>
        </OpalCard>
        <OpalCard padding="comfortable" elevation="minimal">
          <div className="flex items-center gap-3">
            <Eye className="h-5 w-5 text-slate-700" />
            <div>
              <p className="text-xs text-slate-500">총 조회수</p>
              <p className="text-xl font-semibold text-slate-900">{ownedStats.views.toLocaleString()}</p>
            </div>
          </div>
        </OpalCard>
        <OpalCard padding="comfortable" elevation="minimal">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-slate-700" />
            <div>
              <p className="text-xs text-slate-500">최근 방문</p>
              <p className="text-xl font-semibold text-slate-900">{recentProjects.length}</p>
            </div>
          </div>
        </OpalCard>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">주요 태그</h2>
        <div className="flex flex-wrap gap-2">
          {topTags.length > 0 ? (
            topTags.map(([tag, count]) => (
              <span
                key={tag}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
              >
                {tag} ({count})
              </span>
            ))
          ) : (
            <p className="text-sm text-slate-600">아직 태그 통계가 없습니다.</p>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">내 프로젝트</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {ownedProjects.map((project) => (
            <OpalProjectCard key={project.id} {...project} onClick={() => onProjectClick?.(project.id)} />
          ))}
          {ownedProjects.length === 0 ? (
            <div className="empty-panel">
              <p className="text-sm text-slate-600">등록된 내 프로젝트가 없습니다.</p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">즐겨찾기 프로젝트</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {favoriteProjects.slice(0, 6).map((project) => (
            <OpalProjectCard key={project.id} {...project} onClick={() => onProjectClick?.(project.id)} />
          ))}
          {favoriteProjects.length === 0 ? (
            <div className="empty-panel">
              <p className="text-sm text-slate-600">즐겨찾기한 프로젝트가 없습니다.</p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
