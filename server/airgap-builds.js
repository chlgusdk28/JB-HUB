import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import {
  AIRGAP_BUILD_LOGS_ROOT,
  AIRGAP_BUILD_ROOT,
  AIRGAP_BUILD_STATE_PATH,
  AIRGAP_BUILD_UPLOADS_ROOT,
} from './runtime-paths.js'

const WORKER_POLL_INTERVAL_MS = 1000
const BUILD_STEP_DELAY_MS = 450
const DEFAULT_BUILD_TIMEOUT_MS = 30 * 60 * 1000
const DEFAULT_SCAN_TIMEOUT_MS = 10 * 60 * 1000
const MAX_CAPTURED_OUTPUT_CHARS = 256 * 1024
const MAX_BUILD_ARGS = 20
const MAX_METADATA_DESCRIPTION_LENGTH = 500
const MAX_METADATA_IMAGE_NAME_LENGTH = 180
const MAX_METADATA_TAG_LENGTH = 128
const MAX_LOG_LINES = 4000
const DEFAULT_ALLOWED_PORTS = new Set([80, 443, 8080, 8443, 3000, 5000, 5173])
const DEFAULT_ALLOWED_MIRROR_HINTS = ['internal', 'mirror', 'bank.co.kr', 'registry.internal']
const DEFAULT_ALLOWED_BASE_IMAGES = [
  'registry.internal.bank.co.kr/base/node:20-alpine',
  'registry.internal.bank.co.kr/base/python:3.12-slim',
  'registry.internal.bank.co.kr/base/openjdk:17',
  'registry.internal.bank.co.kr/base/nginx:1.27',
]
const TERMINAL_BUILD_STATUSES = new Set([
  'REJECTED',
  'FAILED',
  'SCAN_FAILED',
  'PUSH_BLOCKED',
  'COMPLETED',
  'CANCELLED',
])
const DEFAULT_POLICY_RULES = [
  { id: 'POL-001', severity: 'BLOCK', description: 'Base image must be in the allowlist.' },
  { id: 'POL-002', severity: 'BLOCK', description: 'Remote URLs in ADD/COPY are not allowed.' },
  { id: 'POL-003', severity: 'BLOCK', description: 'curl/wget downloads from external URLs are not allowed.' },
  { id: 'POL-004', severity: 'WARN', description: 'Final stage should not run as root.' },
  { id: 'POL-005', severity: 'WARN', description: 'Only approved EXPOSE ports should be used.' },
  { id: 'POL-006', severity: 'BLOCK', description: 'Sensitive values must not be hardcoded in ENV.' },
  { id: 'POL-007', severity: 'BLOCK', description: 'Package manager sources must point to internal mirrors only.' },
  { id: 'POL-008', severity: 'WARN', description: 'Prefer multi-stage builds for larger images.' },
]

function pathExists(targetPath) {
  try {
    fs.accessSync(targetPath, fs.constants.F_OK)
    return true
  } catch {
    return false
  }
}

function ensureAirgapBuildLayout() {
  fs.mkdirSync(AIRGAP_BUILD_ROOT, { recursive: true })
  fs.mkdirSync(AIRGAP_BUILD_UPLOADS_ROOT, { recursive: true })
  fs.mkdirSync(AIRGAP_BUILD_LOGS_ROOT, { recursive: true })

  if (!pathExists(AIRGAP_BUILD_STATE_PATH)) {
    const initialState = createInitialState()
    fs.writeFileSync(AIRGAP_BUILD_STATE_PATH, JSON.stringify(initialState, null, 2), 'utf8')
  }
}

function createInitialState() {
  const now = new Date().toISOString()
  return {
    version: 1,
    nextBuildNumber: 1,
    nextBaseImageId: 1,
    nextScanResultId: 1,
    nextAuditId: 1,
    baseImages: DEFAULT_ALLOWED_BASE_IMAGES.map((imageRef, index) => ({
      id: index + 1,
      imageRef,
      description: 'Seeded internal base image',
      active: true,
      addedBy: 'system',
      addedAt: now,
    })),
    builds: [],
    scanResults: [],
    auditLogs: [],
  }
}

function loadState() {
  ensureAirgapBuildLayout()
  try {
    const raw = fs.readFileSync(AIRGAP_BUILD_STATE_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid airgap build state payload.')
    }
    return parsed
  } catch {
    const resetState = createInitialState()
    fs.writeFileSync(AIRGAP_BUILD_STATE_PATH, JSON.stringify(resetState, null, 2), 'utf8')
    return resetState
  }
}

function saveState(state) {
  ensureAirgapBuildLayout()
  fs.writeFileSync(AIRGAP_BUILD_STATE_PATH, JSON.stringify(state, null, 2), 'utf8')
}

function withState(mutator) {
  const state = loadState()
  const result = mutator(state) ?? state
  saveState(state)
  return result
}

