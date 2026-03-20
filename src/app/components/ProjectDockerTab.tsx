import { useEffect, useMemo, useState } from 'react'
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
  Upload,
} from 'lucide-react'
import {
  controlProjectDeployment,
  fetchProjectContainerBuildLogs,
  fetchProjectContainers,
  startProjectContainerBuild,
  uploadProjectDockerComposeFiles,
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

const MAIN_COMPOSE_DEFINITION_NAME = 'main'

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

function parseActivityTime(value?: string | null) {
  if (!value) {
    return 0
  }

  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? 0 : timestamp
}

function getDefinitionActivityTime(definition: ProjectContainerDefinition) {
  return Math.max(
    parseActivityTime(definition.activeDeployment?.updatedAt),
    parseActivityTime(definition.lastBuildJob?.finishedAt),
    parseActivityTime(definition.lastBuildJob?.startedAt),
    parseActivityTime(definition.lastBuildJob?.createdAt),
  )
}

function pickPrimaryComposeDefinition(definitions: ProjectContainerDefinition[]) {
  const composeDefinitions = definitions.filter((definition) => Boolean(definition.composeFilePath))
  if (composeDefinitions.length === 0) {
    return null
  }

  const mainDefinition = composeDefinitions.find((definition) => definition.name === MAIN_COMPOSE_DEFINITION_NAME)
  if (mainDefinition) {
    return mainDefinition
  }

  return [...composeDefinitions].sort((left, right) => {
    const timeDiff = getDefinitionActivityTime(right) - getDefinitionActivityTime(left)
    if (timeDiff !== 0) {
      return timeDiff
    }

    return left.name.localeCompare(right.name, 'en', { numeric: true })
  })[0]
}

function pickSelectedJobId(
  payload: ProjectContainerOverview,
  keepSelectedJob: boolean,
  currentJobId: number | null,
  definitionName: string | null,
) {
  if (!definitionName) {
    return null
  }

  const jobsForDefinition = payload.buildJobs.filter((job) => job.definitionName === definitionName)
  if (!keepSelectedJob) {
    return jobsForDefinition[0]?.id ?? null
  }

  if (currentJobId && jobsForDefinition.some((job) => job.id === currentJobId)) {
    return currentJobId
  }

  return jobsForDefinition[0]?.id ?? null
}

function getServiceEndpointLabel(deployment: ProjectContainerDeployment, serviceName?: string | null) {
  const normalizedServiceName = typeof serviceName === 'string' && serviceName.trim() ? serviceName.trim() : null
  if (normalizedServiceName) {
    return normalizedServiceName
  }

  return deployment.imageReference?.startsWith('compose:') ? 'service' : 'app'
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
  const [dockerfile, setDockerfile] = useState<File | null>(null)
  const [composeFile, setComposeFile] = useState<File | null>(null)

  async function loadOverview({ keepSelectedJob = true }: { keepSelectedJob?: boolean } = {}) {
    if (!projectId) {
      setOverview(null)
      return
    }

    setIsLoading(true)
    try {
      const payload = await fetchProjectContainers(projectId)
      const primaryDefinition = pickPrimaryComposeDefinition(payload.definitions)

      setOverview(payload)
      setSelectedJobId((currentJobId) =>
        pickSelectedJobId(payload, keepSelectedJob, currentJobId, primaryDefinition?.name ?? null),
      )
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

  const visibleDefinition = useMemo(
    () => pickPrimaryComposeDefinition(overview?.definitions ?? []),
    [overview?.definitions],
  )

  const composeDefinitions = useMemo(
    () => (overview?.definitions ?? []).filter((definition) => Boolean(definition.composeFilePath)),
    [overview?.definitions],
  )

  const hiddenComposeCount = Math.max(0, composeDefinitions.length - (visibleDefinition ? 1 : 0))

  const hasActiveWork = useMemo(() => {
    if (!overview || !visibleDefinition) {
      return false
    }

    return (
      overview.buildJobs.some(
        (job) => job.definitionName === visibleDefinition.name && ['queued', 'building'].includes(job.status),
      ) ||
      overview.deployments.some(
        (deployment) => deployment.definitionName === visibleDefinition.name && deployment.status === 'starting',
      )
    )
  }, [overview, visibleDefinition])

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
    if (!selectedJob || !visibleDefinition || selectedJob.definitionName !== visibleDefinition.name) {
      return
    }

    if (!['queued', 'building'].includes(selectedJob.status)) {
      return
    }

    const timer = window.setInterval(() => {
      void refreshLogs(selectedJobId)
    }, 2500)

    return () => window.clearInterval(timer)
  }, [overview, selectedJobId, visibleDefinition])

  async function handleDockerComposeUpload() {
    if (!projectId) {
      return
    }

    if (!canManage || !currentUserName.trim()) {
      warning('프로젝트 작성자만 Dockerfile과 compose 파일을 업로드할 수 있습니다.')
      return
    }

    if (!dockerfile || !composeFile) {
      warning('Dockerfile과 compose 파일을 모두 선택해 주세요.')
      return
    }

    setIsUploading(true)
    setUploadProgress(0)

    try {
      await uploadProjectDockerComposeFiles(projectId, dockerfile, composeFile, {
        currentUserName,
        definitionName: MAIN_COMPOSE_DEFINITION_NAME,
        onProgress: setUploadProgress,
      })

      const payload = await startProjectContainerBuild(
        projectId,
        {
          definitionName: MAIN_COMPOSE_DEFINITION_NAME,
          containerPort: null,
          preferredHostPort: null,
        },
        currentUserName,
      )

      const nextJobId = payload.job?.id ?? null
      if (nextJobId) {
        setSelectedJobId(nextJobId)
      }

      setDockerfile(null)
      setComposeFile(null)
      success('Dockerfile과 compose를 업로드했고, 자동 빌드와 사이트 미리보기를 시작했습니다.')
      await loadOverview()
      if (nextJobId) {
        await refreshLogs(nextJobId)
      }
    } catch (uploadError) {
      error(uploadError instanceof Error ? uploadError.message : 'Dockerfile과 compose 업로드 또는 자동 빌드 시작에 실패했습니다.')
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
          containerPort: null,
          preferredHostPort: null,
        },
        currentUserName,
      )

      if (payload.job?.id) {
        setSelectedJobId(payload.job.id)
      }

      info('Docker 빌드와 미리보기를 시작했습니다.')
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
          ? '사이트 미리보기를 중지했습니다.'
          : action === 'restart'
            ? '사이트 미리보기를 다시 시작했습니다.'
            : '사이트 미리보기를 시작했습니다.',
      )
      await loadOverview()
    } catch (actionError) {
      error(actionError instanceof Error ? actionError.message : '배포 상태를 변경하지 못했습니다.')
    }
  }

  const selectedJob =
    overview?.buildJobs.find(
      (job) => job.id === selectedJobId && (!visibleDefinition || job.definitionName === visibleDefinition.name),
    ) ?? null

  const deployment = visibleDefinition?.activeDeployment ?? null

  if (!projectId) {
    return (
      <div className="empty-panel">
        <p className="text-sm text-slate-600">컨테이너 기능을 보려면 먼저 프로젝트를 선택해 주세요.</p>
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
              <h3 className="text-lg font-semibold text-slate-900">Docker Compose Preview</h3>
            </div>
            <p className="text-sm text-slate-600">
              Dockerfile과 compose 파일을 올리면 같은 화면에서 자동으로 빌드하고, 감지된 포트로 사이트 미리보기를 띄웁니다.
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
            모바일에서는 Docker 업로드를 숨겨두었습니다. 업로드와 빌드는 PC에서만 사용할 수 있습니다.
          </div>

          <div className="hidden min-w-[360px] flex-col gap-3 md:flex">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              업로드 대상은 항상 <span className="font-semibold text-slate-900">main</span> 입니다. 새 파일을 올리면 이전 main 정의를 교체하고
              바로 빌드를 시작합니다.
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label
                className={`rounded-2xl border border-dashed px-4 py-4 text-sm ${
                  canManage
                    ? 'cursor-pointer border-slate-300 bg-slate-50 text-slate-700 hover:border-slate-400'
                    : 'border-slate-200 bg-slate-100 text-slate-400'
                }`}
              >
                <input
                  type="file"
                  accept=".dockerfile,text/plain"
                  className="sr-only"
                  disabled={!canManage || isUploading}
                  onChange={(event) => setDockerfile(event.target.files?.[0] ?? null)}
                />
                <span className="flex items-center gap-2 font-medium">
                  <FileCode2 className="h-4 w-4" />
                  Dockerfile 선택
                </span>
                <span className="mt-1 block text-xs text-slate-500">{dockerfile?.name ?? 'Dockerfile'}</span>
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
                  accept=".yml,.yaml,text/yaml,text/x-yaml"
                  className="sr-only"
                  disabled={!canManage || isUploading}
                  onChange={(event) => setComposeFile(event.target.files?.[0] ?? null)}
                />
                <span className="flex items-center gap-2 font-medium">
                  <FileCode2 className="h-4 w-4" />
                  compose 파일 선택
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {composeFile?.name ?? 'docker-compose.yml 또는 compose.yml'}
                </span>
              </label>
            </div>

            {isUploading ? <Progress value={uploadProgress} /> : null}

            <OpalButton
              variant="primary"
              size="sm"
              icon={isUploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              disabled={!canManage || isUploading || !dockerfile || !composeFile}
              onClick={() => void handleDockerComposeUpload()}
            >
              업로드 후 바로 빌드
            </OpalButton>

            <p className="text-xs leading-5 text-slate-500">
              compose의 `ports` 또는 `expose`, 없으면 Dockerfile의 `EXPOSE`를 기준으로 사이트 미리보기를 연결합니다. Dockerfile이 `COPY`나
              `ADD`를 쓰면 추가 컨텍스트 파일이 없어서 빌드가 실패할 수 있습니다.
            </p>
          </div>
        </div>
      </div>

      {!canManage ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          프로젝트 작성자만 Dockerfile과 compose 파일을 업로드하고 실행할 수 있습니다.
        </div>
      ) : null}

      {hiddenComposeCount > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          예전 테스트용 compose 정의 {hiddenComposeCount}개는 화면에서 숨겼습니다. 현재는 메인 정의 1개만 보여줍니다.
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

      {visibleDefinition ? (
        <div className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <div>
                <h4 className="text-lg font-semibold text-slate-900">Main Compose</h4>
                <p className="text-sm text-slate-500">{visibleDefinition.composeFilePath ?? visibleDefinition.dockerfilePath}</p>
                <p className="text-sm text-slate-500">{visibleDefinition.dockerfilePath}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Pill variant="subtle">Compose</Pill>
                {visibleDefinition.lastBuildJob ? (
                  <span
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${buildStatusTone(
                      visibleDefinition.lastBuildJob.status,
                    )}`}
                  >
                    Build {visibleDefinition.lastBuildJob.status}
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
                {deployment?.hostPort ? <Pill variant="subtle">Host {deployment.hostPort}</Pill> : null}
              </div>

              {visibleDefinition.warnings.length ? (
                <div className="space-y-1 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                  {visibleDefinition.warnings.map((warningMessage) => (
                    <p key={warningMessage}>{warningMessage}</p>
                  ))}
                </div>
              ) : null}

              {deployment?.errorMessage ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  {deployment.errorMessage}
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 xl:min-w-[360px]">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Dockerfile과 compose 파일을 다시 올리지 않아도 여기서 재빌드, 재시작, 중지, 로그 확인을 할 수 있습니다.
              </div>

              <div className="flex flex-wrap gap-2">
                <OpalButton
                  size="sm"
                  variant="primary"
                  disabled={!canManage || !currentUserName.trim() || !overview?.docker.available}
                  icon={<Play className="h-4 w-4" />}
                  onClick={() => void handleBuild(visibleDefinition)}
                >
                  다시 빌드
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
                    다시 시작
                  </OpalButton>
                ) : null}

                {visibleDefinition.lastBuildJob ? (
                  <OpalButton
                    size="sm"
                    variant="ghost"
                    icon={<TerminalSquare className="h-4 w-4" />}
                    onClick={() => setSelectedJobId(visibleDefinition.lastBuildJob?.id ?? null)}
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
                    onClick={() => window.open(deployment.sitePreviewUrl ?? undefined, '_blank', 'noopener,noreferrer')}
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
                {deployment.sitePreviewUrl ? <span>{deployment.sitePreviewUrl}</span> : null}
              </div>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <iframe
                  title="compose preview"
                  src={deployment.sitePreviewUrl ?? deployment.endpointUrl ?? undefined}
                  className="h-[420px] w-full bg-white"
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="empty-panel">
          <p className="text-sm text-slate-600">
            아직 업로드된 Docker Compose 정의가 없습니다. Dockerfile과 compose 파일을 올리면 바로 빌드와 미리보기를 시작합니다.
          </p>
        </div>
      )}

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
