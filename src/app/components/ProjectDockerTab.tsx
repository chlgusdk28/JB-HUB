import { type ChangeEvent, useEffect, useMemo, useState } from 'react'
import {
  ExternalLink,
  FileCode2,
  LoaderCircle,
  Package,
  Play,
  RefreshCcw,
  RotateCcw,
  Square,
  TerminalSquare,
} from 'lucide-react'
import {
  controlProjectDeployment,
  fetchProjectContainerBuildLogs,
  fetchProjectContainers,
  startProjectContainerBuild,
  uploadProjectDockerfile,
  type ProjectContainerDefinition,
  type ProjectContainerDeployment,
  type ProjectContainerOverview,
} from '../lib/project-docker-api'
import { useToast } from './ToastProvider'
import { Pill } from './common'
import { OpalButton } from './opal/OpalButton'
import { Progress } from './ui/progress'

interface ProjectDockerTabProps {
  projectId?: number
  currentUserName?: string
  canManage?: boolean
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return '-'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function buildStatusTone(status: string) {
  if (['failed', 'error', 'stopped'].includes(status)) {
    return 'bg-red-50 text-red-700 border-red-200'
  }
  if (status === 'running') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  }
  if (['queued', 'building', 'starting'].includes(status)) {
    return 'bg-amber-50 text-amber-700 border-amber-200'
  }
  return 'bg-slate-100 text-slate-700 border-slate-200'
}