function readEnvString(key, fallback = '') {
  const value = process.env[key]
  if (typeof value !== 'string') {
    return fallback
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

function readEnvNumber(key, fallback) {
  const rawValue = readEnvString(key, String(fallback))
  const parsed = Number.parseInt(rawValue, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function tokenizeCommandString(value) {
  const matches = String(value ?? '').match(/"([^"]*)"|'([^']*)'|[^\s]+/g)
  if (!matches) {
    return []
  }

  return matches
    .map((token) => token.replace(/^['"]|['"]$/g, '').trim())
    .filter(Boolean)
}

function parseCommandDefinition(rawValue) {
  const normalized = String(rawValue ?? '').trim()
  if (!normalized) {
    return []
  }

  try {
    const parsed = JSON.parse(normalized)
    if (Array.isArray(parsed)) {
      return parsed.map((entry) => String(entry))
    }
  } catch {
    // Fall back to tokenizing a plain command string.
  }

  return tokenizeCommandString(normalized)
}

function applyTemplate(value, replacements) {
  return String(value ?? '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => {
    const replacement = replacements[key]
    return replacement === undefined || replacement === null ? '' : String(replacement)
  })
}

function nowIso() {
  return new Date().toISOString()
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex')
}

function readSingleHeader(value) {
  if (Array.isArray(value)) {
    return String(value[0] ?? '')
  }

  return typeof value === 'string' ? value : ''
}

function resolveActor(req) {
  const headerName = readSingleHeader(req.headers['x-jb-user-name']).trim()
  const fallbackName =
    typeof req.user?.username === 'string' && req.user.username.trim()
      ? req.user.username.trim()
      : typeof req.user?.name === 'string' && req.user.name.trim()
        ? req.user.name.trim()
        : ''
  const role =
    typeof req.user?.role === 'string' && req.user.role.trim()
      ? req.user.role.trim()
      : readSingleHeader(req.headers['x-jb-user-role']).trim() || 'developer'

  return {
    name: headerName || fallbackName || 'anonymous',
    role,
  }
}

function requireActor(req, res) {
  const actor = resolveActor(req)
  if (!actor.name || actor.name === 'anonymous') {
    res.status(401).json({
      error: 'An authenticated actor is required. Send Authorization or x-jb-user-name.',
      requestId: res.getHeader?.('x-request-id') ?? undefined,
    })
    return null
  }

  return actor
}

function requireAdminActor(req, res) {
  const actor = requireActor(req, res)
  if (!actor) {
    return null
  }

  if (!['admin', 'maintainer', 'super_admin'].includes(String(actor.role).toLowerCase())) {
    res.status(403).json({
      error: 'Admin or maintainer role is required for this action.',
      requestId: res.getHeader?.('x-request-id') ?? undefined,
    })
    return null
  }

  return actor
}

function sanitizeBuildId(value) {
  return String(value ?? '')
    .trim()
    .replace(/[^A-Za-z0-9-]/g, '')
}

function sanitizeRelativePath(inputPath, fallbackName = 'file') {
  const rawPath = typeof inputPath === 'string' && inputPath.trim() ? inputPath : fallbackName
  const segments = rawPath
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)

  if (segments.length === 0) {
    return fallbackName
  }

  return segments
    .map((segment, index) => {
      const safeSegment = segment.replace(/[<>:\"|?*\u0000-\u001f]/g, '_').trim()
      if (!safeSegment || safeSegment === '.' || safeSegment === '..') {
        return index === segments.length - 1 ? fallbackName : 'folder'
      }
      return safeSegment
    })
    .join('/')
}

function normalizeRelativePaths(rawPaths) {
  if (Array.isArray(rawPaths)) {
    return rawPaths.map((entry) => String(entry))
  }

  if (typeof rawPaths === 'string' && rawPaths.trim()) {
    try {
      const parsed = JSON.parse(rawPaths)
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => String(entry))
      }
    } catch {
      return []
    }
  }

  return []
}

function trimText(value, maxLength) {
  return String(value ?? '')
    .trim()
    .slice(0, maxLength)
}

function normalizeBuildArgs(rawBuildArgs) {
  if (!rawBuildArgs || typeof rawBuildArgs !== 'object' || Array.isArray(rawBuildArgs)) {
    return {}
  }

  const entries = Object.entries(rawBuildArgs).slice(0, MAX_BUILD_ARGS)
  const normalized = {}

  for (const [rawKey, rawValue] of entries) {
    const key = trimText(rawKey, 64).replace(/[^A-Za-z0-9_]/g, '_')
    if (!key) {
      continue
    }
    normalized[key] = trimText(rawValue, 256)
  }

  return normalized
}

function normalizeMetadata(rawMetadata, req) {
  const metadata = rawMetadata && typeof rawMetadata === 'object' && !Array.isArray(rawMetadata) ? rawMetadata : {}
  const imageName = trimText(metadata.imageName, MAX_METADATA_IMAGE_NAME_LENGTH)
  const tag = trimText(metadata.tag || 'latest', MAX_METADATA_TAG_LENGTH)
  const projectIdRaw = metadata.projectId ?? req.body?.projectId
  const projectId = Number.parseInt(String(projectIdRaw ?? ''), 10)

  if (!imageName) {
    throw new Error('validation:imageName is required.')
  }
  if (!tag) {
    throw new Error('validation:tag is required.')
  }
  if (!Number.isFinite(projectId) || projectId <= 0) {
    throw new Error('validation:projectId is required.')
  }

  return {
    projectId,
    imageName,
    tag,
    platform: trimText(metadata.platform || 'linux/amd64', 64) || 'linux/amd64',
    description: trimText(metadata.description, MAX_METADATA_DESCRIPTION_LENGTH),
    buildArgs: normalizeBuildArgs(metadata.buildArgs),
  }
}

function buildImageReference(imageName, tag) {
  return `${imageName}:${tag}`
}

function formatBuildArgsAsFlags(buildArgs, style = 'docker') {
  const entries = Object.entries(buildArgs ?? {})
  if (entries.length === 0) {
    return {
      string: '',
      values: [],
    }
  }

  const values = entries.flatMap(([key, value]) => {
    if (style === 'kaniko') {
      return [`--build-arg=${key}=${value}`]
    }
    return ['--build-arg', `${key}=${value}`]
  })

  return {
    string: values.join(' '),
    values,
  }
}

function getAirgapExecutionConfig() {
  const executorMode = readEnvString('AIRGAP_BUILD_EXECUTOR_MODE', 'mock').toLowerCase()
  const scanMode = readEnvString(
    'AIRGAP_SCAN_MODE',
    executorMode === 'mock' ? 'mock' : readEnvString('AIRGAP_SCAN_COMMAND', '') ? 'shell' : 'mock',
  ).toLowerCase()

  return {
    executorMode,
    scanMode,
    buildTimeoutMs: readEnvNumber('AIRGAP_BUILD_TIMEOUT_MS', DEFAULT_BUILD_TIMEOUT_MS),
    scanTimeoutMs: readEnvNumber('AIRGAP_SCAN_TIMEOUT_MS', DEFAULT_SCAN_TIMEOUT_MS),
    registryMirror: readEnvString('AIRGAP_INTERNAL_REGISTRY_MIRROR', ''),
    internalRegistry: readEnvString('AIRGAP_INTERNAL_REGISTRY', ''),
    shellBuildCommand: parseCommandDefinition(readEnvString('AIRGAP_BUILD_EXECUTOR_COMMAND', '')),
    shellPushCommand: parseCommandDefinition(readEnvString('AIRGAP_PUSH_COMMAND', '')),
    shellScanCommand: parseCommandDefinition(readEnvString('AIRGAP_SCAN_COMMAND', '')),
    shellInspectCommand: parseCommandDefinition(readEnvString('AIRGAP_INSPECT_COMMAND', '')),
    kanikoRuntimeBin: readEnvString('AIRGAP_KANIKO_RUNTIME_BIN', 'docker'),
    kanikoImage: readEnvString('AIRGAP_KANIKO_IMAGE', 'gcr.io/kaniko-project/executor:latest'),
    kanikoDockerConfigDir: readEnvString('AIRGAP_KANIKO_DOCKER_CONFIG_DIR', ''),
    kanikoCacheRepo: readEnvString('AIRGAP_KANIKO_CACHE_REPO', ''),
    kanikoAdditionalArgs: parseCommandDefinition(readEnvString('AIRGAP_KANIKO_ADDITIONAL_ARGS', '')),
  }
}

function getUploadRoot(buildId) {
  return path.join(AIRGAP_BUILD_UPLOADS_ROOT, buildId)
}

function getContextRoot(buildId) {
  return path.join(getUploadRoot(buildId), 'context')
}

function getLogFilePath(buildId) {
  return path.join(AIRGAP_BUILD_LOGS_ROOT, `${buildId}.jsonl`)
}

function writeFileAtomic(targetPath, contents) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, contents, 'utf8')
}

function getUploadedFileList(rawEntry) {
  if (!rawEntry) {
    return []
  }

  return Array.isArray(rawEntry) ? rawEntry : [rawEntry]
}

async function moveUploadedFile(uploadedFile, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  await uploadedFile.mv(targetPath)
}

async function materializeBuildContext(buildId, req) {
  const uploadRoot = getUploadRoot(buildId)
  const contextRoot = getContextRoot(buildId)

  fs.mkdirSync(uploadRoot, { recursive: true })
  fs.mkdirSync(contextRoot, { recursive: true })

  const dockerfileFile = getUploadedFileList(req.files?.dockerfile)[0] ?? null
  const contextFiles = getUploadedFileList(req.files?.files)
  const unsupportedArchive = getUploadedFileList(req.files?.context)[0] ?? null
  const relativePaths = normalizeRelativePaths(req.body?.relativePaths)
  const dockerfileContent = typeof req.body?.dockerfileContent === 'string' ? req.body.dockerfileContent : ''

  if (unsupportedArchive && contextFiles.length === 0 && !dockerfileFile && !dockerfileContent.trim()) {
    throw new Error(
      'validation:Archive-only uploads are not supported in this MVP. Upload a Dockerfile or expanded context files.',
    )
  }

  const savedFiles = []
  let totalSize = 0

  if (dockerfileFile) {
    const dockerfilePath = path.join(contextRoot, 'Dockerfile')
    await moveUploadedFile(dockerfileFile, dockerfilePath)
    const stats = fs.statSync(dockerfilePath)
    totalSize += stats.size
    savedFiles.push({
      relativePath: 'Dockerfile',
      absolutePath: dockerfilePath,
      size: stats.size,
    })
  } else if (dockerfileContent.trim()) {
    const dockerfilePath = path.join(contextRoot, 'Dockerfile')
    writeFileAtomic(dockerfilePath, dockerfileContent)
    const stats = fs.statSync(dockerfilePath)
    totalSize += stats.size
    savedFiles.push({
      relativePath: 'Dockerfile',
      absolutePath: dockerfilePath,
      size: stats.size,
    })
  }

  for (const [index, uploadedFile] of contextFiles.entries()) {
    const fallbackName = uploadedFile?.name ? String(uploadedFile.name) : `context-${index + 1}`
    const relativePath = sanitizeRelativePath(relativePaths[index] ?? fallbackName, fallbackName)
    const targetPath = path.join(contextRoot, relativePath)
    const relativeToContext = path.relative(contextRoot, targetPath)
    if (relativeToContext.startsWith('..') || path.isAbsolute(relativeToContext)) {
      throw new Error('validation:Invalid context file path.')
    }

    await moveUploadedFile(uploadedFile, targetPath)
    const stats = fs.statSync(targetPath)
    totalSize += stats.size
    savedFiles.push({
      relativePath,
      absolutePath: targetPath,
      size: stats.size,
    })
  }

  const dockerfileEntry =
    savedFiles.find((entry) => entry.relativePath.toLowerCase() === 'dockerfile') ??
    savedFiles.find((entry) => /(^|\/)dockerfile$/i.test(entry.relativePath))

  if (!dockerfileEntry) {
    throw new Error('validation:A Dockerfile is required for the build request.')
  }

  return {
    uploadRoot,
    contextRoot,
    dockerfileAbsolutePath: dockerfileEntry.absolutePath,
    dockerfileRelativePath: dockerfileEntry.relativePath,
    dockerfileContents: fs.readFileSync(dockerfileEntry.absolutePath, 'utf8'),
    contextSize: totalSize,
    files: savedFiles.map((entry) => ({
      path: entry.relativePath,
      size: entry.size,
    })),
  }
}

function parseDockerfileStages(dockerfileContents) {
  const lines = String(dockerfileContents ?? '').split(/\r?\n/)
  const instructions = []
  let currentStageIndex = -1

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1
    const trimmed = rawLine.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      return
    }

    const match = trimmed.match(/^([A-Z]+)\s+(.*)$/i)
    if (!match) {
      return
    }

    const command = match[1].toUpperCase()
    const value = match[2].trim()

    if (command === 'FROM') {
      currentStageIndex += 1
    }

    instructions.push({
      lineNumber,
      line: rawLine,
      command,
      value,
      stageIndex: currentStageIndex,
    })
  })

  return instructions
}

