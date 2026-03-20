import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Download, GitFork, Link2, MessageSquare, Send, Star, TrendingUp } from 'lucide-react'
import type { Project } from '../lib/project-utils'
import { FilesTab } from './FilesTab'
import { ProjectDockerTab } from './ProjectDockerTab'
import { QuietTabs } from './QuietTabs'
import { MarkdownContent, MetricCard, PageHeader, PageShell, Pill } from './common'
import { OpalButton } from './opal/OpalButton'
import { OpalCard } from './opal/OpalCard'
import { OpalProjectCard } from './opal/OpalProjectCard'

interface QuietProjectDetailProps {
  project: Project
  relatedProjects: Project[]
  isFavorite: boolean
  currentUserName: string
  canManageFiles: boolean
  onToggleFavorite: (projectId: number) => void
  onOpenProject: (projectId: number) => void
  onShare?: () => void
}

interface LocalComment {
  id: number
  author: string
  message: string
  createdAt: string
}

interface DetailProject {
  id: number
  title: string
  description: string
  author: string
  department: string
  stars: number
  forks: number
  comments: number
  views: number
  createdAt?: string | null
  badge?: string | null
  trend?: string | null
  tags?: string[]
}

const DETAIL_TABS = [
  { id: 'overview', label: '개요' },
  { id: 'files', label: '파일' },
  { id: 'containers', label: 'Container' },
  { id: 'metrics', label: '지표' },
  { id: 'comments', label: '댓글' },
]

function buildCommentStorageKey(projectId: number) {
  return `jb-hub:project-comments:${projectId}`
}