export function ProjectDockerTab({
  projectId,
  currentUserName = '',
  canManage = false,
}: ProjectDockerTabProps) {
  const { error, success, info, warning } = useToast()
  const [overview, setOverview] = useState<ProjectContainerOverview | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null)
  const [selectedLogs, setSelectedLogs] = useState('')
  const [isLogLoading, setIsLogLoading] = useState(false)
  const [definitionName, setDefinitionName] = useState('main')
  const [containerPorts, setContainerPorts] = useState<Record<string, string>>({})
  const [hostPorts, setHostPorts] = useState<Record<string, string>>({})

  async function loadOverview({ keepSelectedJob = true }: { keepSelectedJob?: boolean } = {}) {
    if (!projectId) {
      setOverview(null)
      return
    }

    setIsLoading(true)
    try {
      const payload = await fetchProjectContainers(projectId)
      setOverview(payload)

      setContainerPorts((current) => {
        const next = { ...current }
        for (const definition of payload.definitions) {
          if (next[definition.name] === undefined && definition.containerPort) {
            next[definition.name] = String(definition.containerPort)
          }
        }
        return next
      })

      setHostPorts((current) => {
        const next = { ...current }
        for (const deployment of payload.deployments) {
          if (next[deployment.definitionName] === undefined && deployment.hostPort) {
            next[deployment.definitionName] = String(deployment.hostPort)
          }
        }
        return next
      })

      setSelectedJobId((current) => {
        if (!keepSelectedJob) {
          return payload.buildJobs[0]?.id ?? null
        }
        if (current && payload.buildJobs.some((job) => job.id === current)) {
          return current
        }
        return payload.buildJobs[0]?.id ?? null
      })
    } catch (loadError) {
      error(loadError instanceof Error ? loadError.message : '컨테이너 정보를 불러오지 못했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  async function refreshLogs(jobId: number | null = selectedJobId) {
    if (!jobId) {
      setSelectedLogs('')
      return
    }

    setIsLogLoading(true)
    try {
      const payload = await fetchProjectContainerBuildLogs(jobId)
      setSelectedLogs(payload.logs ?? '')
    } catch (loadError) {
      error(loadError instanceof Error ? loadError.message : '빌드 로그를 불러오지 못했습니다.')
    } finally {
      setIsLogLoading(false)
    }
  }

  useEffect(() => {
    void loadOverview({ keepSelectedJob: false })
  }, [projectId])

  useEffect(() => {
    void refreshLogs()
  }, [selectedJobId])

  const hasActiveWork = useMemo(() => {
    if (!overview) {
      return false
    }

    return (
      overview.buildJobs.some((job) => ['queued', 'building'].includes(job.status)) ||
      overview.deployments.some((deployment) => deployment.status === 'starting')
    )
  }, [overview])

  useEffect(() => {
    if (!hasActiveWork) {
      return
    }

    const timer = window.setInterval(() => {
      void loadOverview()
    }, 3000)

    return () => window.clearInterval(timer)
  }, [hasActiveWork, projectId])

  useEffect(() => {
    const selectedJob = overview?.buildJobs.find((job) => job.id === selectedJobId)
    if (!selectedJob || !['queued', 'building'].includes(selectedJob.status)) {
      return
    }

    const timer = window.setInterval(() => {
      void refreshLogs(selectedJobId)
    }, 2500)

    return () => window.clearInterval(timer)
  }, [overview, selectedJobId])

  async function handleDockerfileUpload(event: ChangeEvent<HTMLInputElement>) {
    if (!projectId) {
      return
    }

    const file = event.target.files?.[0] ?? null
    event.target.value = ''

    if (!file) {
      return
    }

    const normalizedDefinitionName = definitionName.trim()
    if (!normalizedDefinitionName) {
      warning('정의 이름을 먼저 입력해 주세요.')
      return
    }

    if (!canManage || !currentUserName.trim()) {
      warning('프로젝트 작성자만 Dockerfile을 업로드할 수 있습니다.')
      return
    }

    setIsUploading(true)
    setUploadProgress(0)

    try {
      const payload = await uploadProjectDockerfile(projectId, file, {
        currentUserName,
        definitionName: normalizedDefinitionName,
        onProgress: setUploadProgress,
      })

      success(`${payload.uploadedDefinitionName ?? normalizedDefinitionName} 정의에 Dockerfile을 업로드했습니다.`)
      await loadOverview({ keepSelectedJob: false })
    } catch (uploadError) {
      error(uploadError instanceof Error ? uploadError.message : 'Dockerfile 업로드에 실패했습니다.')
    } finally {
      setIsUploading(false)
    }
  }

  async function handleBuild(definition: ProjectContainerDefinition) {
    if (!projectId) {
      return
    }

    try {
      const payload = await startProjectContainerBuild(
        projectId,
        {
          definitionName: definition.name,
          containerPort: Number.parseInt(containerPorts[definition.name] ?? '', 10) || definition.containerPort,
          preferredHostPort: Number.parseInt(hostPorts[definition.name] ?? '', 10) || null,
        },
        currentUserName,
      )

      if (payload.job?.id) {
        setSelectedJobId(payload.job.id)
      }

      info(`${definition.name} 빌드를 시작했습니다.`)
      await loadOverview()
    } catch (buildError) {
      error(buildError instanceof Error ? buildError.message : '컨테이너 빌드를 시작하지 못했습니다.')
    }
  }

  async function handleDeploymentAction(
    deployment: ProjectContainerDeployment,
    action: 'start' | 'stop' | 'restart',
  ) {
    if (!projectId) {
      return
    }

    try {
      await controlProjectDeployment(projectId, deployment.id, action, currentUserName)
      success(
        action === 'stop'
          ? '미리보기를 중지했습니다.'
          : action === 'restart'
            ? '미리보기를 다시 시작했습니다.'
            : '미리보기를 시작했습니다.',
      )
      await loadOverview()
    } catch (actionError) {
      error(actionError instanceof Error ? actionError.message : '배포 상태를 변경하지 못했습니다.')
    }
  }

  const selectedJob = overview?.buildJobs.find((job) => job.id === selectedJobId) ?? null

  if (!projectId) {
    return (
      <div className="empty-panel">
        <p className="text-sm text-slate-600">컨테이너를 보려면 프로젝트를 먼저 선택해 주세요.</p>
      </div>
    )
  }

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-slate-700" />
              <h3 className="text-lg font-semibold text-slate-900">Dockerfile Build</h3>
            </div>
            <p className="text-sm text-slate-600">
              폴더 전체 대신 `Dockerfile` 한 개만 업로드할 수 있게 바꿨습니다. 정의 이름을 정한 뒤 Dockerfile을 올리면
              바로 빌드와 미리보기를 이어서 실행할 수 있습니다.
            </p>
            <div className="flex flex-wrap gap-2">
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${buildStatusTone(
                  overview?.docker.available ? 'running' : 'failed',
                )}`}
              >
                Docker{' '}
                {overview?.docker.available
                  ? `available${overview.docker.version ? ` (${overview.docker.version})` : ''}`
                  : 'unavailable'}
              </span>
              {overview?.docker.error ? <Pill variant="subtle">{overview.docker.error}</Pill> : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 md:hidden">
            모바일에서는 Dockerfile 업로드를 숨겼습니다. 업로드와 빌드는 PC에서만 사용할 수 있습니다.
          </div>

          <div className="hidden min-w-[320px] flex-col gap-3 md:flex">
            <label className="space-y-1 text-sm text-slate-600">
              <span>정의 이름</span>
              <input
                value={definitionName}
                onChange={(event) => setDefinitionName(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                placeholder="main"
              />
            </label>

            <label
              className={`rounded-2xl border border-dashed px-4 py-4 text-sm ${
                canManage
                  ? 'cursor-pointer border-slate-300 bg-slate-50 text-slate-700 hover:border-slate-400'
                  : 'border-slate-200 bg-slate-100 text-slate-400'
              }`}
            >
              <input
                type="file"
                className="sr-only"
                disabled={!canManage || isUploading}
                onChange={handleDockerfileUpload}
              />
              <span className="flex items-center gap-2 font-medium">
                {isUploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileCode2 className="h-4 w-4" />}
                Dockerfile 선택 및 업로드
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                폴더 대신 Dockerfile 한 개만 업로드합니다.
              </span>
            </label>

            {isUploading ? <Progress value={uploadProgress} /> : null}

            <p className="text-xs leading-5 text-slate-500">
              `COPY` 또는 `ADD`가 있는 Dockerfile은 같은 정의 폴더에 필요한 파일이 있어야 빌드됩니다.
            </p>
          </div>
        </div>
      </div>

      {!canManage ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          프로젝트 작성자만 Dockerfile을 업로드하고 실행할 수 있습니다.
        </div>
      ) : null}

      {isLoading && !overview ? (
        <div className="empty-panel">
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            컨테이너 정보를 불러오는 중입니다.
          </p>
        </div>
      ) : null}

      <div className="space-y-4">
        {overview?.definitions.length ? (
          overview.definitions.map((definition) => {
            const deployment = definition.activeDeployment
            return (
              <div
                key={definition.name}
                className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-[0_12px_28px_rgba(15,23,42,0.05)]"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-3">
                    <div>
                      <h4 className="text-lg font-semibold text-slate-900">{definition.name}</h4>
                      <p className="text-sm text-slate-500">{definition.dockerfilePath}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {definition.lastBuildJob ? (
                        <span
                          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${buildStatusTone(
                            definition.lastBuildJob.status,
                          )}`}
                        >
                          Build {definition.lastBuildJob.status}
                        </span>
                      ) : null}
                      {deployment ? (
                        <span
                          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${buildStatusTone(
                            deployment.status,
                          )}`}
                        >
                          Preview {deployment.status}
                        </span>
                      ) : null}
                      {definition.containerPort ? <Pill variant="subtle">Container {definition.containerPort}</Pill> : null}
                      {deployment?.hostPort ? <Pill variant="subtle">Host {deployment.hostPort}</Pill> : null}
                    </div>

                    {definition.warnings.length ? (
                      <div className="space-y-1 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                        {definition.warnings.map((warningMessage) => (
                          <p key={warningMessage}>{warningMessage}</p>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[360px]">
                    <label className="space-y-1 text-sm text-slate-600">
                      <span>Container Port</span>
                      <input
                        value={containerPorts[definition.name] ?? ''}
                        onChange={(event) =>
                          setContainerPorts((current) => ({ ...current, [definition.name]: event.target.value }))
                        }
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                        placeholder={definition.containerPort ? String(definition.containerPort) : '3000'}
                      />
                    </label>

                    <label className="space-y-1 text-sm text-slate-600">
                      <span>Host Port</span>
                      <input
                        value={hostPorts[definition.name] ?? ''}
                        onChange={(event) =>
                          setHostPorts((current) => ({ ...current, [definition.name]: event.target.value }))
                        }
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                        placeholder="Auto"
                      />
                    </label>

                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      <OpalButton
                        size="sm"
                        variant="primary"
                        disabled={!canManage || !currentUserName.trim() || !overview?.docker.available}
                        icon={<Play className="h-4 w-4" />}
                        onClick={() => void handleBuild(definition)}
                      >
                        빌드 및 실행
                      </OpalButton>

                      {deployment ? (
                        <OpalButton
                          size="sm"
                          variant="secondary"
                          icon={<Square className="h-4 w-4" />}
                          onClick={() => void handleDeploymentAction(deployment, 'stop')}
                        >
                          중지
                        </OpalButton>
                      ) : null}

                      {deployment ? (
                        <OpalButton
                          size="sm"
                          variant="secondary"
                          icon={<RotateCcw className="h-4 w-4" />}
                          onClick={() => void handleDeploymentAction(deployment, 'restart')}
                        >
                          재시작
                        </OpalButton>
                      ) : null}

                      {definition.lastBuildJob ? (
                        <OpalButton
                          size="sm"
                          variant="ghost"
                          icon={<TerminalSquare className="h-4 w-4" />}
                          onClick={() => setSelectedJobId(definition.lastBuildJob?.id ?? null)}
                        >
                          로그 보기
                        </OpalButton>
                      ) : null}

                      {deployment?.endpointUrl ? (
                        <OpalButton
                          size="sm"
                          variant="ghost"
                          icon={<ExternalLink className="h-4 w-4" />}
                          onClick={() => window.open(deployment.endpointUrl ?? undefined, '_blank', 'noopener,noreferrer')}
                        >
                          로컬 열기
                        </OpalButton>
                      ) : null}

                      {deployment?.sitePreviewUrl ? (
                        <OpalButton
                          size="sm"
                          variant="ghost"
                          icon={<ExternalLink className="h-4 w-4" />}
                          onClick={() =>
                            window.open(deployment.sitePreviewUrl ?? undefined, '_blank', 'noopener,noreferrer')
                          }
                        >
                          사이트 미리보기
                        </OpalButton>
                      ) : null}
                    </div>
                  </div>
                </div>

                {deployment?.sitePreviewUrl || deployment?.endpointUrl ? (
                  <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                    <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>업데이트 {formatDateTime(deployment.updatedAt)}</span>
                      {deployment.endpointUrl ? <span>{deployment.endpointUrl}</span> : null}
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      <iframe
                        title={`${definition.name} preview`}
                        src={deployment.sitePreviewUrl ?? deployment.endpointUrl ?? undefined}
                        className="h-[420px] w-full bg-white"
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })
        ) : (
          <div className="empty-panel">
            <p className="text-sm text-slate-600">아직 업로드된 Dockerfile 정의가 없습니다. 먼저 Dockerfile을 올려 주세요.</p>
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-[0_20px_40px_rgba(15,23,42,0.18)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Build Logs</p>
            <h4 className="text-lg font-semibold">
              {selectedJob ? `${selectedJob.definitionName} · ${selectedJob.status}` : '선택된 작업 없음'}
            </h4>
          </div>
          <OpalButton
            size="sm"
            variant="secondary"
            icon={<RefreshCcw className={`h-4 w-4 ${isLogLoading ? 'animate-spin' : ''}`} />}
            onClick={() => void refreshLogs()}
          >
            로그 새로고침
          </OpalButton>
        </div>
        <pre className="max-h-[360px] overflow-auto rounded-2xl bg-slate-900/90 p-4 text-xs leading-6 text-slate-200">
          {selectedLogs || '빌드 로그가 없습니다.'}
        </pre>
      </div>
    </section>
  )
}