function addFinding(findings, ruleId, severity, lineNumber, line, message) {
  findings.push({
    ruleId,
    severity,
    lineNumber,
    line: typeof line === 'string' ? line.trim() : null,
    message,
  })
}

function matchesAllowedBaseImage(imageRef, allowedBaseImages) {
  const normalizedImageRef = String(imageRef ?? '').trim()
  if (!normalizedImageRef) {
    return false
  }

  return allowedBaseImages.some((entry) => {
    const normalizedAllowed = String(entry ?? '').trim()
    if (!normalizedAllowed) {
      return false
    }
    if (normalizedAllowed.endsWith('*')) {
      return normalizedImageRef.startsWith(normalizedAllowed.slice(0, -1))
    }
    return normalizedImageRef === normalizedAllowed
  })
}

function isSensitiveEnvKey(value) {
  return /(password|passwd|secret|token|apikey|api_key|private_key|credential)/i.test(String(value ?? ''))
}

function isTemplateValue(value) {
  return /\$\{[^}]+\}/.test(String(value ?? '')) || /^\$[A-Za-z_][A-Za-z0-9_]*$/.test(String(value ?? ''))
}

function usesExternalSourceCommand(value) {
  const normalized = String(value ?? '').toLowerCase()
  if (!normalized) {
    return false
  }

  const sourcePatterns = [
    /pip\s+config\s+set\s+global\.index-url/,
    /pip\s+install\s+.*--index-url/,
    /npm\s+config\s+set\s+registry/,
    /yarn\s+config\s+set\s+registry/,
    /apk\s+add\s+.*--repository/,
    /yum-config-manager\s+--add-repo/,
    /dnf\s+config-manager\s+--add-repo/,
    /sources\.list/,
    /yum\.repos\.d/,
  ]

  return sourcePatterns.some((pattern) => pattern.test(normalized))
}

function isAllowedMirrorReference(line, allowedMirrorHints) {
  const normalized = String(line ?? '').toLowerCase()
  return allowedMirrorHints.some((hint) => normalized.includes(String(hint).toLowerCase()))
}

function analyzeDockerfile(dockerfileContents, options = {}) {
  const allowedBaseImages = Array.isArray(options.allowedBaseImages) ? options.allowedBaseImages : []
  const allowedPorts = options.allowedPorts instanceof Set ? options.allowedPorts : DEFAULT_ALLOWED_PORTS
  const allowedMirrorHints = Array.isArray(options.allowedMirrorHints)
    ? options.allowedMirrorHints
    : DEFAULT_ALLOWED_MIRROR_HINTS
  const findings = []
  const instructions = parseDockerfileStages(dockerfileContents)
  const baseImages = []
  const stageUsers = new Map()
  const exposedPorts = []

  for (const instruction of instructions) {
    if (instruction.command === 'FROM') {
      const fromMatch = instruction.value.match(/^(?:--platform=\S+\s+)?([^\s]+)(?:\s+AS\s+\S+)?$/i)
      const imageRef = fromMatch ? fromMatch[1] : instruction.value
      baseImages.push(imageRef)
      if (!matchesAllowedBaseImage(imageRef, allowedBaseImages)) {
        addFinding(
          findings,
          'POL-001',
          'BLOCK',
          instruction.lineNumber,
          instruction.line,
          `Base image "${imageRef}" is not in the internal allowlist.`,
        )
      }
    }

    if ((instruction.command === 'ADD' || instruction.command === 'COPY') && /https?:\/\//i.test(instruction.value)) {
      addFinding(
        findings,
        'POL-002',
        'BLOCK',
        instruction.lineNumber,
        instruction.line,
        'Remote URLs in ADD/COPY are blocked in the air-gapped environment.',
      )
    }

    if (instruction.command === 'RUN') {
      if (/(curl|wget)\b/i.test(instruction.value) && /https?:\/\//i.test(instruction.value)) {
        addFinding(
          findings,
          'POL-003',
          'BLOCK',
          instruction.lineNumber,
          instruction.line,
          'External downloads via curl/wget are blocked.',
        )
      }

      if (usesExternalSourceCommand(instruction.value) && !isAllowedMirrorReference(instruction.line, allowedMirrorHints)) {
        addFinding(
          findings,
          'POL-007',
          'BLOCK',
          instruction.lineNumber,
          instruction.line,
          'Package manager source configuration must point to approved internal mirrors only.',
        )
      }
    }

    if (instruction.command === 'USER') {
      stageUsers.set(instruction.stageIndex, instruction.value)
    }

    if (instruction.command === 'EXPOSE') {
      const ports = instruction.value
        .split(/\s+/)
        .map((segment) => segment.match(/^(\d{2,5})(?:\/tcp|\/udp)?$/i))
        .filter(Boolean)
        .map((match) => Number.parseInt(match[1], 10))

      for (const port of ports) {
        exposedPorts.push(port)
        if (!allowedPorts.has(port)) {
          addFinding(
            findings,
            'POL-005',
            'WARN',
            instruction.lineNumber,
            instruction.line,
            `Port ${port} is not in the approved EXPOSE list.`,
          )
        }
      }
    }

    if (instruction.command === 'ENV') {
      const envPairs = instruction.value.split(/\s+/)
      for (const rawPair of envPairs) {
        const [key, maybeValue] = rawPair.includes('=') ? rawPair.split('=', 2) : [rawPair, '']
        if (isSensitiveEnvKey(key) && maybeValue && !isTemplateValue(maybeValue)) {
          addFinding(
            findings,
            'POL-006',
            'BLOCK',
            instruction.lineNumber,
            instruction.line,
            `Sensitive ENV "${key}" appears to be hardcoded.`,
          )
        }
      }
    }
  }

  const stageCount = baseImages.length
  const finalStageIndex = stageCount - 1
  const finalStageUser = stageUsers.get(finalStageIndex) ?? null
  if (!finalStageUser || ['root', '0'].includes(finalStageUser.trim().toLowerCase())) {
    const finalStageInstruction = [...instructions].reverse().find((instruction) => instruction.stageIndex === finalStageIndex)
    addFinding(
      findings,
      'POL-004',
      'WARN',
      finalStageInstruction?.lineNumber ?? null,
      finalStageInstruction?.line ?? null,
      'Final stage should switch to a non-root USER.',
    )
  }

  if (stageCount <= 1 && instructions.length >= 12) {
    const lastInstruction = instructions[instructions.length - 1]
    addFinding(
      findings,
      'POL-008',
      'WARN',
      lastInstruction?.lineNumber ?? null,
      lastInstruction?.line ?? null,
      'Consider a multi-stage build to reduce final image size and attack surface.',
    )
  }

  const blockCount = findings.filter((finding) => finding.severity === 'BLOCK').length
  const warnCount = findings.filter((finding) => finding.severity === 'WARN').length

  return {
    findings,
    blocked: blockCount > 0,
    summary: {
      blockCount,
      warnCount,
      stageCount,
      baseImages,
      exposedPorts,
      finalStageUser,
    },
  }
}

function buildLogEntry(buildId, stream, line, step = null, totalSteps = null) {
  return {
    buildId,
    timestamp: nowIso(),
    stream,
    line,
    step,
    totalSteps,
  }
}

function appendBuildLog(buildId, entry) {
  const logPath = getLogFilePath(buildId)
  fs.mkdirSync(path.dirname(logPath), { recursive: true })
  fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf8')
}

