import { useEffect, useMemo, useState } from 'react'
import { Clock3, Play, RefreshCcw, ShieldAlert, ShieldCheck, Square, TerminalSquare, Upload } from 'lucide-react'
import {
  cancelAirgapBuild,
  createAirgapBuild,
  fetchAirgapBaseImages,
  fetchAirgapBuild,
  fetchAirgapBuildLogs,
  fetchAirgapBuilds,
  retryAirgapBuild,
  type AirgapBaseImage,
  type AirgapBuild,
  type AirgapBuildLogEntry,
  type AirgapScanResult,
} from '../lib/airgap-build-api'
import { useToast } from './ToastProvider'
import { Pill } from './common'
import { OpalButton } from './opal/OpalButton'

interface ProjectAirgapBuildTabProps {
  projectId?: number
  currentUserName?: string
  canManage?: boolean
}

const TERMINAL_STATUSES = new Set(['REJECTED', 'FAILED', 'SCAN_FAILED', 'PUSH_BLOCKED', 'COMPLETED', 'CANCELLED'])
const PLACEHOLDER_DOCKERFILE = `FROM registry.internal.bank.co.kr/base/nginx:1.27
EXPOSE 8080
USER 101
CMD ["nginx", "-g", "daemon off;"]
`

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

function formatBytes(value?: number | null) {
  if (!value || value <= 0) {
    return '0 B'
  }

  if (value < 1024) {
    return `${value} B`
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function formatBuildStatus(status?: string | null) {
  const normalized = String(status ?? '').toUpperCase()
  switch (normalized) {
    case 'QUEUED':
      return 'Queued'
    case 'VALIDATING':
      return 'Validating'
    case 'BUILDING':
      return 'Building'
    case 'SCANNING':
      return 'Scanning'
    case 'PUSHING':
      return 'Pushing'
    case 'COMPLETED':
      return 'Completed'
    case 'REJECTED':
      return 'Rejected'
    case 'FAILED':
      return 'Failed'
    case 'PUSH_BLOCKED':
      return 'Push blocked'
    case 'CANCELLED':
      return 'Cancelled'
    default:
      return normalized || '-'
  }
}

function getStatusClasses(status?: string | null) {
  const normalized = String(status ?? '').toUpperCase()
  if (normalized === 'COMPLETED') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  }
  if (['FAILED', 'REJECTED', 'PUSH_BLOCKED', 'CANCELLED'].includes(normalized)) {
    return 'border-red-200 bg-red-50 text-red-700'
  }
  if (['VALIDATING', 'BUILDING', 'SCANNING', 'PUSHING', 'QUEUED'].includes(normalized)) {
    return 'border-amber-200 bg-amber-50 text-amber-700'
  }
  return 'border-slate-200 bg-slate-100 text-slate-700'
}

function isBuildTerminal(build?: AirgapBuild | null) {
  return build ? TERMINAL_STATUSES.has(build.status) : false
}

function normalizeBuildArgRows(rows: Array<{ key: string; value: string }>) {
  return rows.reduce<Record<string, string>>((accumulator, row) => {
    const key = row.key.trim()
    if (!key) {
      return accumulator
    }
    accumulator[key] = row.value.trim()
    return accumulator
  }, {})
}

function getRelativePath(file: File) {
  const entry = file as File & { webkitRelativePath?: string }
  return entry.webkitRelativePath?.trim() || file.name
}

function hasDockerfileInContext(files: File[]) {
  return files.some((file) => /(^|\/)dockerfile$/i.test(getRelativePath(file)))
}

export function ProjectAirgapBuildTab({
  projectId,
  currentUserName = 'developer',
  canManage = false,
}: ProjectAirgapBuildTabProps) {
  const toast = useToast()
  const [builds, setBuilds] = useState<AirgapBuild[]>([])
  const [selectedBuildId, setSelectedBuildId] = useState<string | null>(null)
  const [selectedBuild, setSelectedBuild] = useState<AirgapBuild | null>(null)
  const [scanResult, setScanResult] = useState<AirgapScanResult | null>(null)
  const [logs, setLogs] = useState<AirgapBuildLogEntry[]>([])
  const [baseImages, setBaseImages] = useState<AirgapBaseImage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [dockerfileText, setDockerfileText] = useState(PLACEHOLDER_DOCKERFILE)
  const [dockerfileFile, setDockerfileFile] = useState<File | null>(null)
  const [contextFiles, setContextFiles] = useState<File[]>([])
  const [imageName, setImageName] = useState(`registry.internal.bank.co.kr/project-${projectId ?? 0}/sample-app`)
  const [tag, setTag] = useState('build-local')
  const [platform, setPlatform] = useState('linux/amd64')
  const [description, setDescription] = useState('Air-gapped build request')
  const [buildArgRows, setBuildArgRows] = useState([{ key: '', value: '' }])

  useEffect(() => {
    if (!projectId) {
      return
    }
    setImageName(`registry.internal.bank.co.kr/project-${projectId}/sample-app`)
  }, [projectId])

  async function refreshBuilds(keepSelection = true) {
    if (!projectId) {
      setBuilds([])
      setSelectedBuildId(null)
      return
    }

    const payload = await fetchAirgapBuilds(projectId)
    setBuilds(payload.builds)

    if (payload.builds.length === 0) {
      setSelectedBuildId(null)
      return
    }

    if (keepSelection && selectedBuildId && payload.builds.some((build) => build.id === selectedBuildId)) {
      return
    }

    setSelectedBuildId(payload.builds[0]?.id ?? null)
  }

  async function refreshSelectedBuild(buildId: string) {
    const [detailPayload, logPayload] = await Promise.all([fetchAirgapBuild(buildId), fetchAirgapBuildLogs(buildId)])
    setSelectedBuild(detailPayload.build)
    setScanResult(detailPayload.scanResult)
    setLogs(logPayload.logs)
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!projectId) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      try {
        const [buildPayload, baseImagePayload] = await Promise.all([fetchAirgapBuilds(projectId), fetchAirgapBaseImages()])
        if (cancelled) {
          return
        }
        setBuilds(buildPayload.builds)
        setBaseImages(baseImagePayload.baseImages)
        setSelectedBuildId(buildPayload.builds[0]?.id ?? null)
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Failed to load build data.')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [projectId, toast])

  useEffect(() => {
    if (!selectedBuildId) {
      setSelectedBuild(null)
      setScanResult(null)
      setLogs([])
      return
    }

    let cancelled = false
    let intervalId = 0

    async function loadSelected() {
      try {
        const [detailPayload, logPayload] = await Promise.all([
          fetchAirgapBuild(selectedBuildId),
          fetchAirgapBuildLogs(selectedBuildId),
        ])
        if (cancelled) {
          return
        }
        setSelectedBuild(detailPayload.build)
        setScanResult(detailPayload.scanResult)
        setLogs(logPayload.logs)
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Failed to load selected build.')
        }
      }
    }

    void loadSelected()
    intervalId = window.setInterval(() => {
      void loadSelected()
      void refreshBuilds(true)
    }, 2000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [selectedBuildId, toast])

  const selectedBuildWarnings = useMemo(
    () => selectedBuild?.policyReport.findings.filter((finding) => finding.severity === 'WARN') ?? [],
    [selectedBuild],
  )
  const selectedBuildBlocks = useMemo(
    () => selectedBuild?.policyReport.findings.filter((finding) => finding.severity === 'BLOCK') ?? [],
    [selectedBuild],
  )
  const contextHasDockerfile = useMemo(() => hasDockerfileInContext(contextFiles), [contextFiles])
  const contextFileSummary = useMemo(
    () => ({
      count: contextFiles.length,
      totalBytes: contextFiles.reduce((sum, file) => sum + file.size, 0),
      preview: contextFiles.slice(0, 4).map((file) => getRelativePath(file)),
    }),
    [contextFiles],
  )

  async function handleSubmitBuild() {
    if (!projectId) {
      return
    }
    if (!dockerfileFile && !dockerfileText.trim() && !contextHasDockerfile) {
      toast.error('Provide a Dockerfile file, paste Dockerfile content, or upload a context folder containing Dockerfile.')
      return
    }

    setIsSubmitting(true)
    try {
      const payload = await createAirgapBuild(
        {
          projectId,
          imageName,
          tag,
          platform,
          description,
          buildArgs: normalizeBuildArgRows(buildArgRows),
          dockerfileContent: dockerfileFile || contextHasDockerfile ? undefined : dockerfileText,
          dockerfileFile,
          contextFiles,
        },
        currentUserName,
      )
      await refreshBuilds(false)
      setSelectedBuildId(payload.build.id)
      toast.success(
        payload.build.status === 'REJECTED' ? 'Build request was rejected by policy.' : 'Build request created.',
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create build request.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleRetryBuild(buildId: string) {
    try {
      const payload = await retryAirgapBuild(buildId, currentUserName)
      await refreshBuilds(false)
      setSelectedBuildId(payload.build.id)
      toast.success('Build retry requested.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to retry build.')
    }
  }

  async function handleCancelBuild(buildId: string) {
    try {
      await cancelAirgapBuild(buildId, currentUserName)
      await refreshBuilds(true)
      await refreshSelectedBuild(buildId)
      toast.success('Build cancellation requested.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to cancel build.')
    }
  }

  if (!projectId) {
    return (
      <section className="empty-panel">
        <p className="text-sm text-slate-600">A project id is required before air-gapped builds can be requested.</p>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <div className="page-panel space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-slate-900">Air-gapped Build Center</h2>
            <p className="text-sm text-slate-600">
              Submit Dockerfiles for policy validation, isolated build execution, offline scan, and internal registry push.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Pill variant="subtle">Project #{projectId}</Pill>
            <Pill variant="subtle">{baseImages.length} base images allowed</Pill>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-700">Image name</span>
                <input
                  value={imageName}
                  onChange={(event) => setImageName(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-200 focus:border-slate-500 focus:ring-2"
                  disabled={!canManage || isSubmitting}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-700">Tag</span>
                <input
                  value={tag}
                  onChange={(event) => setTag(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-200 focus:border-slate-500 focus:ring-2"
                  disabled={!canManage || isSubmitting}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-700">Platform</span>
                <select
                  value={platform}
                  onChange={(event) => setPlatform(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-200 focus:border-slate-500 focus:ring-2"
                  disabled={!canManage || isSubmitting}
                >
                  <option value="linux/amd64">linux/amd64</option>
                  <option value="linux/arm64">linux/arm64</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-700">Description</span>
                <input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-200 focus:border-slate-500 focus:ring-2"
                  disabled={!canManage || isSubmitting}
                />
              </label>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">Dockerfile</h3>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700">
                    <Upload className="h-4 w-4" />
                    Upload Dockerfile
                    <input
                      type="file"
                      className="hidden"
                      onChange={(event) => setDockerfileFile(event.target.files?.[0] ?? null)}
                      disabled={!canManage || isSubmitting}
                    />
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700">
                    <Upload className="h-4 w-4" />
                    Upload context files
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(event) => setContextFiles(Array.from(event.target.files ?? []))}
                      disabled={!canManage || isSubmitting}
                    />
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700">
                    <Upload className="h-4 w-4" />
                    Upload folder
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      {...({ webkitdirectory: '' } as Record<string, string>)}
                      onChange={(event) => setContextFiles(Array.from(event.target.files ?? []))}
                      disabled={!canManage || isSubmitting}
                    />
                  </label>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Use one of the allowed internal base images below. A context folder can include its own Dockerfile and app files.
              </p>
              <textarea
                value={dockerfileText}
                onChange={(event) => setDockerfileText(event.target.value)}
                rows={11}
                className="w-full rounded-2xl border border-slate-300 bg-slate-950 px-4 py-3 font-mono text-xs leading-6 text-slate-100 outline-none ring-slate-200 focus:border-slate-500 focus:ring-2"
                disabled={!canManage || isSubmitting || Boolean(dockerfileFile) || contextHasDockerfile}
              />
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>
                  {dockerfileFile
                    ? `Selected file: ${dockerfileFile.name}`
                    : contextHasDockerfile
                      ? 'Dockerfile will be taken from the uploaded context.'
                      : 'Using pasted Dockerfile content'}
                </span>
                {dockerfileFile ? (
                  <button
                    type="button"
                    className="rounded-full border border-slate-300 px-2 py-1 text-slate-600"
                    onClick={() => setDockerfileFile(null)}
                    disabled={!canManage || isSubmitting}
                  >
                    Clear file
                  </button>
                ) : null}
                {contextFiles.length > 0 ? (
                  <button
                    type="button"
                    className="rounded-full border border-slate-300 px-2 py-1 text-slate-600"
                    onClick={() => setContextFiles([])}
                    disabled={!canManage || isSubmitting}
                  >
                    Clear context
                  </button>
                ) : null}
              </div>
              {contextFiles.length > 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs text-slate-600">
                  <p className="font-semibold text-slate-800">
                    {contextFileSummary.count} files selected, {formatBytes(contextFileSummary.totalBytes)}
                    {contextHasDockerfile ? ' including Dockerfile.' : '.'}
                  </p>
                  <div className="mt-2 space-y-1 font-mono">
                    {contextFileSummary.preview.map((entry) => (
                      <p key={entry}>{entry}</p>
                    ))}
                    {contextFileSummary.count > contextFileSummary.preview.length ? (
                      <p>+{contextFileSummary.count - contextFileSummary.preview.length} more files</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">Build args</h3>
                <button
                  type="button"
                  className="rounded-full border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
                  onClick={() => setBuildArgRows((previous) => [...previous, { key: '', value: '' }])}
                  disabled={!canManage || isSubmitting}
                >
                  Add arg
                </button>
              </div>
              <div className="space-y-2">
                {buildArgRows.map((row, index) => (
                  <div key={`arg-${index}`} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                    <input
                      value={row.key}
                      onChange={(event) =>
                        setBuildArgRows((previous) =>
                          previous.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, key: event.target.value } : entry,
                          ),
                        )
                      }
                      placeholder="KEY"
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-200 focus:border-slate-500 focus:ring-2"
                      disabled={!canManage || isSubmitting}
                    />
                    <input
                      value={row.value}
                      onChange={(event) =>
                        setBuildArgRows((previous) =>
                          previous.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, value: event.target.value } : entry,
                          ),
                        )
                      }
                      placeholder="VALUE"
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-200 focus:border-slate-500 focus:ring-2"
                      disabled={!canManage || isSubmitting}
                    />
                    <button
                      type="button"
                      className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-600"
                      onClick={() =>
                        setBuildArgRows((previous) =>
                          previous.length === 1 ? [{ key: '', value: '' }] : previous.filter((_, entryIndex) => entryIndex !== index),
                        )
                      }
                      disabled={!canManage || isSubmitting}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <OpalButton
                variant="primary"
                size="sm"
                icon={<Play className="h-4 w-4" />}
                onClick={() => void handleSubmitBuild()}
                disabled={!canManage || isSubmitting}
              >
                {isSubmitting ? 'Submitting...' : 'Request build'}
              </OpalButton>
              <OpalButton variant="secondary" size="sm" icon={<RefreshCcw className="h-4 w-4" />} onClick={() => void refreshBuilds(true)}>
                Refresh
              </OpalButton>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900">Allowed base images</h3>
              <Pill variant="subtle">{baseImages.length}</Pill>
            </div>
            <div className="mt-3 space-y-2">
              {baseImages.slice(0, 6).map((baseImage) => (
                <div key={baseImage.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="font-mono text-xs text-slate-800">{baseImage.imageRef}</p>
                  <p className="mt-1 text-xs text-slate-500">{baseImage.description || 'Internal approved base image'}</p>
                </div>
              ))}
              {baseImages.length === 0 ? (
                <div className="empty-panel">
                  <p className="text-sm text-slate-600">No approved base images are configured.</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="page-panel space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-900">Recent builds</h3>
            <Pill variant="subtle">{builds.length}</Pill>
          </div>
          {isLoading ? <p className="text-sm text-slate-500">Loading build history...</p> : null}
          <div className="space-y-3">
            {builds.map((build) => (
              <button
                key={build.id}
                type="button"
                onClick={() => setSelectedBuildId(build.id)}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  selectedBuildId === build.id
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <p className={`text-sm font-semibold ${selectedBuildId === build.id ? 'text-white' : 'text-slate-900'}`}>
                      {build.imageName}:{build.tag}
                    </p>
                    <p className={`text-xs ${selectedBuildId === build.id ? 'text-slate-300' : 'text-slate-500'}`}>{build.id}</p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusClasses(build.status)}`}>
                    {formatBuildStatus(build.status)}
                  </span>
                </div>
                <div className={`mt-3 flex flex-wrap gap-3 text-xs ${selectedBuildId === build.id ? 'text-slate-300' : 'text-slate-500'}`}>
                  <span>{formatDateTime(build.createdAt)}</span>
                  <span>{build.requesterName}</span>
                  <span>{formatBytes(build.contextSize)}</span>
                </div>
              </button>
            ))}
            {builds.length === 0 && !isLoading ? (
              <div className="empty-panel">
                <p className="text-sm text-slate-600">No air-gapped builds have been requested for this project yet.</p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="page-panel space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Build detail</h3>
              <p className="text-sm text-slate-500">Policy findings, scan status, and worker logs are shown here.</p>
            </div>
            {selectedBuild ? (
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClasses(selectedBuild.status)}`}>
                {formatBuildStatus(selectedBuild.status)}
              </span>
            ) : null}
          </div>

          {selectedBuild ? (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Image</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{selectedBuild.imageName}:{selectedBuild.tag}</p>
                  <p className="mt-1 text-xs text-slate-500">{selectedBuild.id}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Timeline</p>
                  <p className="mt-2 text-sm text-slate-900">Created {formatDateTime(selectedBuild.createdAt)}</p>
                  <p className="mt-1 text-sm text-slate-600">Started {formatDateTime(selectedBuild.startedAt)}</p>
                  <p className="mt-1 text-sm text-slate-600">Completed {formatDateTime(selectedBuild.completedAt)}</p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Context</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{formatBytes(selectedBuild.contextSize)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Policy</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {selectedBuild.policyReport.summary.blockCount} block / {selectedBuild.policyReport.summary.warnCount} warn
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Digest</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{selectedBuild.imageDigest ?? '-'}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Duration</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {selectedBuild.durationSec ? `${selectedBuild.durationSec}s` : '-'}
                  </p>
                </div>
              </div>

              {selectedBuild.errorMessage ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {selectedBuild.errorMessage}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <OpalButton
                  variant="secondary"
                  size="sm"
                  icon={<RefreshCcw className="h-4 w-4" />}
                  onClick={() => void handleRetryBuild(selectedBuild.id)}
                  disabled={!canManage}
                >
                  Retry
                </OpalButton>
                <OpalButton
                  variant="secondary"
                  size="sm"
                  icon={<Square className="h-4 w-4" />}
                  onClick={() => void handleCancelBuild(selectedBuild.id)}
                  disabled={!canManage || isBuildTerminal(selectedBuild)}
                >
                  Cancel
                </OpalButton>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-slate-700" />
                    <h4 className="text-sm font-semibold text-slate-900">Policy findings</h4>
                  </div>
                  <div className="mt-3 space-y-2">
                    {selectedBuildBlocks.map((finding) => (
                      <div key={`${finding.ruleId}-${finding.lineNumber}`} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        <p className="font-semibold">{finding.ruleId}</p>
                        <p className="mt-1">{finding.message}</p>
                      </div>
                    ))}
                    {selectedBuildWarnings.map((finding) => (
                      <div key={`${finding.ruleId}-${finding.lineNumber}`} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                        <p className="font-semibold">{finding.ruleId}</p>
                        <p className="mt-1">{finding.message}</p>
                      </div>
                    ))}
                    {selectedBuild.policyReport.findings.length === 0 ? (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                        No policy findings.
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex items-center gap-2">
                    {scanResult?.passed ? (
                      <ShieldCheck className="h-4 w-4 text-emerald-700" />
                    ) : (
                      <Clock3 className="h-4 w-4 text-slate-700" />
                    )}
                    <h4 className="text-sm font-semibold text-slate-900">Offline scan</h4>
                  </div>
                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                    <p>Critical: {scanResult?.criticalCount ?? 0}</p>
                    <p>High: {scanResult?.highCount ?? 0}</p>
                    <p>Medium: {scanResult?.mediumCount ?? 0}</p>
                    <p>Low: {scanResult?.lowCount ?? 0}</p>
                    <p>Status: {scanResult ? (scanResult.passed ? 'Passed' : 'Blocked') : 'Pending'}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-950 p-4">
                <div className="flex items-center gap-2">
                  <TerminalSquare className="h-4 w-4 text-slate-100" />
                  <h4 className="text-sm font-semibold text-white">Build logs</h4>
                </div>
                <div className="mt-3 max-h-[24rem] overflow-auto rounded-xl border border-slate-800 bg-slate-950/80 p-3 font-mono text-xs leading-6 text-slate-200">
                  {logs.map((entry, index) => (
                    <div key={`${entry.timestamp}-${index}`} className={entry.stream === 'stderr' ? 'text-red-300' : 'text-slate-200'}>
                      <span className="text-slate-500">[{formatDateTime(entry.timestamp)}]</span> {entry.line}
                    </div>
                  ))}
                  {logs.length === 0 ? <div className="text-slate-500">No logs have been recorded yet.</div> : null}
                </div>
              </div>
            </>
          ) : (
            <div className="empty-panel">
              <p className="text-sm text-slate-600">Select a build from the list to inspect policy results and logs.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
