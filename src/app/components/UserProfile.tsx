import { useMemo } from 'react'
import { Globe, Lock, Sparkles, Star } from 'lucide-react'
import { PageHeader, PageShell, Pill, ProjectSection } from './common'
import { OpalButton } from './opal/OpalButton'
import { OpalProjectCard } from './opal/OpalProjectCard'
import type { Density, UserSettingsState } from '../lib/user-settings'

interface ProfileProject {
  id: number
  title: string
  description: string
  author: string
  department: string
  stars: number
  forks: number
  comments: number
  views: number
  tags: string[]
  createdAt?: string
  isNew?: boolean
}

interface UserProfileProps {
  projects: ProfileProject[]
  favoriteIds: number[]
  recentProjectIds: number[]
  currentUser: {
    name: string
    department: string
  }
  privacy?: UserSettingsState['privacy']
  cardDensity?: Density
  onProjectClick?: (projectId: number) => void
}

const DEFAULT_PRIVACY: UserSettingsState['privacy'] = {
  profilePublic: false,
  showActivity: true,
  showBookmarks: true,
}

export function UserProfile({
  projects,
  favoriteIds,
  recentProjectIds,
  currentUser,
  privacy = DEFAULT_PRIVACY,
  cardDensity = 'compact',
  onProjectClick,
}: UserProfileProps) {
  const ownedProjects = useMemo(
    () => projects.filter((project) => project.author === currentUser.name),
    [currentUser.name, projects],
  )

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds])

  const favoriteProjects = useMemo(
    () => projects.filter((project) => favoriteSet.has(project.id)).sort((left, right) => right.stars - left.stars),
    [favoriteSet, projects],
  )

  const recentProjects = useMemo(
    () =>
      recentProjectIds
        .map((id) => projects.find((project) => project.id === id))
        .filter((project): project is ProfileProject => Boolean(project)),
    [projects, recentProjectIds],
  )

  const ownedStats = useMemo(
    () =>
      ownedProjects.reduce(
        (accumulator, project) => {
          accumulator.stars += project.stars
          accumulator.views += project.views
          return accumulator
        },
        { stars: 0, views: 0 },
      ),
    [ownedProjects],
  )

  const topTags = useMemo(() => {
    const counts = new Map<string, number>()

    ownedProjects.forEach((project) => {
      project.tags.forEach((tag) => {
        counts.set(tag, (counts.get(tag) ?? 0) + 1)
      })
    })

    return Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
  }, [ownedProjects])

  const summaryItems = [
    { key: 'projects', label: '내 프로젝트', value: ownedProjects.length },
    { key: 'stars', label: '누적 별표', value: ownedStats.stars },
    { key: 'views', label: '조회 수', value: ownedStats.views.toLocaleString() },
    {
      key: 'privacy',
      label: '공개 상태',
      value: privacy.profilePublic ? '공개' : '비공개',
    },
  ]

  const shellDensity = cardDensity === 'compact' ? 'compact' : 'default'
  const profileVisibilityLabel = privacy.profilePublic ? '공개 프로필' : '비공개 프로필'

  return (
    <PageShell density={shellDensity}>
      <PageHeader
        eyebrow={
          <>
            <Sparkles className="h-3.5 w-3.5" />
            Personal Profile
          </>
        }
        title={currentUser.name}
        description={`${currentUser.department}에서 활동 중인 사용자 프로필입니다.`}
        actions={
          <OpalButton
            variant="secondary"
            size="sm"
            icon={privacy.profilePublic ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          >
            {profileVisibilityLabel}
          </OpalButton>
        }
        meta={
          <>
            <Pill variant="subtle">{currentUser.department}</Pill>
            <Pill variant="subtle">{privacy.showActivity ? `최근 활동 ${recentProjects.length}` : '활동 비공개'}</Pill>
            <Pill variant="subtle">{privacy.showBookmarks ? `즐겨찾기 ${favoriteProjects.length}` : '즐겨찾기 비공개'}</Pill>
          </>
        }
      />

      <section className="page-panel space-y-4">
        <div className="page-summary-strip">
          {summaryItems.map((item) => (
            <div key={item.key} className="page-summary-item">
              <span className="page-summary-label">{item.label}</span>
              <span className="page-summary-value">{item.value}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500">자주 쓰는 태그</span>
          {topTags.length > 0 ? (
            topTags.map(([tag, count]) => (
              <Pill key={tag} variant="subtle">
                {tag} {count}
              </Pill>
            ))
          ) : (
            <span className="page-toolbar-note">아직 집계된 태그가 없습니다.</span>
          )}
        </div>
      </section>

      <section className="page-panel space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">최근 본 프로젝트</h2>
          <Pill variant="subtle">{privacy.showActivity ? recentProjects.length : 0}</Pill>
        </div>

        {privacy.showActivity ? (
          recentProjects.length > 0 ? (
            <div className="space-y-2">
              {recentProjects.slice(0, 4).map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => onProjectClick?.(project.id)}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-white"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{project.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{project.department}</p>
                  </div>
                  <span className="text-xs font-medium text-slate-500">조회 {project.views}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">최근 본 프로젝트가 없습니다.</p>
          )
        ) : (
          <p className="text-sm text-slate-500">개인설정에서 활동 이력 표시가 꺼져 있어 최근 프로젝트 영역을 숨겼습니다.</p>
        )}
      </section>

      {ownedProjects.length > 0 ? (
        <ProjectSection
          title="내 프로젝트"
          projects={ownedProjects as never}
          rightSlot={<Pill variant="subtle">총 {ownedProjects.length}개</Pill>}
          renderProjectCard={(project) => (
            <OpalProjectCard key={project.id} {...project} density={cardDensity} onClick={() => onProjectClick?.(project.id)} />
          )}
        />
      ) : (
        <section className="page-panel">
          <p className="text-sm text-slate-600">아직 등록한 프로젝트가 없습니다.</p>
          <p className="mt-2 text-xs text-slate-500">프로젝트를 만들면 이 영역에서 바로 확인할 수 있습니다.</p>
        </section>
      )}

      {privacy.showBookmarks ? (
        favoriteProjects.length > 0 ? (
          <ProjectSection
            title="즐겨찾기 프로젝트"
            projects={favoriteProjects.slice(0, 4) as never}
            icon={<Star className="h-4 w-4 text-slate-700" />}
            rightSlot={<Pill variant="subtle">총 {favoriteProjects.length}개</Pill>}
            renderProjectCard={(project) => (
              <OpalProjectCard key={project.id} {...project} density={cardDensity} onClick={() => onProjectClick?.(project.id)} />
            )}
          />
        ) : (
          <section className="page-panel">
            <p className="text-sm text-slate-600">즐겨찾기한 프로젝트가 없습니다.</p>
            <p className="mt-2 text-xs text-slate-500">관심 있는 프로젝트를 저장하면 이곳에서 다시 볼 수 있습니다.</p>
          </section>
        )
      ) : (
        <section className="page-panel">
          <p className="text-sm text-slate-600">개인설정에서 즐겨찾기 표시가 꺼져 있습니다.</p>
          <p className="mt-2 text-xs text-slate-500">설정에서 다시 켜면 프로필에 즐겨찾기 프로젝트가 표시됩니다.</p>
        </section>
      )}
    </PageShell>
  )
}