function readBuildLogs(buildId) {
  const logPath = getLogFilePath(buildId)
  if (!pathExists(logPath)) {
    return []
  }

  const lines = fs
    .readFileSync(logPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-MAX_LOG_LINES)

  return lines
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

function formatCommandForLog(command, args = []) {
  const raw = [command, ...args]
    .map((segment) => String(segment))
    .join(' ')
    .replace(/((?:password|secret|token|apikey|api_key)[^=\s]*=)[^\s]+/gi, '$1***')
  return raw.length > 600 ? `${raw.slice(0, 600)}...` : raw
}

function createBuildCommandContext(build, executionConfig) {
  const imageReference = buildImageReference(build.imageName, build.tag)
  const dockerFlags = formatBuildArgsAsFlags(build.buildArgs, 'docker')
  const kanikoFlags = formatBuildArgsAsFlags(build.buildArgs, 'kaniko')

  return {
    build_id: build.id,
    context: getContextRoot(build.id),
    context_root: getContextRoot(build.id),
    upload_root: getUploadRoot(build.id),
    dockerfile: path.join(getContextRoot(build.id), build.dockerfilePath),
    dockerfile_rel: build.dockerfilePath,
    destination: imageReference,
    image: imageReference,
    image_reference: imageReference,
    image_name: build.imageName,
    tag: build.tag,
    registry_mirror: executionConfig.registryMirror,
    internal_registry: executionConfig.internalRegistry,
    platform: build.platform,
    build_args: dockerFlags.string,
    build_args_docker: dockerFlags.string,
    build_args_kaniko: kanikoFlags.string,
    requester: build.requesterName,
  }
}

function resolveShellCommand(template, replacements) {
  if (!Array.isArray(template) || template.length === 0) {
    return null
  }

  const [command, ...args] = template.map((segment) => applyTemplate(segment, replacements))
  if (!command) {
    return null
  }

  return {
    command,
    args,
  }
}

function resolveKanikoContainerCommand(build, executionConfig) {
  const contextRoot = getContextRoot(build.id)
  const dockerfileAbsolutePath = path.join(contextRoot, build.dockerfilePath)
  const imageReference = buildImageReference(build.imageName, build.tag)
  const dockerConfigDir = executionConfig.kanikoDockerConfigDir
  const args = [
    'run',
    '--rm',
    '-v',
    `${contextRoot}:/workspace/context:ro`,
  ]

  if (dockerConfigDir) {
    args.push('-v', `${dockerConfigDir}:/kaniko/.docker:ro`)
  }

  args.push(
    executionConfig.kanikoImage,
    `--context=dir:///workspace/context`,
    `--dockerfile=/workspace/context/${build.dockerfilePath.replace(/\\/g, '/')}`,
    `--destination=${imageReference}`,
  )

  if (executionConfig.registryMirror) {
    args.push(`--registry-mirror=${executionConfig.registryMirror}`)
  }
  if (executionConfig.internalRegistry) {
    args.push(`--insecure-registry=${executionConfig.internalRegistry}`)
  }
  if (executionConfig.kanikoCacheRepo) {
    args.push('--cache=true', `--cache-repo=${executionConfig.kanikoCacheRepo}`)
  }

  const buildArgFlags = formatBuildArgsAsFlags(build.buildArgs, 'kaniko').values
  args.push(...buildArgFlags, ...executionConfig.kanikoAdditionalArgs)

  return {
    command: executionConfig.kanikoRuntimeBin,
    args,
    metadata: {
      imageReference,
      dockerfileAbsolutePath,
    },
  }
}

function getExecutorCommand(build, executionConfig) {
  const replacements = createBuildCommandContext(build, executionConfig)

  if (executionConfig.executorMode === 'shell') {
    const resolved = resolveShellCommand(executionConfig.shellBuildCommand, replacements)
    if (!resolved) {
      throw new Error('AIRGAP_BUILD_EXECUTOR_COMMAND must be configured when AIRGAP_BUILD_EXECUTOR_MODE=shell.')
    }
    return resolved
  }

  if (executionConfig.executorMode === 'kaniko-container') {
    return resolveKanikoContainerCommand(build, executionConfig)
  }

  return null
}

function getPushCommand(build, executionConfig) {
  if (executionConfig.executorMode !== 'shell') {
    return null
  }

  return resolveShellCommand(executionConfig.shellPushCommand, createBuildCommandContext(build, executionConfig))
}

function getInspectCommand(build, executionConfig) {
  if (!Array.isArray(executionConfig.shellInspectCommand) || executionConfig.shellInspectCommand.length === 0) {
    return null
  }

  return resolveShellCommand(executionConfig.shellInspectCommand, createBuildCommandContext(build, executionConfig))
}

function getScanCommand(build, executionConfig) {
  if (executionConfig.scanMode !== 'shell') {
    return null
  }

  const resolved = resolveShellCommand(executionConfig.shellScanCommand, createBuildCommandContext(build, executionConfig))
  if (!resolved) {
    throw new Error('AIRGAP_SCAN_COMMAND must be configured when AIRGAP_SCAN_MODE=shell.')
  }

  return resolved
}

function trimCapturedOutput(output) {
  const text = String(output ?? '')
  return text.length > MAX_CAPTURED_OUTPUT_CHARS ? text.slice(text.length - MAX_CAPTURED_OUTPUT_CHARS) : text
}

function parseDigestFromOutput(output) {
  const match = String(output ?? '').match(/sha256:[a-f0-9]{64}/i)
  return match ? match[0] : null
}

function parseScanSummaryFromOutput(output) {
  const text = String(output ?? '')
  const readSeverity = (severity) => {
    const direct = text.match(new RegExp(`${severity}\\s*[:=]\\s*(\\d+)`, 'i'))
    if (direct) {
      return Number.parseInt(direct[1], 10)
    }
    const summary = text.match(new RegExp(`\\(${severity}\\s*:\\s*(\\d+)`, 'i'))
    if (summary) {
      return Number.parseInt(summary[1], 10)
    }
    return 0
  }

  return {
    criticalCount: readSeverity('CRITICAL'),
    highCount: readSeverity('HIGH'),
    mediumCount: readSeverity('MEDIUM'),
    lowCount: readSeverity('LOW'),
  }
}

function parseInspectMetadataFromOutput(output) {
  const text = String(output ?? '').trim()
  if (!text) {
    return {}
  }

  try {
    const parsed = JSON.parse(text)
    const value = Array.isArray(parsed) ? parsed[0] : parsed
    if (value && typeof value === 'object') {
      return {
        imageSize: Number.isFinite(Number(value.Size)) ? Number(value.Size) : null,
        imageDigest:
          Array.isArray(value.RepoDigests) && typeof value.RepoDigests[0] === 'string'
            ? String(value.RepoDigests[0]).split('@')[1] ?? null
            : null,
      }
    }
  } catch {
    // Ignore invalid inspect payloads.
  }

  return {
    imageDigest: parseDigestFromOutput(text),
    imageSize: null,
  }
}

async function runLoggedCommand({
  buildId,
  command,
  args = [],
  cwd,
  env = {},
  timeoutMs,
  workerState,
  logPrefix,
}) {
  appendBuildLog(buildId, buildLogEntry(buildId, 'stdout', `${logPrefix}: ${formatCommandForLog(command, args)}`))

  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    const stdoutChunks = []
    const stderrChunks = []
    let stdoutBuffer = ''
    let stderrBuffer = ''
    let timedOut = false

    workerState.activeProcess = child

    const flushBuffer = (streamName, force = false) => {
      const buffer = streamName === 'stdout' ? stdoutBuffer : stderrBuffer
      const lines = buffer.split(/\r?\n/)
      const remainder = force ? '' : lines.pop() ?? ''

      for (const line of lines) {
        if (!line.trim()) {
          continue
        }
        appendBuildLog(buildId, buildLogEntry(buildId, streamName, line))
      }

      if (streamName === 'stdout') {
        stdoutBuffer = force ? '' : remainder
      } else {
        stderrBuffer = force ? '' : remainder
      }
    }

    const timeoutHandle = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {
          // ignore
        }
      }, 2000).unref?.()
    }, timeoutMs)

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      stdoutChunks.push(text)
      stdoutBuffer += text
      flushBuffer('stdout')
    })

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      stderrChunks.push(text)
      stderrBuffer += text
      flushBuffer('stderr')
    })

    child.on('error', (error) => {
      clearTimeout(timeoutHandle)
      workerState.activeProcess = null
      reject(error)
    })

    child.on('close', (exitCode, signal) => {
      clearTimeout(timeoutHandle)
      flushBuffer('stdout', true)
      flushBuffer('stderr', true)
      workerState.activeProcess = null
      resolve({
        exitCode: typeof exitCode === 'number' ? exitCode : null,
        signal: signal ?? null,
        timedOut,
        output: trimCapturedOutput(`${stdoutChunks.join('')}\n${stderrChunks.join('')}`),
      })
    })
  })
}

function createAuditEvent(state, eventType, actor, targetType, targetId, detail) {
  const previousHash = state.auditLogs[state.auditLogs.length - 1]?.logHash ?? ''
  const createdAt = nowIso()
  const payloadForHash = JSON.stringify({
    previousHash,
    eventType,
    actorName: actor.name,
    actorRole: actor.role,
    targetType,
    targetId,
    createdAt,
    detail,
  })

  const logEntry = {
    id: state.nextAuditId,
    eventType,
    actorName: actor.name,
    actorRole: actor.role,
    targetType,
    targetId,
    detail,
    createdAt,
    logHash: sha256(payloadForHash),
  }

  state.nextAuditId += 1
  state.auditLogs.push(logEntry)
  return logEntry
}