function exportProjectJson(project: DetailProject) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `project-${project.id}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

function getDefaultComments(project: DetailProject): LocalComment[] {
  return [
    {
      id: 1,
      author: '운영팀',
      message: `${project.title}의 최근 변경 사항을 확인했습니다. 배포 전 체크리스트만 보강하면 됩니다.`,
      createdAt: '2시간 전',
    },
    {
      id: 2,
      author: project.author,
      message: '문서와 운영 메모를 반영해두었습니다. 이어서 확인 부탁드립니다.',
      createdAt: '1시간 전',
    },
  ]
}

function readStoredComments(project: DetailProject) {
  if (typeof window === 'undefined') {
    return getDefaultComments(project)
  }

  const raw = window.localStorage.getItem(buildCommentStorageKey(project.id))
  if (!raw) {
    return getDefaultComments(project)
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return getDefaultComments(project)
    }

    const comments = parsed
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null
        }

        const value = item as Record<string, unknown>
        const id = Number(value.id)
        const author = String(value.author ?? '').trim()
        const message = String(value.message ?? '').trim()
        const createdAt = String(value.createdAt ?? '').trim()

        if (!Number.isFinite(id) || !author || !message || !createdAt) {
          return null
        }

        return {
          id,
          author,
          message,
          createdAt,
        } satisfies LocalComment
      })
      .filter((item): item is LocalComment => Boolean(item))

    return comments.length > 0 ? comments : getDefaultComments(project)
  } catch {
    return getDefaultComments(project)
  }
}

function toDetailProject(project: Project): DetailProject {
  return project as unknown as DetailProject
}

export function QuietProjectDetail({
  project,
  relatedProjects,
  isFavorite,
  currentUserName,
  canManageFiles,
  onToggleFavorite,
  onOpenProject,
  onShare,
}: QuietProjectDetailProps) {
  const detailProject = useMemo(() => toDetailProject(project), [project])
  const relatedDetailProjects = useMemo(() => relatedProjects.map((item) => toDetailProject(item)), [relatedProjects])
  const [activeTab, setActiveTab] = useState('overview')
  const [commentInput, setCommentInput] = useState('')
  const [comments, setComments] = useState<LocalComment[]>(() => readStoredComments(detailProject))

  useEffect(() => {
    setComments(readStoredComments(detailProject))
    setActiveTab('overview')
  }, [detailProject])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(buildCommentStorageKey(detailProject.id), JSON.stringify(comments))
    }
  }, [comments, detailProject.id])

  const trendLabel = useMemo(() => {
    if (detailProject.trend === 'rising') {
      return '상승'
    }
    if (detailProject.badge) {
      return detailProject.badge
    }
    return '안정'
  }, [detailProject.badge, detailProject.trend])

  const qualityScore = useMemo(() => {
    return Math.round(
      detailProject.stars * 0.6 +
      detailProject.forks * 0.5 +
      detailProject.comments * 0.8 +
      detailProject.views / 120,
    )
  }, [detailProject.comments, detailProject.forks, detailProject.stars, detailProject.views])

  const impactLevel = useMemo(() => {
    if (qualityScore >= 180) {
      return '매우 높음'
    }
    if (qualityScore >= 120) {
      return '높음'
    }
    if (qualityScore >= 80) {
      return '보통'
    }
    return '초기'
  }, [qualityScore])

  const handleCommentSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalized = commentInput.trim()
    if (!normalized) {
      return
    }

    setComments((previous) => [
      ...previous,
      {
        id: previous.length + 1,
        author: currentUserName,
        message: normalized,
        createdAt: '방금 전',
      },
    ])
    setCommentInput('')
  }

  return (
    <PageShell density="compact">
      <PageHeader
        eyebrow={<span>{detailProject.department}</span>}
        title={detailProject.title}
        description={`${detailProject.author} · ${detailProject.department} · ${detailProject.createdAt ?? '최근 업데이트'}`}
        actions={
          <>
            <OpalButton
              variant={isFavorite ? 'primary' : 'secondary'}
              size="sm"
              icon={<Star className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />}
              onClick={() => onToggleFavorite(detailProject.id)}
            >
              {isFavorite ? '즐겨찾기됨' : '즐겨찾기 추가'}
            </OpalButton>
            <OpalButton
              variant="secondary"
              size="sm"
              icon={<Download className="h-4 w-4" />}
              onClick={() => exportProjectJson(detailProject)}
            >
              JSON 내보내기
            </OpalButton>
            <OpalButton variant="secondary" size="sm" icon={<Link2 className="h-4 w-4" />} onClick={onShare}>
              공유
            </OpalButton>
          </>
        }
        meta={
          <>
            <Pill variant="subtle">트렌드 {trendLabel}</Pill>
            <Pill variant="subtle">영향도 {impactLevel}</Pill>
            <Pill variant="subtle">운영 점수 {qualityScore}</Pill>
            <Pill variant="subtle">
              현재 탭 {DETAIL_TABS.find((tab) => tab.id === activeTab)?.label ?? activeTab}
            </Pill>
          </>
        }
      />

      <section className="page-panel-lg">
        <MarkdownContent markdown={detailProject.description} variant="hero" />
      </section>

      <QuietTabs tabs={DETAIL_TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'overview' ? (
        <section className="space-y-6">
          <section className="page-metric-grid">
            <MetricCard label="스타" value={detailProject.stars} />
            <MetricCard label="포크" value={detailProject.forks} />
            <MetricCard label="댓글" value={detailProject.comments} />
            <MetricCard label="조회수" value={detailProject.views.toLocaleString()} />
          </section>

          <OpalCard padding="comfortable" elevation="minimal">
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-slate-900">프로젝트 요약</h2>
              <p className="text-sm leading-6 text-slate-600">
                이 프로젝트는 {detailProject.department}에서 운영 중이며, 현재 품질 점수는 {qualityScore}점,
                영향도는 {impactLevel} 수준입니다. 파일과 컨테이너 탭에서 운영 자산과 실행 상태를 바로 확인할 수 있습니다.
              </p>
              {detailProject.tags && detailProject.tags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {detailProject.tags.map((tag) => (
                    <Pill key={tag} variant="subtle">{tag}</Pill>
                  ))}
                </div>
              ) : null}
            </div>
          </OpalCard>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">연관 프로젝트</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {relatedDetailProjects.map((related) => (
                <OpalProjectCard key={related.id} {...related} onClick={() => onOpenProject(related.id)} />
              ))}
              {relatedDetailProjects.length === 0 ? (
                <div className="empty-panel">
                  <p className="text-sm text-slate-600">연관 프로젝트가 아직 없습니다.</p>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === 'files' ? (
        <FilesTab
          projectId={detailProject.id}
          currentUserName={currentUserName}
          projectAuthor={detailProject.author}
          canUpload={canManageFiles}
        />
      ) : null}

      {activeTab === 'containers' ? (
        <ProjectDockerTab
          projectId={detailProject.id}
          currentUserName={currentUserName}
          canManage={canManageFiles}
        />
      ) : null}

      {activeTab === 'metrics' ? (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <OpalCard padding="comfortable" elevation="minimal">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-slate-700" />
              <h3 className="text-lg font-semibold text-slate-900">활용 신호</h3>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              조회수 {detailProject.views.toLocaleString()}회와 스타 {detailProject.stars}개를 기준으로 보면,
              이 프로젝트는 현재 {impactLevel} 수준의 관심도를 유지하고 있습니다.
            </p>
          </OpalCard>

          <OpalCard padding="comfortable" elevation="minimal">
            <div className="flex items-center gap-2">
              <GitFork className="h-5 w-5 text-slate-700" />
              <h3 className="text-lg font-semibold text-slate-900">운영 메모</h3>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              포크, 댓글, 파일 변경 이력을 함께 확인하면 운영 난이도와 협업 빈도를 빠르게 파악할 수 있습니다.
            </p>
          </OpalCard>
        </section>
      ) : null}

      {activeTab === 'comments' ? (
        <section className="space-y-4">
          <form onSubmit={handleCommentSubmit} className="surface-panel rounded-2xl p-4">
            <div className="space-y-3">
              <textarea
                value={commentInput}
                onChange={(event) => setCommentInput(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none ring-slate-200 transition focus:border-slate-500 focus:ring-2"
                placeholder="프로젝트에 남길 운영 메모나 댓글을 입력하세요."
                rows={4}
              />
              <div className="flex justify-end">
                <OpalButton type="submit" variant="primary" size="sm" icon={<Send className="h-4 w-4" />}>
                  댓글 추가
                </OpalButton>
              </div>
            </div>
          </form>

          <div className="space-y-3">
            {comments.map((comment) => (
              <OpalCard key={comment.id} padding="comfortable" elevation="minimal">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-900">{comment.author}</p>
                  <p className="text-xs text-slate-500">{comment.createdAt}</p>
                  <p className="pt-1 text-sm text-slate-700">{comment.message}</p>
                </div>
              </OpalCard>
            ))}
            {comments.length === 0 ? (
              <div className="empty-panel">
                <p className="text-sm text-slate-600">아직 댓글이 없습니다.</p>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" />
              댓글은 현재 브라우저 로컬 저장소에 저장됩니다.
            </span>
          </div>
        </section>
      ) : null}
    </PageShell>
  )
}
