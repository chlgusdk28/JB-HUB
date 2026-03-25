import { useEffect, useMemo, useState } from 'react'
import { Building2, Eye, GitFork, Search, Star, Trophy, UserRound } from 'lucide-react'
import type { Project } from '../lib/project-utils'
import { fetchRankings, type ProjectRankings } from '../lib/projects-api'
import { PageHeader, PageShell } from './common'
import { OpalCard } from './opal/OpalCard'
import { OpalTag } from './opal/OpalTag'
import { TableSkeleton } from './Skeleton'

interface RankingPageProps {
  projects: Project[]
  onProjectClick?: (projectId: number) => void
}

type RankingTab = 'contributors' | 'projects' | 'departments'
type RankingLimit = 5 | 10 | 20

interface RankedProject extends Project {
  score: number
  rank: number
}

interface ContributorRank {
  name: string
  department: string
  projects: number
  stars: number
  forks: number
  views: number
  rank: number
}

interface DepartmentRank {
  name: string
  projects: number
  contributors: number
  stars: number
  views: number
  rank: number
}

const rankBadgeTone = (rank: number) => {
  if (rank === 1) {
    return 'bg-[#315779] text-white'
  }
  if (rank === 2) {
    return 'bg-[#4f7394] text-white'
  }
  if (rank === 3) {
    return 'bg-[#7f97b0] text-white'
  }
  return 'bg-slate-100 text-slate-700 border border-slate-200'
}

const RANKING_LIMIT_OPTIONS: RankingLimit[] = [5, 10, 20]
const normalizeText = (value: string) => value.trim().toLowerCase()

