import { useMemo, useState } from 'react'
import { FolderGit2 } from 'lucide-react'
import type { Project } from '../lib/project-utils'
import { PageHeader, PageShell, Pill } from './common'
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

const WORKSPACE_TAB_NOTES: Record<WorkspaceTab, string> = {
  owned: '내가 직접 관리하는 프로젝트를 빠르게 이어서 볼 수 있어요.',
  team: '같은 부서에서 많이 보는 프로젝트를 함께 확인할 수 있어요.',
  favorites: '나중에 다시 보고 싶은 프로젝트만 모아서 볼 수 있어요.',
  recent: '최근에 열어본 프로젝트 흐름을 이어서 살펴볼 수 있어요.',
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
      .slice(0, 5)
  }, [projects])

  const workspaceSummary = [
    { key: 'owned', label: '내 프로젝트', value: ownedProjects.length },
    { key: 'team', label: '같은 부서', value: sameDepartmentProjects.length },
    { key: 'favorites', label: '즐겨찾기', value: favoriteProjects.length },
    { key: 'recent', label: '최근 본 항목', value: recentProjects.length },
  ]

  return (
    <PageShell density="compact">
      <PageHeader
        eyebrow={
          <>
            <FolderGit2 className="h-3.5 w-3.5" />
            Workspace Overview
          </>
        }
        title="워크스페이스"
        description="지금 바로 이어서 볼 프로젝트만 정리한 개인 작업 공간입니다."
        meta={
          <>
            <Pill variant="subtle">{currentUser.name}</Pill>
            <Pill variant="subtle">{currentUser.department}</Pill>
            <Pill variant="subtle">{WORKSPACE_TAB_LABELS[activeTab]}</Pill>
          </>
        }
      />

      <section className="page-panel space-y-4">
        <div className="page-summary-strip">
          {workspaceSummary.map((item) => (
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

      <section className="page-panel space-y-4">
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
                className={`page-toggle-button ${activeTab === tab ? 'page-toggle-button-active' : 'page-toggle-button-idle'}`}
              >
                {WORKSPACE_TAB_LABELS[tab]}
                <span className="rounded-full bg-black/10 px-2 py-0.5 text-[11px] font-bold leading-none">{count}</span>
              </button>
            )
          })}
        </div>
        <p className="page-toolbar-note">{WORKSPACE_TAB_NOTES[activeTab]}</p>
      </section>

      <section className="page-card-grid">
        {currentList.map((project) => (
          <OpalProjectCard
            key={project.id}
            {...project}
            density="compact"
            onClick={() => onProjectClick?.(project.id)}
          />
        ))}
        {currentList.length === 0 ? (
          <div className="empty-panel">
            <p className="text-sm text-slate-600">현재 섹션에 표시할 프로젝트가 없습니다.</p>
          </div>
        ) : null}
      </section>
    </PageShell>
  )
}
