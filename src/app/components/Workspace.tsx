import { useMemo, useState } from 'react'
import { Clock3, FolderGit2, Sparkles, Star, Users } from 'lucide-react'
import type { Project } from '../lib/project-utils'
import { MetricCard, PageHeader, PageShell, Pill } from './common'
import { OpalProjectCard } from './opal/OpalProjectCard'

interface WorkspaceProps {
  projects: Project[]
  favoriteIds: number[]
  recentProjectIds: number[]
  currentUser: {
    name: string
    department: string
  }
  onProjectClick?: (projectId: number) => void
}

type WorkspaceTab = 'owned' | 'team' | 'favorites' | 'recent'

const WORKSPACE_TAB_LABELS: Record<WorkspaceTab, string> = {
  owned: '내 프로젝트',
  team: '같은 부서',
  favorites: '즐겨찾기',
  recent: '최근 본 항목',
}

export function Workspace({
  projects,
  favoriteIds,
  recentProjectIds,
  currentUser,
  onProjectClick,
}: WorkspaceProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('owned')

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds])

  const ownedProjects = useMemo(
    () => projects.filter((project) => project.author === currentUser.name),
    [projects, currentUser.name],
  )

  const sameDepartmentProjects = useMemo(
    () =>
      projects
        .filter((project) => project.department === currentUser.department && project.author !== currentUser.name)
        .sort((a, b) => b.stars - a.stars),
    [projects, currentUser.department, currentUser.name],
  )

  const favoriteProjects = useMemo(
    () => projects.filter((project) => favoriteSet.has(project.id)).sort((a, b) => b.stars - a.stars),
    [projects, favoriteSet],
  )

  const recentProjects = useMemo(() => {
    return recentProjectIds
      .map((id) => projects.find((project) => project.id === id))
      .filter((project): project is Project => Boolean(project))
  }, [recentProjectIds, projects])

  const currentList = useMemo(() => {
    switch (activeTab) {
      case 'owned':
        return ownedProjects
      case 'team':
        return sameDepartmentProjects
      case 'favorites':
        return favoriteProjects
      case 'recent':
        return recentProjects
      default:
        return ownedProjects
    }
  }, [activeTab, favoriteProjects, ownedProjects, recentProjects, sameDepartmentProjects])

  const topTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const project of projects) {
      for (const tag of project.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1)
      }
    }

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
  }, [projects])

  return (
    <PageShell>
      <PageHeader
        eyebrow={
          <>
            <FolderGit2 className="h-3.5 w-3.5" />
            Workspace Overview
          </>
        }
        title="워크스페이스"
        description="내 프로젝트, 같은 부서 작업, 즐겨찾기, 최근 본 항목을 한 화면에서 관리하는 개인 작업 공간입니다."
        meta={
          <>
            <Pill variant="subtle">사용자: {currentUser.name}</Pill>
            <Pill variant="subtle">부서: {currentUser.department}</Pill>
            <Pill variant="subtle">현재 보기: {WORKSPACE_TAB_LABELS[activeTab]}</Pill>
            <Pill variant="subtle">결과: {currentList.length}</Pill>
          </>
        }
      />

      <section className="page-metric-grid">
        <MetricCard label="내 프로젝트" value={ownedProjects.length} />
        <MetricCard label="같은 부서" value={sameDepartmentProjects.length} />
        <MetricCard label="즐겨찾기" value={favoriteProjects.length} />
        <MetricCard label="최근 본 항목" value={recentProjects.length} />
      </section>

      <section className="page-toolbar-panel">
        <div className="page-toolbar-row">
          <div className="page-toggle-cluster">
            {(['owned', 'team', 'favorites', 'recent'] as WorkspaceTab[]).map((tab) => {
              const count =
                tab === 'owned'
                  ? ownedProjects.length
                  : tab === 'team'
                    ? sameDepartmentProjects.length
                    : tab === 'favorites'
                      ? favoriteProjects.length
                      : recentProjects.length

              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`page-toggle-button ${
                    activeTab === tab ? 'page-toggle-button-active' : 'page-toggle-button-idle'
                  }`}
                >
                  {WORKSPACE_TAB_LABELS[tab]}
                  <span className="rounded-full bg-black/10 px-2 py-0.5 text-[11px] font-bold leading-none">
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="page-toolbar-note">
            현재 탭 기준으로 최신성과 관심도를 함께 보여줍니다.
          </p>
        </div>
      </section>

      <section className="page-card-grid">
        {currentList.map((project) => (
          <OpalProjectCard key={project.id} {...project} onClick={() => onProjectClick?.(project.id)} />
        ))}
        {currentList.length === 0 ? (
          <div className="empty-panel">
            <p className="text-sm text-slate-600">현재 섹션에 표시할 프로젝트가 없습니다.</p>
          </div>
        ) : null}
      </section>

      <section className="project-section-shell">
        <div className="project-section-head">
          <div className="project-section-title-row">
            <span className="project-section-icon">
              <Sparkles className="h-5 w-5 text-slate-700" />
            </span>
            <h2 className="project-section-title">자주 쓰는 태그</h2>
          </div>
          <Pill variant="subtle">상위 {topTags.length}개</Pill>
        </div>
        <div className="project-section-divider" aria-hidden="true" />
        <div className="page-tag-cloud mt-5">
          {topTags.map(([tag, count]) => (
            <Pill key={tag} variant="subtle">
              {tag} ({count})
            </Pill>
          ))}
          {topTags.length === 0 ? (
            <span className="page-toolbar-note">아직 집계된 태그가 없습니다.</span>
          ) : null}
        </div>
      </section>
    </PageShell>
  )
}