function createBuildId(state) {
  const sequence = String(state.nextBuildNumber).padStart(6, '0')
  state.nextBuildNumber += 1
  return `build-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${sequence}`
}

function isDuplicateBuild(state, input) {
  return state.builds.find(
    (build) =>
      build.projectId === input.projectId &&
      build.imageName === input.imageName &&
      build.tag === input.tag &&
      build.dockerfileHash === input.dockerfileHash &&
      JSON.stringify(build.buildArgs ?? {}) === JSON.stringify(input.buildArgs ?? {}),
  )
}

function serializeBuild(build) {
  if (!build) {
    return null
  }

  const { uploadRoot, dockerfileAbsolutePath, dockerfileContentsSnapshot, ...rest } = build
  return rest
}

function recordScanResult(state, buildId, { scanner, counts, passed, report }) {
  const scanResult = {
    id: `scan-${String(state.nextScanResultId).padStart(6, '0')}`,
    buildId,
    scanner,
    criticalCount: counts.criticalCount ?? 0,
    highCount: counts.highCount ?? 0,
    mediumCount: counts.mediumCount ?? 0,
    lowCount: counts.lowCount ?? 0,
    report,
    scannedAt: nowIso(),
    passed,
  }

  state.nextScanResultId += 1
  state.scanResults.push(scanResult)
  return scanResult
}

function createScanResult(state, build, policyReport) {
  const dockerfileText = String(build.dockerfileContentsSnapshot ?? '')
  let criticalCount = 0
  let highCount = 0
  let mediumCount = 0

  if (/:latest(?:\s|$)/i.test(dockerfileText)) {
    highCount += 1
  }
  if (!policyReport.summary?.finalStageUser || String(policyReport.summary.finalStageUser).toLowerCase() === 'root') {
    highCount += 1
  }
  if (/apt-get\s+upgrade|apk\s+upgrade|yum\s+update/i.test(dockerfileText)) {
    mediumCount += 1
  }
  if (/curl\s+[^|]+\|\s*(sh|bash)/i.test(dockerfileText)) {
    criticalCount += 1
  }

  const passed = criticalCount === 0 && highCount === 0
  return recordScanResult(state, build.id, {
    scanner: 'trivy-offline-mock',
    counts: {
      criticalCount,
      highCount,
      mediumCount,
      lowCount: 0,
    },
    passed,
    report: {
      summary: {
        criticalCount,
        highCount,
        mediumCount,
        lowCount: 0,
      },
      heuristics: [
        criticalCount > 0 ? 'Found unsafe shell pipeline pattern.' : null,
        highCount > 0 ? 'Found high-risk image hygiene issues.' : null,
      ].filter(Boolean),
    },
  })
}

function markBuildStatus(state, buildId, status, patch = {}) {
  const build = state.builds.find((entry) => entry.id === buildId)
  if (!build) {
    return null
  }

  build.status = status
  build.updatedAt = nowIso()

  if (status === 'VALIDATING' && !build.startedAt) {
    build.startedAt = build.updatedAt
  }
  if (TERMINAL_BUILD_STATUSES.has(status)) {
    build.completedAt = build.updatedAt
    if (build.startedAt) {
      const durationSec = Math.max(0, Math.round((Date.parse(build.completedAt) - Date.parse(build.startedAt)) / 1000))
      build.durationSec = durationSec
    }
  }

  Object.assign(build, patch)
  return build
}

