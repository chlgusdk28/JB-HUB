import { useEffect, useMemo, useState } from 'react'
import { BookText, Download, FileCode2, LoaderCircle, PencilLine, Save, X } from 'lucide-react'
import {
  buildProjectFileDownloadUrl,
  fetchProjectReadme,
  updateProjectReadme,
  type ProjectFileNode,
  type ProjectReadmeDocument,
} from '../lib/projects-api'
import { FilesTab } from './FilesTab'
import { useToast } from './ToastProvider'
import { MarkdownContent, Pill } from './common'

interface ProjectRepositoryTabProps {
  projectId?: number
  currentUserName?: string
  projectAuthor?: string
  canManage?: boolean
}

function formatReadmeUpdatedAt(value?: string | null) {
  if (!value) {
    return '아직 저장 기록이 없습니다.'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return '저장 시간을 확인할 수 없습니다.'
  }

  return parsed.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ProjectRepositoryTab({
  projectId,
  currentUserName = '',
  projectAuthor = '',
  canManage = false,
}: ProjectRepositoryTabProps) {
  const { error, success } = useToast()
  const [readme, setReadme] = useState<ProjectReadmeDocument | null>(null)
  const [readmeDraft, setReadmeDraft] = useState('')
  const [isReadmeLoading, setIsReadmeLoading] = useState(false)
  const [isReadmeSaving, setIsReadmeSaving] = useState(false)
  const [isEditingReadme, setIsEditingReadme] = useState(false)
  const [filesRefreshKey, setFilesRefreshKey] = useState(0)

  async function loadReadme() {
    if (!projectId) {
      setReadme(null)
      setReadmeDraft('')
      return
    }

    setIsReadmeLoading(true)

    try {
      const nextReadme = await fetchProjectReadme(projectId)
      setReadme(nextReadme)
      setReadmeDraft(nextReadme.content)
    } catch (loadError) {
      setReadme(null)
      setReadmeDraft('')
      error(loadError instanceof Error ? loadError.message : 'README를 불러오지 못했습니다.')
    } finally {
      setIsReadmeLoading(false)
    }
  }

  useEffect(() => {
    void loadReadme()
  }, [projectId])

  useEffect(() => {
    setIsEditingReadme(false)
  }, [projectId])

  const previewMarkdown = useMemo(() => {
    if (isEditingReadme) {
      return readmeDraft
    }

    return readme?.content ?? ''
  }, [isEditingReadme, readme?.content, readmeDraft])

  async function handleSaveReadme() {
    if (!projectId) {
      return
    }

    if (!canManage || !currentUserName.trim()) {
      error('프로젝트 작성자만 README를 수정할 수 있습니다.')
      return
    }

    setIsReadmeSaving(true)

    try {
      const savedReadme = await updateProjectReadme(projectId, readmeDraft, currentUserName)
      setReadme(savedReadme)
      setReadmeDraft(savedReadme.content)
      setIsEditingReadme(false)
      setFilesRefreshKey((previous) => previous + 1)
      success('README를 저장했습니다.')
    } catch (saveError) {
      error(saveError instanceof Error ? saveError.message : 'README를 저장하지 못했습니다.')
    } finally {
      setIsReadmeSaving(false)
    }
  }

  function handleCancelEdit() {
    setReadmeDraft(readme?.content ?? '')
    setIsEditingReadme(false)
  }

  function handleFilesChanged(_files: ProjectFileNode[]) {
    if (isEditingReadme) {
      return
    }

    void loadReadme()
  }

  return (
    <div className="space-y-4">
      <section className="page-panel space-y-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Pill variant="subtle">Repository</Pill>
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-900">README와 소스 파일을 한 흐름으로 관리합니다.</h2>
            <p className="text-sm text-slate-600">
              루트 README를 먼저 보여주고, 아래에서는 프로젝트 폴더 구조를 유지한 채 파일과 소스코드를 이어서 다룰 수 있습니다.
            </p>
          </div>
          <div className="page-summary-strip">
            <div className="page-summary-item">
              <span className="page-summary-label">README</span>
              <span className="page-summary-value">{readme?.exists ? '저장됨' : '초안'}</span>
            </div>
            <div className="page-summary-item">
              <span className="page-summary-label">권한</span>
              <span className="page-summary-value">{canManage && currentUserName.trim() ? '편집 가능' : '읽기 전용'}</span>
            </div>
            <div className="page-summary-item">
              <span className="page-summary-label">파일 구조</span>
              <span className="page-summary-value">폴더 유지</span>
            </div>
          </div>
        </div>
      </section>

      <section className="surface-panel overflow-hidden rounded-2xl">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <BookText className="h-4 w-4 text-slate-700" />
              <h3 className="text-base font-semibold text-slate-900">{readme?.path ?? 'README.md'}</h3>
              {readme?.exists ? <Pill variant="subtle">루트 문서</Pill> : <Pill variant="subtle">초안</Pill>}
            </div>
            <p className="text-sm text-slate-600">
              프로젝트 소개, 실행 방법, 주요 경로, 운영 메모를 여기에 적어두면 팀원이 저장소를 훨씬 빠르게 파악할 수 있습니다.
            </p>
            <p className="text-xs text-slate-500">
              {readme?.exists
                ? `${formatReadmeUpdatedAt(readme.updatedAt)} 기준으로 저장되었습니다.`
                : '아직 저장된 README가 없어서 기본 템플릿을 보여주고 있습니다.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isEditingReadme ? (
              <>
                <button
                  type="button"
                  onClick={() => void handleSaveReadme()}
                  disabled={isReadmeSaving}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isReadmeSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  저장
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={isReadmeSaving}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <X className="h-4 w-4" />
                  취소
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setIsEditingReadme(true)}
                  disabled={!canManage || !currentUserName.trim() || isReadmeLoading}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <PencilLine className="h-4 w-4" />
                  README 편집
                </button>
                {readme ? (
                  <details className="rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm text-slate-700">
                    <summary className="cursor-pointer list-none font-medium [&::-webkit-details-marker]:hidden">문서 작업</summary>
                    <div className="mt-3">
                      <a
                        href={buildProjectFileDownloadUrl(projectId ?? 0, readme.path)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        <Download className="h-4 w-4" />
                        원본 다운로드
                      </a>
                    </div>
                  </details>
                ) : null}
              </>
            )}
          </div>
        </div>

        {!canManage ? (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {projectAuthor
              ? `${projectAuthor}님만 이 프로젝트의 README를 수정할 수 있습니다.`
              : '이 프로젝트의 README를 수정할 권한이 없습니다.'}
          </div>
        ) : null}

        <div className="p-4">
          {isReadmeLoading ? (
            <div className="flex min-h-[220px] items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              README를 불러오는 중입니다.
            </div>
          ) : isEditingReadme ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <FileCode2 className="h-4 w-4 text-slate-500" />
                  Markdown 편집
                </div>
                <textarea
                  value={readmeDraft}
                  onChange={(event) => setReadmeDraft(event.target.value)}
                  spellCheck={false}
                  className="min-h-[360px] w-full rounded-2xl border border-slate-200 bg-slate-950 px-4 py-4 font-mono text-sm leading-6 text-slate-100 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-300"
                  placeholder="# 프로젝트 소개&#10;&#10;실행 방법과 주요 파일 구조를 적어주세요."
                />
                <p className="text-xs text-slate-500">
                  내용을 비워 저장하면 프로젝트 기본 템플릿 README로 다시 채워집니다.
                </p>
              </div>

              <div className="hidden space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <BookText className="h-4 w-4 text-slate-500" />
                  미리보기
                </div>
                <div className="min-h-[360px] rounded-2xl border border-slate-200 bg-white p-5">
                  <MarkdownContent markdown={previewMarkdown} variant="editor" />
                </div>
              </div>
              <details className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                <summary className="cursor-pointer list-none text-sm font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
                  미리보기 열기
                </summary>
                <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-5">
                  <MarkdownContent markdown={previewMarkdown} variant="editor" />
                </div>
              </details>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <MarkdownContent markdown={previewMarkdown} variant="editor" />
            </div>
          )}
        </div>
      </section>

      <FilesTab
        key={`${projectId ?? 'unknown'}-${filesRefreshKey}`}
        projectId={projectId}
        currentUserName={currentUserName}
        projectAuthor={projectAuthor}
        canUpload={canManage}
        onFilesChanged={handleFilesChanged}
      />
    </div>
  )
}
