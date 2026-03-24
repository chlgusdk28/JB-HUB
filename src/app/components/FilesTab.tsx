import { type DragEvent, type ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronRight,
  Download,
  File,
  FileCode2,
  Folder,
  FolderUp,
  LoaderCircle,
  RefreshCcw,
  Trash2,
  Upload,
} from 'lucide-react'
import {
  buildProjectFileDownloadUrl,
  deleteProjectFilePath,
  fetchProjectFileContent,
  fetchProjectFiles,
  type ProjectFileContent,
  type ProjectFileNode,
  uploadProjectFiles,
} from '../lib/projects-api'
import { useToast } from './ToastProvider'
import { Progress } from './ui/progress'

interface FilesTabProps {
  projectId?: number
  currentUserName?: string
  projectAuthor?: string
  canUpload?: boolean
  onFilesChanged?: (files: ProjectFileNode[]) => void
}

const folderInputAttributes = {
  webkitdirectory: '',
  directory: '',
} as Record<string, string>

function formatBytes(bytes?: number) {
  if (typeof bytes !== 'number' || Number.isNaN(bytes)) {
    return '-'
  }

  if (bytes < 1024) {
    return `${bytes} B`
  }

  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

function formatUpdatedAt(value?: string) {
  if (!value) {
    return '-'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return '-'
  }

  return parsed.toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function collectFolderPaths(nodes: ProjectFileNode[]) {
  const paths: string[] = []

  for (const node of nodes) {
    if (node.type === 'folder') {
      paths.push(node.path)
      if (node.children?.length) {
        paths.push(...collectFolderPaths(node.children))
      }
    }
  }

  return paths
}

function hasFilePath(nodes: ProjectFileNode[], filePath: string) {
  for (const node of nodes) {
    if (node.type === 'file' && node.path === filePath) {
      return true
    }

    if (node.children?.length && hasFilePath(node.children, filePath)) {
      return true
    }
  }

  return false
}

function findFirstFilePath(nodes: ProjectFileNode[]): string | null {
  for (const node of nodes) {
    if (node.type === 'file') {
      return node.path
    }

    if (node.children?.length) {
      const childMatch = findFirstFilePath(node.children)
      if (childMatch) {
        return childMatch
      }
    }
  }

  return null
}

function expandAncestorFolders(paths: Set<string>, filePath: string) {
  const segments = filePath.split('/').filter(Boolean)
  let currentPath = ''

  for (let index = 0; index < segments.length - 1; index += 1) {
    currentPath = currentPath ? `${currentPath}/${segments[index]}` : segments[index]
    paths.add(currentPath)
  }
}

function getRelativePath(file: File) {
  const withRelativePath = file as File & { webkitRelativePath?: string }
  return withRelativePath.webkitRelativePath?.trim() || file.name
}

function isSameOrDescendantPath(targetPath: string, candidatePath: string | null) {
  if (!candidatePath) {
    return false
  }

  return candidatePath === targetPath || candidatePath.startsWith(`${targetPath}/`)
}

export function FilesTab({
  projectId,
  currentUserName = '',
  projectAuthor = '',
  canUpload = false,
  onFilesChanged,
}: FilesTabProps) {
  const { error, info, success } = useToast()
  const [files, setFiles] = useState<ProjectFileNode[]>([])
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<ProjectFileContent | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadFileCount, setUploadFileCount] = useState(0)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [isDragActive, setIsDragActive] = useState(false)
  const [deletingPath, setDeletingPath] = useState<string | null>(null)

  const canManageFiles = canUpload && currentUserName.trim().length > 0
  const isMutatingFiles = isUploading || deletingPath !== null

  async function loadPreview(filePath: string) {
    if (!projectId) {
      return
    }

    setSelectedPath(filePath)
    setIsPreviewLoading(true)

    try {
      const preview = await fetchProjectFileContent(projectId, filePath)
      setSelectedFile(preview)
    } catch (loadError) {
      setSelectedFile(null)
      error(loadError instanceof Error ? loadError.message : '파일 미리보기를 불러오지 못했습니다.')
    } finally {
      setIsPreviewLoading(false)
    }
  }

  async function applyFileTree(
    nextFiles: ProjectFileNode[],
    options?: {
      preferredFilePath?: string | null
      fallbackSelectedPath?: string | null
    },
  ) {
    const preferredFilePath = options?.preferredFilePath ?? null
    const fallbackSelectedPath = options?.fallbackSelectedPath ?? selectedPath

    setFiles(nextFiles)
    setExpandedFolders((previous) => {
      const next = new Set(previous)

      if (next.size === 0) {
        for (const folderPath of collectFolderPaths(nextFiles)) {
          next.add(folderPath)
        }
      }

      if (preferredFilePath) {
        expandAncestorFolders(next, preferredFilePath)
      }

      return next
    })

    const nextSelectedPath =
      (preferredFilePath && hasFilePath(nextFiles, preferredFilePath) && preferredFilePath) ||
      (fallbackSelectedPath && hasFilePath(nextFiles, fallbackSelectedPath) && fallbackSelectedPath) ||
      null

    if (nextSelectedPath) {
      await loadPreview(nextSelectedPath)
      return
    }

    setSelectedPath(null)
    setSelectedFile(null)
  }

  async function loadFiles(preferredFilePath?: string | null) {
    if (!projectId) {
      setFiles([])
      setExpandedFolders(new Set())
      setSelectedPath(null)
      setSelectedFile(null)
      return
    }

    setIsLoading(true)

    try {
      const nextFiles = await fetchProjectFiles(projectId)
      await applyFileTree(nextFiles, {
        preferredFilePath,
        fallbackSelectedPath: selectedPath,
      })
    } catch (loadError) {
      error(loadError instanceof Error ? loadError.message : '프로젝트 파일을 불러오지 못했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadFiles()
  }, [projectId])

  useEffect(() => {
    if (!isUploading) {
      return
    }

    const previousBodyOverflow = document.body.style.overflow
    const previousHtmlOverflow = document.documentElement.style.overflow

    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousHtmlOverflow
    }
  }, [isUploading])

  function toggleFolder(path: string) {
    setExpandedFolders((previous) => {
      const next = new Set(previous)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  async function handleDeletePath(node: ProjectFileNode) {
    if (!projectId) {
      return
    }

    if (!canManageFiles) {
      error('프로젝트 작성자만 파일이나 폴더를 삭제할 수 있습니다.')
      return
    }

    const confirmed = window.confirm(
      node.type === 'folder'
        ? `"${node.name}" 폴더와 내부 파일을 모두 삭제할까요?`
        : `"${node.name}" 파일을 삭제할까요?`,
    )

    if (!confirmed) {
      return
    }

    setDeletingPath(node.path)

    try {
      const nextFiles = await deleteProjectFilePath(projectId, node.path, currentUserName)
      const fallbackSelectedPath = isSameOrDescendantPath(node.path, selectedPath) ? null : selectedPath
      await applyFileTree(nextFiles, { fallbackSelectedPath })
      onFilesChanged?.(nextFiles)
      success(node.type === 'folder' ? '폴더를 삭제했습니다.' : '파일을 삭제했습니다.')
    } catch (deleteError) {
      error(deleteError instanceof Error ? deleteError.message : '파일 삭제에 실패했습니다.')
    } finally {
      setDeletingPath(null)
    }
  }

  async function handleUploadFiles(uploadFiles: File[]) {
    if (!projectId || uploadFiles.length === 0) {
      return
    }

    if (!canManageFiles) {
      error('프로젝트 작성자만 파일을 업로드할 수 있습니다.')
      return
    }

    const preferredPath = getRelativePath(uploadFiles[0])
    setIsUploading(true)
    setUploadProgress(0)
    setUploadFileCount(uploadFiles.length)

    try {
      const nextFiles = await uploadProjectFiles(projectId, uploadFiles, {
        currentUserName,
        onProgress: (percent) => setUploadProgress(percent),
      })

      setUploadProgress(100)
      const nextSelectedPath = hasFilePath(nextFiles, preferredPath) ? preferredPath : findFirstFilePath(nextFiles)
      await applyFileTree(nextFiles, {
        preferredFilePath: nextSelectedPath,
        fallbackSelectedPath: selectedPath,
      })
      onFilesChanged?.(nextFiles)
      success(`파일 ${uploadFiles.length}개를 업로드했습니다.`)
    } catch (uploadError) {
      error(uploadError instanceof Error ? uploadError.message : '파일 업로드에 실패했습니다.')
    } finally {
      setIsUploading(false)
      setUploadFileCount(0)
    }
  }

  function handleFileSelection(fileList: FileList | null) {
    const uploadFiles = fileList ? Array.from(fileList) : []
    void handleUploadFiles(uploadFiles)
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setIsDragActive(false)

    if (isMutatingFiles) {
      return
    }

    const uploadFiles = Array.from(event.dataTransfer.files ?? [])
    if (uploadFiles.length === 0) {
      info('드롭된 파일이 없습니다.')
      return
    }

    void handleUploadFiles(uploadFiles)
  }

  function renderFileTree(nodes: ProjectFileNode[], depth = 0): ReactNode {
    return nodes.map((node) => {
      const isFolder = node.type === 'folder'
      const isExpanded = expandedFolders.has(node.path)
      const isSelected = node.type === 'file' && selectedPath === node.path
      const isDeleting = deletingPath === node.path

      return (
        <div key={node.path}>
          <div
            className={`flex items-center gap-2 border-b border-slate-100 pr-2 transition ${
              isSelected ? 'bg-sky-50 text-sky-700' : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                if (isFolder) {
                  toggleFolder(node.path)
                  return
                }

                void loadPreview(node.path)
              }}
              className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left"
              style={{ paddingLeft: `${depth * 18 + 12}px` }}
            >
              {isFolder ? (
                <ChevronRight className={`h-4 w-4 shrink-0 text-slate-400 transition ${isExpanded ? 'rotate-90' : ''}`} />
              ) : (
                <span className="w-4 shrink-0" />
              )}
              {isFolder ? (
                <Folder className="h-4 w-4 shrink-0 text-sky-600" />
              ) : (
                <File className="h-4 w-4 shrink-0 text-slate-400" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{node.name}</span>
              {!isFolder ? <span className="shrink-0 text-xs text-slate-400">{formatBytes(node.size)}</span> : null}
            </button>

            {canManageFiles ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  void handleDeletePath(node)
                }}
                disabled={isMutatingFiles}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={isFolder ? `${node.name} 폴더 삭제` : `${node.name} 파일 삭제`}
                title={isFolder ? '폴더 삭제' : '파일 삭제'}
              >
                {isDeleting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            ) : null}
          </div>

          {isFolder && isExpanded && node.children?.length ? <div>{renderFileTree(node.children, depth + 1)}</div> : null}
        </div>
      )
    })
  }

  if (!projectId) {
    return (
      <div className="empty-panel">
        <p className="text-sm text-slate-600">파일을 보려면 프로젝트를 선택하세요.</p>
      </div>
    )
  }

  const uploadOverlay =
    isUploading && typeof document !== 'undefined'
      ? createPortal(
          <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/72 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-[28px] border border-white/15 bg-slate-950/92 px-5 py-5 text-white shadow-[0_28px_80px_rgba(0,0,0,0.45)]">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/12 text-white">
                  <LoaderCircle className="h-5 w-5 animate-spin" />
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-white">파일 업로드 중</p>
                    <p className="text-sm text-slate-300">
                      {uploadFileCount > 0 ? `${uploadFileCount}개 항목을 업로드하고 있습니다.` : '업로드를 준비하고 있습니다.'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                      <span>진행률</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <Progress value={uploadProgress} className="h-2.5 bg-white/15" />
                  </div>
                  <p className="text-xs text-slate-400">업로드가 끝날 때까지 화면 조작이 잠깁니다.</p>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <div className="relative space-y-4" aria-busy={isMutatingFiles}>
      {uploadOverlay}

      <section className="page-panel space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-900">프로젝트 파일</h2>
          <p className="text-sm text-slate-600">
            파일이나 폴더를 업로드하고 트리를 탐색하며 선택한 프로젝트의 텍스트 파일을 미리볼 수 있습니다.
          </p>
        </div>

        {!canUpload ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {projectAuthor
              ? `${projectAuthor}님만 이 프로젝트에 파일을 업로드하거나 삭제할 수 있습니다.`
              : '이 프로젝트에 파일을 업로드하거나 삭제할 권한이 없습니다.'}
          </div>
        ) : null}

        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          프로젝트 전체 파일 보관 한도는 1GB입니다. 많은 파일을 올릴 때는 자동으로 나눠 업로드합니다.
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 md:hidden">
          모바일에서는 업로드를 숨겼습니다. 파일과 폴더 업로드는 PC에서만 사용할 수 있습니다.
        </div>

        <label
          onDragEnter={() => {
            if (canManageFiles && !isMutatingFiles) {
              setIsDragActive(true)
            }
          }}
          onDragLeave={() => setIsDragActive(false)}
          onDragOver={(event) => {
            event.preventDefault()
            if (canManageFiles && !isMutatingFiles) {
              setIsDragActive(true)
            }
          }}
          onDrop={handleDrop}
          className={`hidden cursor-pointer flex-col items-center justify-center gap-3 rounded-[28px] border-2 border-dashed px-6 py-10 text-center transition md:flex ${
            isDragActive
              ? 'border-sky-400 bg-sky-50'
              : 'border-slate-300 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(244,248,252,0.9))] hover:border-slate-400 hover:bg-white'
          } ${isMutatingFiles || !canManageFiles ? 'pointer-events-none cursor-not-allowed opacity-70' : ''}`}
        >
          <input
            type="file"
            multiple
            className="sr-only"
            disabled={!canManageFiles || isMutatingFiles}
            onChange={(event) => {
              handleFileSelection(event.currentTarget.files)
              event.currentTarget.value = ''
            }}
          />
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-[0_12px_28px_rgba(15,23,42,0.2)]">
            {isUploading ? <LoaderCircle className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
          </div>
          <div className="space-y-1">
            <p className="text-base font-semibold text-slate-900">여기에 파일을 놓거나 클릭해서 선택하세요.</p>
            <p className="text-sm text-slate-600">문서, 코드, 이미지, 압축 파일을 모두 업로드할 수 있습니다.</p>
          </div>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
            {isUploading ? '업로드 중...' : canManageFiles ? '파일 업로드' : '업로드 잠금'}
          </span>
        </label>

        <div className="hidden gap-3 md:grid md:grid-cols-2">
          <label
            className={`flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 transition ${
              isMutatingFiles || !canManageFiles ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <Upload className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900">파일 선택</p>
              <p className="text-xs text-slate-500">하나 이상의 파일을 업로드합니다.</p>
            </div>
            <input
              type="file"
              multiple
              className="sr-only"
              disabled={!canManageFiles || isMutatingFiles}
              onChange={(event) => {
                handleFileSelection(event.currentTarget.files)
                event.currentTarget.value = ''
              }}
            />
          </label>

          <label
            className={`flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 transition ${
              isMutatingFiles || !canManageFiles ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <FolderUp className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900">폴더 선택</p>
              <p className="text-xs text-slate-500">업로드할 때 폴더 구조를 유지합니다.</p>
            </div>
            <input
              type="file"
              multiple
              className="sr-only"
              {...folderInputAttributes}
              disabled={!canManageFiles || isMutatingFiles}
              onChange={(event) => {
                handleFileSelection(event.currentTarget.files)
                event.currentTarget.value = ''
              }}
            />
          </label>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void loadFiles(selectedPath)}
            disabled={isLoading || isMutatingFiles}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCcw className={`h-4 w-4 ${isLoading || isMutatingFiles ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(280px,360px)_1fr]">
        <section className="surface-panel overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">파일 트리</h3>
              <p className="text-xs text-slate-500">폴더를 탐색하고 미리볼 파일을 선택하세요.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
              루트 항목 {files.length}개
            </span>
          </div>

          <div className="max-h-[560px] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-slate-500">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                파일 트리를 불러오는 중...
              </div>
            ) : files.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
                <Folder className="h-10 w-10 text-slate-300" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-900">아직 업로드된 파일이 없습니다.</p>
                  <p className="text-sm text-slate-600">위의 업로드 영역에서 이 프로젝트에 파일을 추가하세요.</p>
                </div>
              </div>
            ) : (
              renderFileTree(files)
            )}
          </div>
        </section>

        <section className="surface-panel overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-slate-900">{selectedFile?.path ?? '파일 미리보기'}</h3>
              <p className="text-xs text-slate-500">
                {selectedFile
                  ? `${formatBytes(selectedFile.size)} • ${formatUpdatedAt(selectedFile.updatedAt)}`
                  : '트리에서 파일을 선택하면 여기에서 미리보기가 표시됩니다.'}
              </p>
            </div>

            {selectedFile ? (
              <div className="flex shrink-0 items-center gap-2">
                {canManageFiles ? (
                  <button
                    type="button"
                    onClick={() =>
                      void handleDeletePath({
                        name: selectedFile.name,
                        path: selectedFile.path,
                        type: 'file',
                        size: selectedFile.size,
                        updatedAt: selectedFile.updatedAt,
                      })
                    }
                    disabled={isMutatingFiles}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {deletingPath === selectedFile.path ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    삭제
                  </button>
                ) : null}

                <a
                  href={buildProjectFileDownloadUrl(projectId, selectedFile.path)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <Download className="h-4 w-4" />
                  다운로드
                </a>
              </div>
            ) : null}
          </div>

          <div className="min-h-[420px] p-4">
            {isPreviewLoading ? (
              <div className="flex h-full min-h-[360px] items-center justify-center gap-2 text-sm text-slate-500">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                미리보기를 불러오는 중...
              </div>
            ) : selectedFile ? (
              selectedFile.isText && selectedFile.content !== null ? (
                <div className="space-y-3">
                  {selectedFile.truncated ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      미리보기에는 파일의 앞부분만 표시됩니다. 전체 내용을 확인하려면 파일을 다운로드하세요.
                    </div>
                  ) : null}
                  <div className="overflow-x-auto rounded-2xl bg-slate-950 p-4">
                    <pre className="text-sm leading-6 text-slate-100">
                      <code>{selectedFile.content}</code>
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-3 text-center">
                  <FileCode2 className="h-10 w-10 text-slate-300" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-900">이 파일 형식은 미리보기를 지원하지 않습니다.</p>
                    <p className="text-sm text-slate-600">바이너리나 미디어 파일은 다운로드해서 확인해 주세요.</p>
                  </div>
                </div>
              )
            ) : (
              <div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-3 text-center">
                <File className="h-10 w-10 text-slate-300" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-900">파일을 선택하세요.</p>
                  <p className="text-sm text-slate-600">텍스트 파일을 선택하면 내용이 바로 여기에서 표시됩니다.</p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