function shouldCancelBuild(state, buildId) {
  const build = state.builds.find((entry) => entry.id === buildId)
  return Boolean(build?.cancelRequested)
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildRequestId(res) {
  return res.getHeader?.('x-request-id') ?? undefined
}

function extractFailureMessage(output, fallbackMessage) {
  const lines = String(output ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  return lines.slice(-6).join(' | ') || fallbackMessage
}

async function finalizeMockOrShellScan(stateApi, buildId, actor, build, executionConfig) {
  if (executionConfig.scanMode !== 'shell') {
    let scanResult = null
    stateApi.update((state) => {
      const currentBuild = state.builds.find((entry) => entry.id === buildId)
      if (!currentBuild) {
        return
      }
      scanResult = createScanResult(state, currentBuild, currentBuild.policyReport)
      currentBuild.scanResultId = scanResult.id
    })
    return scanResult
  }

  const scanCommand = getScanCommand(build, executionConfig)
  if (!scanCommand) {
    throw new Error('AIRGAP_SCAN_COMMAND must be configured when AIRGAP_SCAN_MODE=shell.')
  }

  const workerState = executionConfig.workerState
  const scanResult = await runLoggedCommand({
    buildId,
    command: scanCommand.command,
    args: scanCommand.args,
    cwd: getContextRoot(build.id),
    timeoutMs: executionConfig.scanTimeoutMs,
    workerState,
    logPrefix: 'scan',
  })

  if (shouldCancelBuild(loadState(), buildId)) {
    stateApi.cancel(buildId, actor, 'Build cancelled during vulnerability scan.')
    return null
  }
  if (scanResult.timedOut) {
    throw new Error(`Offline scan timed out after ${executionConfig.scanTimeoutMs}ms.`)
  }

  let recordedScan = null
  stateApi.update((state) => {
    const currentBuild = state.builds.find((entry) => entry.id === buildId)
    if (!currentBuild) {
      return
    }

    const counts = parseScanSummaryFromOutput(scanResult.output)
    recordedScan = recordScanResult(state, buildId, {
      scanner: 'trivy-shell',
      counts,
      passed: scanResult.exitCode === 0,
      report: {
        summary: counts,
        heuristics: String(scanResult.output ?? '')
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(-12),
      },
    })
    currentBuild.scanResultId = recordedScan.id
  })

  if (scanResult.exitCode !== 0) {
    stateApi.update((state) => {
      markBuildStatus(state, buildId, 'PUSH_BLOCKED', {
        errorMessage: extractFailureMessage(scanResult.output, 'The image was blocked by the configured scanner.'),
      })
      createAuditEvent(state, 'SCAN_BLOCKED', actor, 'build', buildId, {
        scanResultId: recordedScan?.id ?? null,
        criticalCount: recordedScan?.criticalCount ?? 0,
        highCount: recordedScan?.highCount ?? 0,
      })
    })
    return null
  }

  return recordedScan
}

async function runConfiguredBuildPipeline(stateApi, buildId, build, actor, executionConfig) {
  const workerState = executionConfig.workerState
  const buildReference = buildImageReference(build.imageName, build.tag)

  stateApi.update((state) => {
    markBuildStatus(state, buildId, 'VALIDATING')
  })
  appendBuildLog(buildId, buildLogEntry(buildId, 'stdout', `Policy validation passed for ${buildReference}.`, 1, 4))
  await wait(Math.min(BUILD_STEP_DELAY_MS, 200))

  if (shouldCancelBuild(loadState(), buildId)) {
    stateApi.cancel(buildId, actor, 'Build cancelled during validation.')
    return
  }

  stateApi.update((state) => {
    markBuildStatus(state, buildId, 'BUILDING')
  })

  const executorCommand = getExecutorCommand(build, executionConfig)
  if (!executorCommand) {
    throw new Error(`Unsupported executor mode "${executionConfig.executorMode}".`)
  }

  const buildResult = await runLoggedCommand({
    buildId,
    command: executorCommand.command,
    args: executorCommand.args,
    cwd: getContextRoot(build.id),
    timeoutMs: executionConfig.buildTimeoutMs,
    workerState,
    logPrefix: 'build',
  })

  if (shouldCancelBuild(loadState(), buildId)) {
    stateApi.cancel(buildId, actor, 'Build cancelled during execution.')
    return
  }

  if (buildResult.timedOut) {
    throw new Error(`Build timed out after ${executionConfig.buildTimeoutMs}ms.`)
  }
  if (buildResult.exitCode !== 0) {
    stateApi.update((state) => {
      markBuildStatus(state, buildId, 'FAILED', {
        errorMessage: extractFailureMessage(buildResult.output, 'Configured build command failed.'),
      })
      createAuditEvent(state, 'BUILD_FAILED', actor, 'build', buildId, {
        reason: 'Configured build executor returned a non-zero exit code.',
      })
    })
    return
  }

  let imageDigest = parseDigestFromOutput(buildResult.output)
  let imageSize = null
  const inspectCommand = getInspectCommand(build, executionConfig)
  if (inspectCommand) {
    const inspectResult = await runLoggedCommand({
      buildId,
      command: inspectCommand.command,
      args: inspectCommand.args,
      cwd: getContextRoot(build.id),
      timeoutMs: Math.min(executionConfig.scanTimeoutMs, executionConfig.buildTimeoutMs),
      workerState,
      logPrefix: 'inspect',
    })

    if (inspectResult.exitCode === 0) {
      const metadata = parseInspectMetadataFromOutput(inspectResult.output)
      imageDigest = metadata.imageDigest || imageDigest
      imageSize = metadata.imageSize ?? imageSize
    }
  }

  stateApi.update((state) => {
    markBuildStatus(state, buildId, 'SCANNING')
  })

  const scanResult = await finalizeMockOrShellScan(stateApi, buildId, actor, build, executionConfig)
  if (!scanResult) {
    return
  }

  if (shouldCancelBuild(loadState(), buildId)) {
    stateApi.cancel(buildId, actor, 'Build cancelled after scanning.')
    return
  }

  stateApi.update((state) => {
    markBuildStatus(state, buildId, 'PUSHING')
  })

  const pushCommand = getPushCommand(build, executionConfig)
  if (pushCommand) {
    const pushResult = await runLoggedCommand({
      buildId,
      command: pushCommand.command,
      args: pushCommand.args,
      cwd: getContextRoot(build.id),
      timeoutMs: executionConfig.buildTimeoutMs,
      workerState,
      logPrefix: 'push',
    })

    if (shouldCancelBuild(loadState(), buildId)) {
      stateApi.cancel(buildId, actor, 'Build cancelled during push.')
      return
    }
    if (pushResult.timedOut) {
      throw new Error(`Push timed out after ${executionConfig.buildTimeoutMs}ms.`)
    }
    if (pushResult.exitCode !== 0) {
      stateApi.update((state) => {
        markBuildStatus(state, buildId, 'FAILED', {
          errorMessage: extractFailureMessage(pushResult.output, 'Configured push command failed.'),
        })
        createAuditEvent(state, 'BUILD_FAILED', actor, 'build', buildId, {
          reason: 'Configured push command returned a non-zero exit code.',
        })
      })
      return
    }

    imageDigest = parseDigestFromOutput(pushResult.output) || imageDigest
  } else {
    appendBuildLog(
      buildId,
      buildLogEntry(buildId, 'stdout', 'No separate push command configured. The executor is expected to push directly.'),
    )
  }

  stateApi.update((state) => {
    const currentBuild = markBuildStatus(state, buildId, 'COMPLETED', {
      imageDigest: imageDigest || `sha256:${sha256(`${build.dockerfileHash}:${buildReference}:${build.createdAt}`)}`,
      imageSize: imageSize ?? Math.max(build.contextSize || 0, String(build.dockerfileContentsSnapshot || '').length),
      errorMessage: null,
    })
    if (currentBuild) {
      createAuditEvent(state, 'BUILD_COMPLETED', actor, 'build', buildId, {
        imageName: currentBuild.imageName,
        tag: currentBuild.tag,
        imageDigest: currentBuild.imageDigest,
        executorMode: executionConfig.executorMode,
      })
    }
  })
}

async function runBuildPipeline(stateApi, buildId, executionConfig) {
  const build = stateApi.getBuild(buildId)
  if (!build) {
    return
  }

  if (executionConfig.executorMode !== 'mock') {
    const actor = {
      name: build.requesterName,
      role: build.requesterRole,
    }
    await runConfiguredBuildPipeline(stateApi, buildId, build, actor, executionConfig)
    return
  }

  const buildReference = buildImageReference(build.imageName, build.tag)
  const totalSteps = 4
  const actor = {
    name: build.requesterName,
    role: build.requesterRole,
  }

  const log = (line, step) => appendBuildLog(buildId, buildLogEntry(buildId, 'stdout', line, step, totalSteps))

  stateApi.update((state) => {
    markBuildStatus(state, buildId, 'VALIDATING')
  })
  log(`Policy validation passed for ${buildReference}.`, 1)

  await wait(BUILD_STEP_DELAY_MS)
  if (shouldCancelBuild(loadState(), buildId)) {
    stateApi.cancel(buildId, actor, 'Build cancelled during validation.')
    return
  }

  stateApi.update((state) => {
    markBuildStatus(state, buildId, 'BUILDING')
  })
  log(`Starting isolated build workspace for ${buildReference}.`, 2)
  await wait(BUILD_STEP_DELAY_MS)

  const dockerfileText = build.dockerfileContentsSnapshot || ''
  if (/^\s*RUN\s+(exit\s+1|false)\s*$/im.test(dockerfileText) || /#\s*harbor:\s*fail/i.test(dockerfileText)) {
    stateApi.update((state) => {
      markBuildStatus(state, buildId, 'FAILED', {
        errorMessage: 'The Dockerfile contains a simulated failing build step.',
      })
      createAuditEvent(state, 'BUILD_FAILED', actor, 'build', buildId, {
        reason: 'Simulated failure marker detected in Dockerfile.',
      })
    })
    appendBuildLog(buildId, buildLogEntry(buildId, 'stderr', 'Build failed during the Dockerfile execution stage.', 2, totalSteps))
    return
  }

  if (shouldCancelBuild(loadState(), buildId)) {
    stateApi.cancel(buildId, actor, 'Build cancelled during execution.')
    return
  }

  stateApi.update((state) => {
    markBuildStatus(state, buildId, 'SCANNING')
  })
  log('Running offline vulnerability scan.', 3)
  await wait(BUILD_STEP_DELAY_MS)

  let scanResult = null
  stateApi.update((state) => {
    const currentBuild = state.builds.find((entry) => entry.id === buildId)
    if (!currentBuild) {
      return
    }
    scanResult = createScanResult(state, currentBuild, currentBuild.policyReport)
    currentBuild.scanResultId = scanResult.id
  })

  if (!scanResult?.passed) {
    stateApi.update((state) => {
      markBuildStatus(state, buildId, 'PUSH_BLOCKED', {
        errorMessage: 'The image was blocked by the offline vulnerability policy.',
      })
      createAuditEvent(state, 'SCAN_BLOCKED', actor, 'build', buildId, {
        scanResultId: scanResult?.id ?? null,
        criticalCount: scanResult?.criticalCount ?? 0,
        highCount: scanResult?.highCount ?? 0,
      })
    })
    appendBuildLog(
      buildId,
      buildLogEntry(
        buildId,
        'stderr',
        `Scan policy blocked the push. critical=${scanResult.criticalCount}, high=${scanResult.highCount}.`,
        3,
        totalSteps,
      ),
    )
    return
  }

  if (shouldCancelBuild(loadState(), buildId)) {
    stateApi.cancel(buildId, actor, 'Build cancelled after scanning.')
    return
  }

  stateApi.update((state) => {
    markBuildStatus(state, buildId, 'PUSHING')
  })
  log(`Pushing ${buildReference} to the internal registry mirror.`, 4)
  await wait(BUILD_STEP_DELAY_MS)

  stateApi.update((state) => {
    const currentBuild = markBuildStatus(state, buildId, 'COMPLETED', {
      imageDigest: `sha256:${sha256(`${build.dockerfileHash}:${buildReference}:${build.createdAt}`)}`,
      imageSize: Math.max(build.contextSize || 0, String(build.dockerfileContentsSnapshot || '').length) + 4096,
      errorMessage: null,
    })
    if (currentBuild) {
      createAuditEvent(state, 'BUILD_COMPLETED', actor, 'build', buildId, {
        imageName: currentBuild.imageName,
        tag: currentBuild.tag,
        imageDigest: currentBuild.imageDigest,
      })
    }
  })
  log(`Build completed and image ${buildReference} is available.`, 4)
}

function createStateApi() {
  return {
    getBuild(buildId) {
      return loadState().builds.find((entry) => entry.id === buildId) ?? null
    },
    update(mutator) {
      return withState(mutator)
    },
    cancel(buildId, actor, reason) {
      withState((state) => {
        const build = markBuildStatus(state, buildId, 'CANCELLED', {
          errorMessage: reason,
          cancelRequested: false,
        })
        if (build) {
          createAuditEvent(state, 'BUILD_CANCELLED', actor, 'build', buildId, {
            reason,
          })
        }
      })
      appendBuildLog(buildId, buildLogEntry(buildId, 'stderr', reason))
    },
  }
}

function recoverInterruptedBuilds() {
  withState((state) => {
    for (const build of state.builds) {
      if (['VALIDATING', 'BUILDING', 'SCANNING', 'PUSHING'].includes(build.status)) {
        build.status = 'FAILED'
        build.errorMessage = 'The server restarted while the build was in progress.'
        build.completedAt = nowIso()
        build.updatedAt = build.completedAt
      }
    }
  })
}

function buildAllowedBaseImageList(state) {
  return state.baseImages.filter((entry) => entry.active !== false).map((entry) => entry.imageRef)
}

function cloneBuildInput(state, build, actor) {
  const nextBuildId = createBuildId(state)
  const sourceUploadRoot = getUploadRoot(build.id)
  const targetUploadRoot = getUploadRoot(nextBuildId)
  if (!pathExists(sourceUploadRoot)) {
    throw new Error('The original build context is no longer available for retry.')
  }

  fs.rmSync(targetUploadRoot, { recursive: true, force: true })
  fs.cpSync(sourceUploadRoot, targetUploadRoot, { recursive: true, force: true })

  const dockerfileAbsolutePath = path.join(getContextRoot(nextBuildId), build.dockerfilePath)
  if (!pathExists(dockerfileAbsolutePath)) {
    throw new Error('The original Dockerfile could not be found for retry.')
  }

  const dockerfileContentsSnapshot = fs.readFileSync(dockerfileAbsolutePath, 'utf8')
  const policyReport = analyzeDockerfile(dockerfileContentsSnapshot, {
    allowedBaseImages: buildAllowedBaseImageList(state),
  })
  const initialStatus = policyReport.blocked ? 'REJECTED' : 'QUEUED'

  const clonedBuild = {
    ...build,
    id: nextBuildId,
    status: initialStatus,
    errorMessage: policyReport.blocked ? 'Build rejected by Dockerfile policy.' : null,
    imageDigest: null,
    imageSize: null,
    durationSec: null,
    scanResultId: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    startedAt: null,
    completedAt: policyReport.blocked ? nowIso() : null,
    cancelRequested: false,
    duplicateOfBuildId: build.duplicateOfBuildId ?? build.id,
    requesterName: actor.name,
    requesterRole: actor.role,
    uploadRoot: targetUploadRoot,
    dockerfileAbsolutePath,
    dockerfileContentsSnapshot,
    dockerfileHash: sha256(dockerfileContentsSnapshot),
    policyReport,
  }

  state.builds.push(clonedBuild)
  createAuditEvent(state, 'BUILD_RETRIED', actor, 'build', clonedBuild.id, {
    previousBuildId: build.id,
  })
  if (policyReport.blocked) {
    createAuditEvent(state, 'POLICY_VIOLATION', actor, 'build', clonedBuild.id, {
      findings: policyReport.findings.filter((finding) => finding.severity === 'BLOCK'),
    })
  }
  return clonedBuild
}

function appendPolicyLogs(build) {
  appendBuildLog(build.id, buildLogEntry(build.id, 'stdout', `Build created for ${buildImageReference(build.imageName, build.tag)}.`))
  appendBuildLog(
    build.id,
    buildLogEntry(
      build.id,
      'stdout',
      `Policy summary: ${build.policyReport.summary.blockCount} block findings, ${build.policyReport.summary.warnCount} warnings.`,
    ),
  )

  for (const finding of build.policyReport.findings) {
    appendBuildLog(
      build.id,
      buildLogEntry(
        build.id,
        finding.severity === 'BLOCK' ? 'stderr' : 'stdout',
        `${finding.ruleId} ${finding.severity}: ${finding.message}${finding.lineNumber ? ` (line ${finding.lineNumber})` : ''}`,
      ),
    )
  }
}

export function attachAirgapBuildRoutes(target, options = {}) {
  const routePrefix = String(options.routePrefix || '/api/v1').replace(/\/+$/, '')
  const stateApi = createStateApi()
  const executionConfig = getAirgapExecutionConfig()
  const workerState = {
    activeProcess: null,
    activeBuildId: null,
  }
  executionConfig.workerState = workerState
  recoverInterruptedBuilds()

  let workerBusy = false
  let stopped = false

  async function pumpQueue() {
    if (workerBusy || stopped) {
      return
    }

    const nextBuild = loadState().builds.find((build) => build.status === 'QUEUED')
    if (!nextBuild) {
      return
    }

    workerBusy = true
    workerState.activeBuildId = nextBuild.id
    try {
      await runBuildPipeline(stateApi, nextBuild.id, executionConfig)
    } catch (error) {
      withState((state) => {
        const build = markBuildStatus(state, nextBuild.id, 'FAILED', {
          errorMessage: error instanceof Error ? error.message : 'Unexpected build worker failure.',
        })
        if (build) {
          createAuditEvent(
            state,
            'BUILD_FAILED',
            { name: build.requesterName, role: build.requesterRole },
            'build',
            nextBuild.id,
            { reason: build.errorMessage },
          )
        }
      })
      appendBuildLog(
        nextBuild.id,
        buildLogEntry(
          nextBuild.id,
          'stderr',
          error instanceof Error ? error.message : 'Unexpected build worker failure.',
        ),
      )
    } finally {
      workerBusy = false
      workerState.activeBuildId = null
      workerState.activeProcess = null
    }
  }

  const timer = setInterval(() => {
    void pumpQueue()
  }, WORKER_POLL_INTERVAL_MS)

  function sendValidationError(res, error) {
    res.status(400).json({
      error: error.message.replace(/^validation:/, ''),
      requestId: buildRequestId(res),
    })
  }

  target.get(`${routePrefix}/policies`, (_req, res) => {
    res.json({
      rules: DEFAULT_POLICY_RULES,
    })
  })

  target.get(`${routePrefix}/policies/base-images`, (_req, res) => {
    const baseImages = loadState().baseImages.filter((entry) => entry.active !== false)
    res.json({ baseImages })
  })

  target.post(`${routePrefix}/policies/base-images`, (req, res) => {
    const actor = requireAdminActor(req, res)
    if (!actor) {
      return
    }

    const imageRef = trimText(req.body?.imageRef, 255)
    const description = trimText(req.body?.description, 255)
    if (!imageRef) {
      res.status(400).json({ error: 'imageRef is required.', requestId: buildRequestId(res) })
      return
    }

    const baseImage = withState((state) => {
      const existing = state.baseImages.find((entry) => entry.imageRef === imageRef)
      if (existing) {
        existing.active = true
        existing.description = description || existing.description
        return existing
      }

      const created = {
        id: state.nextBaseImageId,
        imageRef,
        description,
        active: true,
        addedBy: actor.name,
        addedAt: nowIso(),
      }
      state.nextBaseImageId += 1
      state.baseImages.push(created)
      createAuditEvent(state, 'BASE_IMAGE_ADDED', actor, 'policy-base-image', String(created.id), {
        imageRef,
      })
      return created
    })

    res.status(201).json({ baseImage })
  })

  target.get(`${routePrefix}/builds`, (req, res) => {
    const projectId = Number.parseInt(String(req.query.projectId ?? ''), 10)
    const statusFilter = trimText(req.query.status, 40).toUpperCase()
    const requesterFilter = trimText(req.query.requester, 120).toLowerCase()
    const limitRaw = Number.parseInt(String(req.query.limit ?? '50'), 10)
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50

    let builds = loadState().builds
      .slice()
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))

    if (Number.isFinite(projectId) && projectId > 0) {
      builds = builds.filter((build) => build.projectId === projectId)
    }
    if (statusFilter) {
      builds = builds.filter((build) => String(build.status).toUpperCase() === statusFilter)
    }
    if (requesterFilter) {
      builds = builds.filter((build) => String(build.requesterName).toLowerCase().includes(requesterFilter))
    }

    res.json({
      builds: builds.slice(0, limit).map(serializeBuild),
    })
  })

  target.get(`${routePrefix}/builds/:buildId`, (req, res) => {
    const buildId = sanitizeBuildId(req.params.buildId)
    const state = loadState()
    const build = state.builds.find((entry) => entry.id === buildId)
    if (!build) {
      res.status(404).json({ error: 'Build not found.', requestId: buildRequestId(res) })
      return
    }

    res.json({
      build: serializeBuild(build),
      scanResult: state.scanResults.find((entry) => entry.buildId === buildId) ?? null,
    })
  })

  target.get(`${routePrefix}/builds/:buildId/logs`, (req, res) => {
    const buildId = sanitizeBuildId(req.params.buildId)
    const build = loadState().builds.find((entry) => entry.id === buildId)
    if (!build) {
      res.status(404).json({ error: 'Build not found.', requestId: buildRequestId(res) })
      return
    }

    res.json({
      build: serializeBuild(build),
      logs: readBuildLogs(buildId),
    })
  })

  target.post(`${routePrefix}/builds`, async (req, res) => {
    const actor = requireActor(req, res)
    if (!actor) {
      return
    }

    try {
      const rawMetadata =
        typeof req.body?.metadata === 'string' && req.body.metadata.trim()
          ? JSON.parse(req.body.metadata)
          : req.body?.metadata ?? req.body ?? {}
      const metadata = normalizeMetadata(rawMetadata, req)
      const provisionalBuildId = withState((state) => createBuildId(state))
      const contextPayload = await materializeBuildContext(provisionalBuildId, req)
      const state = loadState()
      const allowedBaseImages = buildAllowedBaseImageList(state)
      const policyReport = analyzeDockerfile(contextPayload.dockerfileContents, {
        allowedBaseImages,
      })
      const dockerfileHash = sha256(contextPayload.dockerfileContents)
      const duplicateOfBuild = isDuplicateBuild(state, {
        projectId: metadata.projectId,
        imageName: metadata.imageName,
        tag: metadata.tag,
        dockerfileHash,
        buildArgs: metadata.buildArgs,
      })

      const build = withState((currentState) => {
        const created = {
          id: provisionalBuildId,
          projectId: metadata.projectId,
          requesterName: actor.name,
          requesterRole: actor.role,
          status: policyReport.blocked ? 'REJECTED' : 'QUEUED',
          imageName: metadata.imageName,
          tag: metadata.tag,
          buildArgs: metadata.buildArgs,
          platform: metadata.platform,
          description: metadata.description,
          dockerfileHash,
          contextSize: contextPayload.contextSize,
          imageDigest: null,
          imageSize: null,
          durationSec: null,
          errorMessage: policyReport.blocked ? 'Build rejected by Dockerfile policy.' : null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          startedAt: null,
          completedAt: policyReport.blocked ? nowIso() : null,
          uploadRoot: contextPayload.uploadRoot,
          dockerfileAbsolutePath: contextPayload.dockerfileAbsolutePath,
          dockerfilePath: contextPayload.dockerfileRelativePath,
          files: contextPayload.files,
          policyReport,
          scanResultId: null,
          duplicateOfBuildId: duplicateOfBuild?.id ?? null,
          cancelRequested: false,
          dockerfileContentsSnapshot: contextPayload.dockerfileContents,
        }
        currentState.builds.push(created)
        createAuditEvent(currentState, 'BUILD_REQUESTED', actor, 'build', created.id, {
          projectId: created.projectId,
          imageName: created.imageName,
          tag: created.tag,
          duplicateOfBuildId: created.duplicateOfBuildId,
        })
        if (policyReport.blocked) {
          createAuditEvent(currentState, 'POLICY_VIOLATION', actor, 'build', created.id, {
            findings: policyReport.findings.filter((finding) => finding.severity === 'BLOCK'),
          })
        }
        return created
      })

      appendPolicyLogs(build)
      if (!policyReport.blocked) {
        void pumpQueue()
      }

      res.status(202).json({
        build: serializeBuild(build),
        scanResult: null,
        duplicateOfBuildId: build.duplicateOfBuildId,
      })
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('validation:')) {
        sendValidationError(res, error)
        return
      }

      console.error('[airgap-builds] Failed to create build:', error)
      res.status(500).json({
        error: 'Failed to create air-gapped build request.',
        requestId: buildRequestId(res),
      })
    }
  })

  target.post(`${routePrefix}/builds/:buildId/cancel`, (req, res) => {
    const actor = requireActor(req, res)
    if (!actor) {
      return
    }

    const buildId = sanitizeBuildId(req.params.buildId)
    const result = withState((state) => {
      const build = state.builds.find((entry) => entry.id === buildId)
      if (!build) {
        return null
      }

      if (TERMINAL_BUILD_STATUSES.has(build.status)) {
        return build
      }

      if (build.status === 'QUEUED') {
        markBuildStatus(state, buildId, 'CANCELLED', {
          cancelRequested: false,
          errorMessage: 'Build cancelled before execution.',
        })
        createAuditEvent(state, 'BUILD_CANCELLED', actor, 'build', buildId, {
          reason: 'Cancelled from queued state.',
        })
      } else {
        build.cancelRequested = true
        build.updatedAt = nowIso()
      }
      return build
    })

    if (!result) {
      res.status(404).json({ error: 'Build not found.', requestId: buildRequestId(res) })
      return
    }

    appendBuildLog(
      buildId,
      buildLogEntry(
        buildId,
        'stderr',
        result.status === 'CANCELLED' ? 'Build cancelled from the queue.' : 'Cancellation has been requested.',
      ),
    )

    if (buildId === workerState.activeBuildId && workerState.activeProcess) {
      try {
        workerState.activeProcess.kill('SIGTERM')
      } catch {
        // Ignore process termination errors.
      }
    }

    res.json({ build: serializeBuild(loadState().builds.find((entry) => entry.id === buildId)) })
  })

  target.post(`${routePrefix}/builds/:buildId/retry`, (req, res) => {
    const actor = requireActor(req, res)
    if (!actor) {
      return
    }

    try {
      const retriedBuild = withState((state) => {
        const build = state.builds.find((entry) => entry.id === sanitizeBuildId(req.params.buildId))
        if (!build) {
          throw new Error('not-found')
        }
        if (!TERMINAL_BUILD_STATUSES.has(build.status)) {
          throw new Error('validation:Only completed, rejected, blocked, failed, or cancelled builds can be retried.')
        }
        return cloneBuildInput(state, build, actor)
      })

      appendPolicyLogs(retriedBuild)
      if (retriedBuild.status !== 'REJECTED') {
        void pumpQueue()
      }
      res.status(202).json({ build: serializeBuild(retriedBuild) })
    } catch (error) {
      if (error instanceof Error && error.message === 'not-found') {
        res.status(404).json({ error: 'Build not found.', requestId: buildRequestId(res) })
        return
      }
      if (error instanceof Error && error.message.startsWith('validation:')) {
        sendValidationError(res, error)
        return
      }

      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to retry build.',
        requestId: buildRequestId(res),
      })
    }
  })

  target.get(`${routePrefix}/audit/logs`, (req, res) => {
    const eventType = trimText(req.query.eventType, 60).toUpperCase()
    const actorName = trimText(req.query.actorName, 120).toLowerCase()
    const limitRaw = Number.parseInt(String(req.query.limit ?? '100'), 10)
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100

    let auditLogs = loadState().auditLogs
      .slice()
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))

    if (eventType) {
      auditLogs = auditLogs.filter((entry) => String(entry.eventType).toUpperCase() === eventType)
    }
    if (actorName) {
      auditLogs = auditLogs.filter((entry) => String(entry.actorName).toLowerCase().includes(actorName))
    }

    res.json({
      logs: auditLogs.slice(0, limit),
    })
  })

  target.get(`${routePrefix}/system/workers`, (_req, res) => {
    const state = loadState()
    res.json({
      workers: [
        {
          id: 'airgap-worker-1',
          status: workerBusy ? 'busy' : 'idle',
          queueLength: state.builds.filter((entry) => entry.status === 'QUEUED').length,
          activeBuildId:
            state.builds.find((entry) => ['VALIDATING', 'BUILDING', 'SCANNING', 'PUSHING'].includes(entry.status))?.id ??
            null,
          executorMode: executionConfig.executorMode,
          scanMode: executionConfig.scanMode,
        },
      ],
    })
  })

  target.get(`${routePrefix}/system/stats`, (_req, res) => {
    const state = loadState()
    const builds = state.builds
    const completed = builds.filter((build) => build.status === 'COMPLETED').length
    const failed = builds.filter((build) => ['FAILED', 'REJECTED', 'PUSH_BLOCKED', 'CANCELLED'].includes(build.status)).length

    res.json({
      stats: {
        totalBuilds: builds.length,
        queuedBuilds: builds.filter((build) => build.status === 'QUEUED').length,
        runningBuilds: builds.filter((build) => ['VALIDATING', 'BUILDING', 'SCANNING', 'PUSHING'].includes(build.status)).length,
        completedBuilds: completed,
        failedBuilds: failed,
        activeBaseImages: state.baseImages.filter((entry) => entry.active !== false).length,
        auditLogCount: state.auditLogs.length,
      },
    })
  })

  target.get(`${routePrefix}/system/health`, (_req, res) => {
    res.json({
      status: 'healthy',
      component: 'airgap-builds',
      queueLength: loadState().builds.filter((entry) => entry.status === 'QUEUED').length,
      workerBusy,
      executorMode: executionConfig.executorMode,
      scanMode: executionConfig.scanMode,
      timestamp: nowIso(),
    })
  })

  return {
    stop() {
      stopped = true
      if (workerState.activeProcess) {
        try {
          workerState.activeProcess.kill('SIGTERM')
        } catch {
          // Ignore shutdown termination errors.
        }
      }
      clearInterval(timer)
    },
  }
}