export function RankingPage({ projects, onProjectClick }: RankingPageProps) {
  const [activeTab, setActiveTab] = useState<RankingTab>('contributors')
  const [remoteRankings, setRemoteRankings] = useState<ProjectRankings | null>(null)
  const [keyword, setKeyword] = useState('')
  const [limit, setLimit] = useState<RankingLimit>(10)
  const [isLoadingRankings, setIsLoadingRankings] = useState(true)

  useEffect(() => {
    let disposed = false
    const loadRankings = async () => {
      setIsLoadingRankings(true)
      try {
        const rankings = await fetchRankings()
        if (!disposed) {
          setRemoteRankings(rankings)
        }
      } catch {
        if (!disposed) {
          setRemoteRankings(null)
        }
      } finally {
        if (!disposed) {
          setIsLoadingRankings(false)
        }
      }
    }
    void loadRankings()
    return () => {
      disposed = true
    }
  }, [])

  const tagsByProjectId = useMemo(() => {
    const map = new Map<number, string[]>()
    projects.forEach((project) => map.set(project.id, project.tags))
    return map
  }, [projects])

  const rankedProjects = useMemo<RankedProject[]>(() => {
    return [...projects]
      .map((project) => {
        const score =
          project.stars * 3 +
          project.forks * 2 +
          project.comments * 2 +
          project.views / 100 +
          (project.isNew ? 6 : 0) +
          (project.trend === 'rising' ? 8 : 0)

        return { ...project, score }
      })
      .sort((a, b) => b.score - a.score)
      .map((project, index) => ({ ...project, rank: index + 1 }))
      .slice(0, 12)
  }, [projects])

  const contributorRanking = useMemo<ContributorRank[]>(() => {
    const byContributor = new Map<
      string,
      { department: string; projects: number; stars: number; forks: number; views: number }
    >()

    for (const project of projects) {
      const existing = byContributor.get(project.author)
      if (existing) {
        existing.projects += 1
        existing.stars += project.stars
        existing.forks += project.forks
        existing.views += project.views
        continue
      }
      byContributor.set(project.author, {
        department: project.department,
        projects: 1,
        stars: project.stars,
        forks: project.forks,
        views: project.views,
      })
    }

    return Array.from(byContributor.entries())
      .map(([name, value]) => ({
        name,
        department: value.department,
        projects: value.projects,
        stars: value.stars,
        forks: value.forks,
        views: value.views,
        rank: 0,
      }))
      .sort((a, b) => b.stars * 2 + b.views / 120 - (a.stars * 2 + a.views / 120))
      .map((item, index) => ({ ...item, rank: index + 1 }))
      .slice(0, 12)
  }, [projects])

  const departmentRanking = useMemo<DepartmentRank[]>(() => {
    const byDepartment = new Map<string, { projects: number; stars: number; views: number; contributors: Set<string> }>()

    for (const project of projects) {
      const existing = byDepartment.get(project.department)
      if (existing) {
        existing.projects += 1
        existing.stars += project.stars
        existing.views += project.views
        existing.contributors.add(project.author)
        continue
      }
      byDepartment.set(project.department, {
        projects: 1,
        stars: project.stars,
        views: project.views,
        contributors: new Set([project.author]),
      })
    }

    return Array.from(byDepartment.entries())
      .map(([name, value]) => ({
        name,
        projects: value.projects,
        stars: value.stars,
        views: value.views,
        contributors: value.contributors.size,
        rank: 0,
      }))
      .sort((a, b) => b.stars * 2 + b.views / 100 - (a.stars * 2 + a.views / 100))
      .map((item, index) => ({ ...item, rank: index + 1 }))
      .slice(0, 12)
  }, [projects])

  const displayedProjects = remoteRankings?.projects?.length ? remoteRankings.projects : rankedProjects
  const displayedContributors = remoteRankings?.contributors?.length
    ? remoteRankings.contributors.map((item, index) => ({ ...item, rank: index + 1 }))
    : contributorRanking
  const displayedDepartments = remoteRankings?.departments?.length
    ? remoteRankings.departments.map((item, index) => ({ ...item, rank: index + 1 }))
    : departmentRanking
  const normalizedKeyword = normalizeText(keyword)

  const filteredProjects = useMemo(() => {
    if (!normalizedKeyword) {
      return displayedProjects
    }
    return displayedProjects.filter((project) => {
      const tags = tagsByProjectId.get(project.id) ?? []
      return (
        normalizeText(project.title).includes(normalizedKeyword) ||
        normalizeText(project.author).includes(normalizedKeyword) ||
        normalizeText(project.department).includes(normalizedKeyword) ||
        tags.some((tag) => normalizeText(tag).includes(normalizedKeyword))
      )
    })
  }, [displayedProjects, normalizedKeyword, tagsByProjectId])

  const filteredContributors = useMemo(() => {
    if (!normalizedKeyword) {
      return displayedContributors
    }
    return displayedContributors.filter(
      (contributor) =>
        normalizeText(contributor.name).includes(normalizedKeyword) ||
        normalizeText(contributor.department).includes(normalizedKeyword),
    )
  }, [displayedContributors, normalizedKeyword])

  const filteredDepartments = useMemo(() => {
    if (!normalizedKeyword) {
      return displayedDepartments
    }
    return displayedDepartments.filter((department) => normalizeText(department.name).includes(normalizedKeyword))
  }, [displayedDepartments, normalizedKeyword])

  const visibleProjects = filteredProjects.slice(0, limit)
  const visibleContributors = filteredContributors.slice(0, limit)
  const visibleDepartments = filteredDepartments.slice(0, limit)

  const currentCount = activeTab === 'projects' ? visibleProjects.length : activeTab === 'contributors' ? visibleContributors.length : visibleDepartments.length
  const totalCount = activeTab === 'projects' ? filteredProjects.length : activeTab === 'contributors' ? filteredContributors.length : filteredDepartments.length
  return (
    <PageShell density="compact">
      <PageHeader
        variant="simple"
        eyebrow={
          <>
            <Trophy className="h-3.5 w-3.5" />
            Live Leaderboard
          </>
        }
        title="랭킹"
        description="프로젝트 스타, 포크, 조회수, 기여 활동을 기반으로 실시간 랭킹을 제공합니다."
      />

      <section className="page-panel space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="page-summary-strip">
            <div className="page-summary-item">
              <span className="page-summary-label">프로젝트 랭킹</span>
              <span className="page-summary-value">{displayedProjects.length}</span>
            </div>
            <div className="page-summary-item">
              <span className="page-summary-label">기여자 랭킹</span>
              <span className="page-summary-value">{displayedContributors.length}</span>
            </div>
            <div className="page-summary-item">
              <span className="page-summary-label">부서 랭킹</span>
              <span className="page-summary-value">{displayedDepartments.length}</span>
            </div>
            <div className="page-summary-item">
              <span className="page-summary-label">현재 결과</span>
              <span className="page-summary-value">
                {currentCount}/{totalCount}
              </span>
            </div>
          </div>

          <div className="page-input-shell">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={
                activeTab === 'projects'
                  ? '프로젝트/작성자/태그 검색'
                  : activeTab === 'contributors'
                    ? '기여자/부서 검색'
                    : '부서 검색'
              }
              className="w-full rounded-xl border border-slate-300 bg-white/90 py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none ring-slate-200 transition focus:border-slate-500 focus:ring-2"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="page-toggle-cluster">
            <button
              type="button"
              onClick={() => setActiveTab('contributors')}
              className={`page-toggle-button ${
                activeTab === 'contributors' ? 'page-toggle-button-active' : 'page-toggle-button-idle'
              }`}
            >
              <UserRound className="h-4 w-4" />
              기여자
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('projects')}
              className={`page-toggle-button ${
                activeTab === 'projects' ? 'page-toggle-button-active' : 'page-toggle-button-idle'
              }`}
            >
              <Trophy className="h-4 w-4" />
              프로젝트
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('departments')}
              className={`page-toggle-button ${
                activeTab === 'departments' ? 'page-toggle-button-active' : 'page-toggle-button-idle'
              }`}
            >
              <Building2 className="h-4 w-4" />
              부서
            </button>
          </div>

          <div className="page-toolbar-cluster">
            {RANKING_LIMIT_OPTIONS.map((item) => (
              <button
                key={`ranking-limit-${item}`}
                type="button"
                onClick={() => setLimit(item)}
                className={`chip-filter ${limit === item ? 'chip-filter-active' : 'chip-filter-idle'}`}
              >
                TOP {item}
              </button>
            ))}
          </div>
        </div>

        <p className="page-toolbar-note">총 {totalCount}개 중 {currentCount}개를 현재 탭 기준으로 표시합니다.</p>
      </section>

      {activeTab === 'projects' ? (
        <section className="page-list-stack">
          {visibleProjects.map((project) => {
            const tags = tagsByProjectId.get(project.id) ?? []

            return (
              <OpalCard
                key={project.id}
                padding="comfortable"
                elevation="minimal"
                onClick={() => onProjectClick?.(project.id)}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold ${rankBadgeTone(project.rank)}`}
                  >
                    {project.rank}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-lg font-semibold text-slate-900">{project.title}</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {project.author} · {project.department}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {tags.slice(0, 3).map((tag) => (
                        <OpalTag key={tag} size="sm" variant="primary">
                          {tag}
                        </OpalTag>
                      ))}
                    </div>
                  </div>

                  <div className="hidden items-center gap-4 text-sm md:flex">
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <Eye className="h-4 w-4" />
                      <span className="font-medium">{project.views.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-700">
                      <Star className="h-4 w-4 fill-current" />
                      <span className="font-semibold">{project.stars}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <GitFork className="h-4 w-4" />
                      <span className="font-medium">{project.forks}</span>
                    </div>
                  </div>
                </div>
              </OpalCard>
            )
          })}
          {visibleProjects.length === 0 ? (
            <div className="empty-panel">
              <p className="text-sm text-slate-600">검색 조건에 맞는 프로젝트 랭킹이 없습니다.</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {activeTab === 'contributors' ? (
        <section className="page-list-stack">
          {isLoadingRankings ? (
            <>
              <TableSkeleton rows={limit} />
              <TableSkeleton rows={limit} />
            </>
          ) : (
            visibleContributors.map((contributor) => (
            <OpalCard key={contributor.name} padding="comfortable" elevation="minimal">
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold ${rankBadgeTone(contributor.rank)}`}
                >
                  {contributor.rank}
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-lg font-semibold text-slate-900">{contributor.name}</h3>
                  <p className="text-sm text-slate-600">{contributor.department}</p>
                </div>

                <div className="grid grid-cols-2 gap-5 text-right text-sm sm:grid-cols-4">
                  <div>
                    <p className="font-semibold text-slate-900">{contributor.stars}</p>
                    <p className="text-xs text-slate-500">스타</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{contributor.projects}</p>
                    <p className="text-xs text-slate-500">프로젝트</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{contributor.forks}</p>
                    <p className="text-xs text-slate-500">포크</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{contributor.views.toLocaleString()}</p>
                    <p className="text-xs text-slate-500">조회수</p>
                  </div>
                </div>
              </div>
            </OpalCard>
          ))
          )}
          {visibleContributors.length === 0 ? (
            <div className="empty-panel">
              <p className="text-sm text-slate-600">검색 조건에 맞는 기여자 랭킹이 없습니다.</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {activeTab === 'departments' ? (
        <section className="page-list-stack">
          {visibleDepartments.map((department) => (
            <OpalCard key={department.name} padding="comfortable" elevation="minimal">
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold ${rankBadgeTone(department.rank)}`}
                >
                  {department.rank}
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-lg font-semibold text-slate-900">{department.name}</h3>
                  <p className="text-sm text-slate-600">활성 기여자 {department.contributors}명</p>
                </div>

                <div className="grid grid-cols-3 gap-5 text-right text-sm">
                  <div>
                    <p className="font-semibold text-slate-900">{department.stars}</p>
                    <p className="text-xs text-slate-500">스타</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{department.projects}</p>
                    <p className="text-xs text-slate-500">프로젝트</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{department.views.toLocaleString()}</p>
                    <p className="text-xs text-slate-500">조회수</p>
                  </div>
                </div>
              </div>
            </OpalCard>
          ))}
          {visibleDepartments.length === 0 ? (
            <div className="empty-panel">
              <p className="text-sm text-slate-600">검색 조건에 맞는 부서 랭킹이 없습니다.</p>
            </div>
          ) : null}
        </section>
      ) : null}
    </PageShell>
  )
}
