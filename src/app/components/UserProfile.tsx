import { useMemo } from 'react'
import { Eye, GitFork, Globe, Lock, Sparkles, Star, TrendingUp } from 'lucide-react'
import { MetricCard, PageHeader, PageShell, Pill, ProjectSection } from './common'
import { OpalButton } from './opal/OpalButton'
import { OpalCard } from './opal/OpalCard'
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
          accumulator.forks += project.forks
          accumulator.views += project.views
          return accumulator
        },
        { stars: 0, forks: 0, views: 0 },
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
      .slice(0, 8)
  }, [ownedProjects])

  const summaryMetrics = [
    { key: 'projects', label: '내 프로젝트', value: ownedProjects.length },
    { key: 'stars', label: '누적 별표', value: ownedStats.stars },
    { key: 'forks', label: '누적 포크', value: ownedStats.forks },
    { key: 'views', label: '누적 조회 수', value: ownedStats.views.toLocaleString() },
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
        description={`${currentUser.department}에서 활동 중인 사용자 프로필입니다. 개인설정의 프라이버시 옵션에 따라 공개 상태와 표시 영역이 함께 반영됩니다.`}
        actions={
          <>
            <OpalButton
              variant="secondary"
              size="sm"
              icon={privacy.profilePublic ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            >
              {profileVisibilityLabel}
            </OpalButton>
          </>
        }
        meta={
          <>
            <Pill variant="subtle">부서 {currentUser.department}</Pill>
            <Pill variant="subtle">{privacy.showBookmarks ? `즐겨찾기 ${favoriteProjects.length}` : '즐겨찾기 비공개'}</Pill>
            <Pill variant="subtle">{privacy.showActivity ? `최근 활동 ${recentProjects.length}` : '활동 비공개'}</Pill>
          </>
        }
      />

      <section className="page-metric-grid">
        {summaryMetrics.map((metric) => (
          <MetricCard key={metric.key} label={metric.label} value={metric.value} />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
        <OpalCard padding="comfortable" elevation="minimal">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="project-section-icon">
                <TrendingUp className="h-5 w-5 text-slate-700" />
              </span>
              <h2 className="text-lg font-semibold text-slate-900">프로필 요약</h2>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">공개 상태</p>
                <p className="mt-2 text-base font-semibold text-slate-900">{privacy.profilePublic ? '공개' : '비공개'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">즐겨찾기 표시</p>
                <p className="mt-2 text-base font-semibold text-slate-900">{privacy.showBookmarks ? '표시' : '숨김'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">활동 표시</p>
                <p className="mt-2 text-base font-semibold text-slate-900">{privacy.showActivity ? '표시' : '숨김'}</p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">자주 쓰는 태그</p>
                <Pill variant="subtle">태그 {topTags.length}</Pill>
              </div>
              <div className="mt-3 page-tag-cloud">
                {topTags.length > 0 ? (
                  topTags.map(([tag, count]) => (
                    <Pill key={tag} variant="subtle">
                      {tag} ({count})
                    </Pill>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">아직 집계된 태그가 없습니다.</p>
                )}
              </div>
            </div>
          </div>
        </OpalCard>

        {privacy.showActivity ? (
          <OpalCard padding="comfortable" elevation="minimal">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="project-section-icon">
                  <Eye className="h-5 w-5 text-slate-700" />
                </span>
                <h2 className="text-lg font-semibold text-slate-900">최근 본 프로젝트</h2>
              </div>
              <div className="space-y-3">
                {recentProjects.length > 0 ? (
                  recentProjects.slice(0, 5).map((project) => (
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
                  ))
                ) : (
                  <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                    최근 본 프로젝트가 없습니다.
                  </p>
                )}
              </div>
            </div>
          </OpalCard>
        ) : (
          <OpalCard padding="comfortable" elevation="minimal">
            <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
              개인설정에서 활동 이력 표시가 꺼져 있어 최근 프로젝트 영역을 숨겼습니다.
            </div>
          </OpalCard>
        )}
      </section>

      {ownedProjects.length > 0 ? (
        <ProjectSection
          title="내 프로젝트"
          projects={ownedProjects as never}
          icon={<Star className="h-5 w-5 text-slate-700" />}
          rightSlot={<Pill variant="subtle">총 {ownedProjects.length}개</Pill>}
          renderProjectCard={(project) => (
            <OpalProjectCard key={project.id} {...project} density={cardDensity} onClick={() => onProjectClick?.(project.id)} />
          )}
        />
      ) : (
        <div className="empty-panel">
          <p className="text-sm text-slate-600">아직 등록한 프로젝트가 없습니다.</p>
          <p className="mt-2 text-xs text-slate-500">프로젝트를 만들면 이 영역에서 바로 확인할 수 있습니다.</p>
        </div>
      )}

      {privacy.showBookmarks ? (
        favoriteProjects.length > 0 ? (
          <ProjectSection
            title="즐겨찾기 프로젝트"
            projects={favoriteProjects.slice(0, 6) as never}
            icon={<GitFork className="h-5 w-5 text-slate-700" />}
            rightSlot={<Pill variant="subtle">총 {favoriteProjects.length}개</Pill>}
            renderProjectCard={(project) => (
              <OpalProjectCard key={project.id} {...project} density={cardDensity} onClick={() => onProjectClick?.(project.id)} />
            )}
          />
        ) : (
          <div className="empty-panel">
            <p className="text-sm text-slate-600">즐겨찾기한 프로젝트가 없습니다.</p>
            <p className="mt-2 text-xs text-slate-500">관심 있는 프로젝트를 저장하면 이곳에서 다시 볼 수 있습니다.</p>
          </div>
        )
      ) : (
        <div className="empty-panel">
          <p className="text-sm text-slate-600">개인설정에서 즐겨찾기 표시가 꺼져 있습니다.</p>
          <p className="mt-2 text-xs text-slate-500">설정에서 다시 켜면 프로필에 즐겨찾기 프로젝트가 표시됩니다.</p>
        </div>
      )}
    </PageShell>
  )
}
