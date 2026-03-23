import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { Readable } from 'node:stream'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  DOCKER_ARTIFACTS_ROOT,
  DOCKER_CONTEXTS_ROOT,
  DOCKER_LOGS_ROOT,
  PROJECT_FILES_ROOT,
} from './runtime-paths.js'

const BUILD_POLL_INTERVAL_MS = 2500
const DEFAULT_BUILD_TIMEOUT_MS = 10 * 60 * 1000
const DEFAULT_READINESS_TIMEOUT_MS = 60 * 1000
const MAX_LOG_FILE_BYTES = 512 * 1024
const CONTAINER_ROOT_DIR = 'containers'
const DOCKER_PREVIEW_HOST = String(process.env.DOCKER_PREVIEW_HOST || '127.0.0.1').trim() || '127.0.0.1'
const COMPOSE_FILE_NAMES = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']
const CONTAINER_META_FILE_NAMES = ['jbhub.container.json', 'jbhub.container.yml', 'jbhub.container.yaml']
const COMPOSE_PREVIEW_HTTP_PORTS = [80, 443, 3000, 4173, 4200, 5173, 8000, 8080, 8888]
const CONTAINER_META_FILE_NAME_SET = new Set(CONTAINER_META_FILE_NAMES.map((fileName) => fileName.toLowerCase()))
const CONTAINER_ALLOWED_HIDDEN_FILES = new Set(['.dockerignore', '.env.example', '.gitignore'])
const CONTAINER_RESTRICTED_PATH_SEGMENTS = new Set(['.aws', '.git', '.hg', '.kube', '.ssh', '.svn'])
const CONTAINER_RESTRICTED_FILE_PATTERNS = [
  /^\.env(?:\..+)?$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)$/i,
  /^(authorized_keys|known_hosts)$/i,
  /\.(key|pem|p12|pfx|jks|kdbx)$/i,
]

function pathExists(targetPath) {
  try {
    fs.accessSync(targetPath, fs.constants.F_OK)
    return true
  } catch {
    return false
  }
}

function sanitizePathSegment(segment, fallback = 'item') {
  const normalized = String(segment ?? '').trim()
  if (!normalized || normalized === '.' || normalized === '..') {
    return fallback
  }

  const sanitized = normalized.replace(/[<>:"|?*\u0000-\u001f]/g, '_')
  return sanitized.length > 0 ? sanitized : fallback
}

function normalizeProjectRelativePath(inputPath, fallbackName = 'file') {
  const rawPath = typeof inputPath === 'string' && inputPath.trim() ? inputPath : fallbackName
  const segments = rawPath
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)

  if (segments.length === 0) {
    return sanitizePathSegment(fallbackName, 'file')
  }

  return segments
    .map((segment, index) =>
      sanitizePathSegment(segment, index === segments.length - 1 ? fallbackName : 'folder'),
    )
    .join('/')
}

function isRestrictedContainerPath(relativePath) {
  const normalizedPath = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalizedPath) {
    return false
  }

  const segments = normalizedPath.split('/').filter(Boolean)
  if (segments.length === 0) {
    return false
  }

  if (segments.some((segment) => CONTAINER_RESTRICTED_PATH_SEGMENTS.has(segment.toLowerCase()))) {
    return true
  }

  const fileName = segments[segments.length - 1].toLowerCase()
  if (CONTAINER_ALLOWED_HIDDEN_FILES.has(fileName)) {
    return false
  }

  return CONTAINER_RESTRICTED_FILE_PATTERNS.some((pattern) => pattern.test(fileName))
}

function normalizeUploadedRelativePaths(rawPaths) {
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

function slugifyName(value, fallback = 'container') {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || fallback
}

function normalizeComposeServiceName(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function getProjectDirectory(projectId) {
  return path.join(PROJECT_FILES_ROOT, String(projectId))
}

function getProjectContainerDirectory(projectId, definitionName) {
  return path.join(getProjectDirectory(projectId), CONTAINER_ROOT_DIR, definitionName)
}

function getBuildLogPath(jobId) {
  return path.join(DOCKER_LOGS_ROOT, `build-job-${jobId}.log`)
}

function getBuildContextPath(jobId) {
  return path.join(DOCKER_CONTEXTS_ROOT, `job-${jobId}`)
}

function findDockerfileName(definitionDir) {
  if (pathExists(path.join(definitionDir, 'Dockerfile'))) {
    return 'Dockerfile'
  }

  let entries = []
  try {
    entries = fs.readdirSync(definitionDir, { withFileTypes: true })
  } catch {
    return null
  }

  const candidates = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => /dockerfile/i.test(fileName))
    .sort((left, right) => {
      const leftScore = left.toLowerCase() === 'dockerfile' ? 0 : 1
      const rightScore = right.toLowerCase() === 'dockerfile' ? 0 : 1
      if (leftScore !== rightScore) {
        return leftScore - rightScore
      }

      return left.localeCompare(right, 'en', { numeric: true })
    })

  return candidates[0] ?? null
}

function findComposeFileName(definitionDir) {
  for (const fileName of COMPOSE_FILE_NAMES) {
    if (pathExists(path.join(definitionDir, fileName))) {
      return fileName
    }
  }

  let entries = []
  try {
    entries = fs.readdirSync(definitionDir, { withFileTypes: true })
  } catch {
    return null
  }

  const yamlCandidates = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => /\.ya?ml$/i.test(fileName))
    .filter((fileName) => !CONTAINER_META_FILE_NAME_SET.has(fileName.toLowerCase()))

  const rankedCandidates = yamlCandidates
    .map((fileName) => {
      const fullPath = path.join(definitionDir, fileName)
      const contents = fs.readFileSync(fullPath, 'utf8')
      const normalizedName = fileName.toLowerCase()
      const score =
        (normalizedName.includes('compose') ? 4 : 0) +
        (/^\s*services\s*:/m.test(contents) ? 3 : 0) +
        (/^\s*version\s*:/m.test(contents) ? 1 : 0)

      return {
        fileName,
        score,
      }
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }
      return left.fileName.localeCompare(right.fileName, 'en', { numeric: true })
    })

  if (rankedCandidates.length > 0) {
    return rankedCandidates[0].fileName
  }

  return null
}

function listRootFileNames(definitionDir, predicate) {
  let entries = []
  try {
    entries = fs.readdirSync(definitionDir, { withFileTypes: true })
  } catch {
    return []
  }

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => predicate(fileName))
}

async function writeContainerDefinitionEntryFiles({
  definitionDir,
  uploadedDockerfile = null,
  uploadedComposeFile = null,
}) {
  await ensureDirectory(definitionDir)

  const filesToRemove = new Set()
  if (uploadedDockerfile) {
    for (const fileName of listRootFileNames(definitionDir, (name) => /dockerfile/i.test(name))) {
      filesToRemove.add(path.join(definitionDir, fileName))
    }
    filesToRemove.add(path.join(definitionDir, 'Dockerfile'))
  }

  if (uploadedComposeFile) {
    for (const composeFileName of COMPOSE_FILE_NAMES) {
      filesToRemove.add(path.join(definitionDir, composeFileName))
    }

    const detectedComposeFileName = findComposeFileName(definitionDir)
    if (detectedComposeFileName) {
      filesToRemove.add(path.join(definitionDir, detectedComposeFileName))
    }
  }

  for (const targetPath of filesToRemove) {
    await fs.promises.rm(targetPath, { force: true })
  }

  let dockerfilePath = null
  if (uploadedDockerfile) {
    const dockerfileFileName = sanitizePathSegment(uploadedDockerfile.name, 'Dockerfile') || 'Dockerfile'
    dockerfilePath = path.join(definitionDir, dockerfileFileName)
    await uploadedDockerfile.mv(dockerfilePath)

    const defaultDockerfilePath = path.join(definitionDir, 'Dockerfile')
    if (path.basename(dockerfilePath).toLowerCase() !== 'dockerfile') {
      await fs.promises.copyFile(dockerfilePath, defaultDockerfilePath)
    }
  }

  let composeFilePath = null
  if (uploadedComposeFile) {
    const composeFileName = /\.ya?ml$/i.test(String(uploadedComposeFile.name ?? ''))
      ? sanitizePathSegment(uploadedComposeFile.name, 'docker-compose.yml')
      : 'docker-compose.yml'
    composeFilePath = path.join(definitionDir, composeFileName)
    await uploadedComposeFile.mv(composeFilePath)
  }

  return {
    dockerfilePath,
    composeFilePath,
  }
}

function collectOfflineImageBundleEntries(bundleDir) {
  const includeEntries = new Set()

  const manifestPath = path.join(bundleDir, 'manifest.json')
  if (pathExists(manifestPath)) {
    includeEntries.add('manifest.json')
    try {
      const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      if (Array.isArray(parsed)) {
        for (const manifestEntry of parsed) {
          if (manifestEntry && typeof manifestEntry === 'object') {
            if (typeof manifestEntry.Config === 'string' && manifestEntry.Config.trim()) {
              includeEntries.add(normalizeProjectRelativePath(manifestEntry.Config, 'config.json'))
            }
            if (Array.isArray(manifestEntry.Layers)) {
              for (const layerPath of manifestEntry.Layers) {
                if (typeof layerPath === 'string' && layerPath.trim()) {
                  includeEntries.add(normalizeProjectRelativePath(layerPath, 'layer.tar'))
                }
              }
            }
          }
        }
      }
    } catch {
      // Ignore invalid manifest payloads and fall back to marker-based detection.
    }
  }

  for (const markerName of ['repositories', 'index.json', 'oci-layout', 'blobs']) {
    if (pathExists(path.join(bundleDir, markerName))) {
      includeEntries.add(markerName)
    }
  }

  const resolvedEntries = Array.from(includeEntries).filter((entry) => pathExists(path.join(bundleDir, entry)))
  return resolvedEntries.length > 0 ? resolvedEntries : null
}

async function loadOfflineImagesIfPresent(bundleDir, logPath) {
  const bundleEntries = collectOfflineImageBundleEntries(bundleDir)
  if (!bundleEntries) {
    return null
  }

  await ensureDirectory(DOCKER_ARTIFACTS_ROOT)
  const archivePath = path.join(DOCKER_ARTIFACTS_ROOT, `offline-image-${Date.now()}-${randomUUID()}.tar`)

  try {
    const packageResult = await runLoggedProcess('tar', ['-cf', archivePath, '-C', bundleDir, ...bundleEntries], {
      cwd: bundleDir,
      logPath,
      timeoutMs: DEFAULT_BUILD_TIMEOUT_MS,
    })

    if (packageResult.exitCode !== 0) {
      throw new Error(packageResult.output.trim() || 'Offline image bundle could not be packaged.')
    }

    const loadResult = await runLoggedProcess('docker', ['load', '-i', archivePath], {
      cwd: bundleDir,
      logPath,
      timeoutMs: DEFAULT_BUILD_TIMEOUT_MS,
    })

    if (loadResult.exitCode !== 0) {
      throw new Error(loadResult.output.trim() || 'Offline image bundle could not be loaded.')
    }

    return loadResult.output.trim() || 'Offline images loaded.'
  } finally {
    await removeDirectoryContents(archivePath)
  }
}

function readSingleHeader(headerValue) {
  if (Array.isArray(headerValue)) {
    return String(headerValue[0] ?? '')
  }

  return typeof headerValue === 'string' ? headerValue : ''
}

function readProjectActorName(req) {
  return readSingleHeader(req.headers['x-jb-user-name']).trim()
}

function readProjectEditToken(req) {
  return readSingleHeader(req.headers['x-jb-project-edit-token']).trim()
}

function normalizeProjectActorName(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function hasValidProjectEditToken({ jwt, jwtSecret, project, editToken }) {
  if (!project || typeof editToken !== 'string' || !editToken.trim()) {
    return false
  }

  try {
    const decoded = jwt.verify(editToken, jwtSecret)
    if (!decoded || typeof decoded !== 'object') {
      return false
    }

    return (
      decoded.type === 'project-edit' &&
      Number(decoded.projectId) === Number(project.id) &&
      normalizeProjectActorName(decoded.author) === normalizeProjectActorName(project.author)
    )
  } catch {
    return false
  }
}

function hasProjectWriteAccess({ req, project, jwt, jwtSecret }) {
  if (hasValidProjectEditToken({ jwt, jwtSecret, project, editToken: readProjectEditToken(req) })) {
    return true
  }

  const normalizedActor = normalizeProjectActorName(readProjectActorName(req))
  const normalizedAuthor = normalizeProjectActorName(project?.author)
  return normalizedActor.length > 0 && normalizedAuthor.length > 0 && normalizedActor === normalizedAuthor
}

async function readTextFileIfExists(filePath) {
  try {
    return await fs.promises.readFile(filePath, 'utf8')
  } catch {
    return null
  }
}

function parseScalarValue(rawValue) {
  const trimmed = String(rawValue ?? '').trim()
  if (!trimmed) {
    return ''
  }

  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed)

  return trimmed.replace(/^['"]|['"]$/g, '')
}

function parseContainerMetaYaml(text) {
  const data = {}
  let section = null
  let subSection = null

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\t/g, '  ')
    const trimmed = line.trim()

    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    if (/^[A-Za-z0-9_-]+:\s*$/.test(trimmed)) {
      const key = trimmed.slice(0, trimmed.indexOf(':')).trim()
      data[key] = {}
      section = key
      subSection = null
      continue
    }

    const sectionMatch = line.match(/^ {2}([A-Za-z0-9_-]+):\s*(.*)$/)
    if (sectionMatch && section) {
      const [, key, rawValue] = sectionMatch
      const value = parseScalarValue(rawValue)

      if (rawValue.trim() === '') {
        data[section][key] = {}
        subSection = key
      } else {
        data[section][key] = value
        subSection = null
      }
      continue
    }

    const nestedMatch = line.match(/^ {4}([A-Za-z0-9_-]+):\s*(.*)$/)
    if (nestedMatch && section && subSection && data[section]?.[subSection] && typeof data[section][subSection] === 'object') {
      const [, key, rawValue] = nestedMatch
      data[section][subSection][key] = parseScalarValue(rawValue)
      continue
    }
  }

  return data
}

async function readContainerMetadata(definitionDir) {
  const warnings = []

  for (const fileName of CONTAINER_META_FILE_NAMES) {
    const absolutePath = path.join(definitionDir, fileName)
    if (!pathExists(absolutePath)) {
      continue
    }

    const text = await readTextFileIfExists(absolutePath)
    if (!text) {
      continue
    }

    try {
      if (fileName.endsWith('.json')) {
        return { fileName, absolutePath, exists: true, data: JSON.parse(text), warnings }
      }

      return { fileName, absolutePath, exists: true, data: parseContainerMetaYaml(text), warnings }
    } catch {
      warnings.push(`${fileName} could not be parsed.`)
      return { fileName, absolutePath, exists: true, data: {}, warnings }
    }
  }

  warnings.push('jbhub.container.json or jbhub.container.yml is recommended.')
  return { fileName: null, absolutePath: null, exists: false, data: {}, warnings }
}

function resolveNumericPort(value) {
  const port = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    return null
  }

  return port
}

function inferPortFromDockerfileContents(dockerfileContents) {
  if (typeof dockerfileContents !== 'string') {
    return null
  }

  const match = dockerfileContents.match(/^\s*EXPOSE\s+(\d{2,5})(?:\/tcp|\/udp)?/im)
  return match ? resolveNumericPort(match[1]) : null
}

function dockerfileNeedsLocalContext(dockerfileContents) {
  if (typeof dockerfileContents !== 'string') {
    return false
  }

  return /^\s*(COPY|ADD)\s+/im.test(dockerfileContents)
}

async function listContainerDefinitionFiles(definitionDir) {
  const items = []

  async function visit(currentDir) {
    const entries = await fs.promises.readdir(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name)
      const relativePath = path.relative(definitionDir, absolutePath).split(path.sep).join('/')
      if (entry.isDirectory()) {
        await visit(absolutePath)
        continue
      }

      items.push(relativePath)
    }
  }

  await visit(definitionDir)
  return items
}

function serializeBuildJob(row) {
  return {
    id: Number(row.id),
    projectId: Number(row.project_id),
    definitionName: row.definition_name ? String(row.definition_name) : String(row.source_file_name ?? ''),
    status: String(row.status ?? 'queued'),
    uploaderName: row.uploader_name ? String(row.uploader_name) : '',
    dockerfilePath: row.dockerfile_path ? String(row.dockerfile_path) : 'Dockerfile',
    contextPath: row.context_path ? String(row.context_path) : '.',
    imageReference: row.image_reference ? String(row.image_reference) : null,
    containerPort: resolveNumericPort(row.container_port),
    preferredHostPort: resolveNumericPort(row.preferred_host_port),
    errorMessage: row.error_message ? String(row.error_message) : null,
    logPath: row.log_path ? String(row.log_path) : null,
    deploymentId: Number.isFinite(Number(row.deployment_id)) ? Number(row.deployment_id) : null,
    createdAt: row.created_at ? String(row.created_at) : null,
    startedAt: row.started_at ? String(row.started_at) : null,
    finishedAt: row.finished_at ? String(row.finished_at) : null,
  }
}

function buildContainerPreviewPath(deploymentToken, serviceName = null) {
  const basePath = `/api/v1/container-previews/${encodeURIComponent(String(deploymentToken ?? ''))}`
  if (typeof serviceName === 'string' && serviceName.trim()) {
    return `${basePath}/services/${encodeURIComponent(serviceName.trim())}/`
  }

  return `${basePath}/`
}

function serializeServiceEndpoint({
  deploymentToken,
  serviceName = null,
  containerPort = null,
  hostPort = null,
  isPrimary = false,
}) {
  const normalizedHostPort = resolveNumericPort(hostPort)
  const normalizedContainerPort = resolveNumericPort(containerPort)
  const normalizedServiceName =
    typeof serviceName === 'string' && serviceName.trim() ? serviceName.trim() : null

  return {
    serviceName: normalizedServiceName,
    containerPort: normalizedContainerPort,
    hostPort: normalizedHostPort,
    endpointUrl: normalizedHostPort ? `http://${DOCKER_PREVIEW_HOST}:${normalizedHostPort}` : null,
    sitePreviewUrl: deploymentToken ? buildContainerPreviewPath(deploymentToken, normalizedServiceName) : null,
    isPrimary: Boolean(isPrimary),
  }
}

function serializeDeployment(row, { serviceEndpoints = [] } = {}) {
  const deploymentToken = row.deployment_id ? String(row.deployment_id) : String(row.id)
  const hostPort = resolveNumericPort(row.host_port)
  return {
    id: Number(row.id),
    projectId: Number(row.project_id),
    buildJobId: Number.isFinite(Number(row.build_job_id)) ? Number(row.build_job_id) : null,
    definitionName: row.definition_name ? String(row.definition_name) : '',
    deploymentToken,
    uploaderName: row.uploader_name ? String(row.uploader_name) : '',
    containerName: row.container_name ? String(row.container_name) : null,
    containerId: row.container_id ? String(row.container_id) : null,
    containerPort: resolveNumericPort(row.container_port),
    hostPort,
    imageReference: row.image_reference ? String(row.image_reference) : null,
    status: row.status ? String(row.status) : 'stopped',
    endpointUrl: row.endpoint_url ? String(row.endpoint_url) : hostPort ? `http://${DOCKER_PREVIEW_HOST}:${hostPort}` : null,
    sitePreviewUrl: buildContainerPreviewPath(deploymentToken),
    serviceEndpoints: Array.isArray(serviceEndpoints) ? serviceEndpoints : [],
    errorMessage: row.error_message ? String(row.error_message) : null,
    runOutput: row.run_output ? String(row.run_output) : null,
    createdAt: row.created_at ? String(row.created_at) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
    stoppedAt: row.stopped_at ? String(row.stopped_at) : null,
  }
}

function appendToLogFile(logPath, chunk) {
  if (!logPath) {
    return
  }

  const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
  fs.appendFileSync(logPath, text)
}

function truncateLogContents(text) {
  if (text.length <= MAX_LOG_FILE_BYTES) {
    return text
  }

  return text.slice(text.length - MAX_LOG_FILE_BYTES)
}

function runLoggedProcess(command, args, { cwd = process.cwd(), logPath, timeoutMs = DEFAULT_BUILD_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let output = ''
    let completed = false
    const killTimer = setTimeout(() => {
      if (completed) {
        return
      }

      completed = true
      child.kill('SIGTERM')
      reject(new Error(`Command timed out: ${command} ${args.join(' ')}`))
    }, timeoutMs)

    const handleChunk = (chunk) => {
      const text = chunk.toString('utf8')
      output = truncateLogContents(output + text)
      appendToLogFile(logPath, text)
    }

    child.stdout.on('data', handleChunk)
    child.stderr.on('data', handleChunk)
    child.on('error', (error) => {
      if (completed) {
        return
      }

      completed = true
      clearTimeout(killTimer)
      reject(error)
    })
    child.on('close', (exitCode) => {
      if (completed) {
        return
      }

      completed = true
      clearTimeout(killTimer)
      resolve({
        exitCode: Number(exitCode ?? 1),
        output,
      })
    })
  })
}

async function getDockerRuntimeStatus() {
  try {
    const result = await runLoggedProcess('docker', ['version', '--format', '{{.Server.Version}}'], {
      logPath: null,
      timeoutMs: 5000,
    })

    if (result.exitCode !== 0) {
      return {
        available: false,
        version: null,
        error: result.output.trim() || 'Docker engine is unavailable.',
      }
    }

    return {
      available: true,
      version: result.output.trim() || null,
      error: null,
    }
  } catch (error) {
    return {
      available: false,
      version: null,
      error: error instanceof Error ? error.message : 'Docker engine is unavailable.',
    }
  }
}

async function scanProjectContainerDefinitions(projectId, db) {
  const containersDir = path.join(getProjectDirectory(projectId), CONTAINER_ROOT_DIR)
  let entries = []

  try {
    entries = await fs.promises.readdir(containersDir, { withFileTypes: true })
  } catch {
    return []
  }

  const jobsByDefinition = new Map()
  for (const row of db.prepare('SELECT * FROM docker_build_jobs WHERE project_id = ? ORDER BY id DESC').all(projectId)) {
    const definitionName = String(row.definition_name ?? row.source_file_name ?? '')
    if (!definitionName || jobsByDefinition.has(definitionName)) {
      continue
    }
    jobsByDefinition.set(definitionName, serializeBuildJob(row))
  }

  const deploymentRowsByDefinition = new Map()
  for (const row of db.prepare('SELECT * FROM docker_deployments WHERE project_id = ? ORDER BY id DESC').all(projectId)) {
    const definitionName = String(row.definition_name ?? '')
    if (!definitionName || deploymentRowsByDefinition.has(definitionName)) {
      continue
    }
    deploymentRowsByDefinition.set(definitionName, row)
  }

  const definitions = []
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }

    const definitionName = sanitizePathSegment(entry.name, 'container')
    const definitionDir = path.join(containersDir, definitionName)
    const metadata = await readContainerMetadata(definitionDir)
    const metadataBuild = metadata.data?.build ?? {}
    const metadataRun = metadata.data?.run ?? {}
    const composeFileName = findComposeFileName(definitionDir)
    const detectedDockerfileName = findDockerfileName(definitionDir)
    const dockerfilePath = normalizeProjectRelativePath(
      metadataBuild.dockerfile ?? detectedDockerfileName ?? 'Dockerfile',
      'Dockerfile',
    )
    const contextPath = normalizeProjectRelativePath(metadataBuild.context ?? '.', '.')
    const dockerfileAbsolutePath = path.join(definitionDir, dockerfilePath)

    if (!composeFileName && !pathExists(dockerfileAbsolutePath)) {
      continue
    }

    const dockerfileContents = pathExists(dockerfileAbsolutePath) ? await readTextFileIfExists(dockerfileAbsolutePath) : null
    const containerPort = composeFileName
      ? resolveNumericPort(metadataRun.containerPort)
      : resolveNumericPort(metadataRun.containerPort) ?? inferPortFromDockerfileContents(dockerfileContents)
    const warnings = [...metadata.warnings]
    if (!pathExists(path.join(definitionDir, '.dockerignore'))) {
      warnings.push('.dockerignore is recommended.')
    }
    if (composeFileName) {
      warnings.push('Compose file detected. Upload the matching tar archive contents for build context changes.')
    } else if (!containerPort) {
      warnings.push('Container port could not be inferred. Add EXPOSE or container metadata.')
    }

    const files = await listContainerDefinitionFiles(definitionDir)
    if (!composeFileName && files.length <= 2 && dockerfileNeedsLocalContext(dockerfileContents)) {
      warnings.push('This Dockerfile uses COPY or ADD. Upload the matching context files before building.')
    }

    definitions.push({
      name: definitionName,
      rootPath: `${CONTAINER_ROOT_DIR}/${definitionName}`,
      dockerfilePath: `${CONTAINER_ROOT_DIR}/${definitionName}/${dockerfilePath}`,
      composeFilePath: composeFileName ? `${CONTAINER_ROOT_DIR}/${definitionName}/${composeFileName}` : null,
      metadataPath: metadata.fileName ? `${CONTAINER_ROOT_DIR}/${definitionName}/${metadata.fileName}` : null,
      buildContextPath: `${CONTAINER_ROOT_DIR}/${definitionName}/${contextPath === '.' ? '' : contextPath}`.replace(/\/+$/, ''),
      containerPort,
      healthcheckPath:
        typeof metadataRun.healthcheckPath === 'string' && metadataRun.healthcheckPath.trim()
          ? metadataRun.healthcheckPath.trim()
          : null,
      readinessTimeoutSec:
        Number.isFinite(Number(metadataRun.readinessTimeoutSec)) && Number(metadataRun.readinessTimeoutSec) > 0
          ? Number(metadataRun.readinessTimeoutSec)
          : null,
      files,
      warnings,
      lastBuildJob: jobsByDefinition.get(definitionName) ?? null,
      activeDeployment: deploymentRowsByDefinition.has(definitionName)
        ? await enrichDeploymentRow(deploymentRowsByDefinition.get(definitionName))
        : null,
    })
  }

  return definitions.sort((left, right) => left.name.localeCompare(right.name, 'en', { numeric: true }))
}

function allocatePort(preferredPort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer()

    server.on('error', (error) => {
      server.close()
      reject(error)
    })

    server.listen(preferredPort || 0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Could not allocate a local port.'))
        return
      }

      const port = address.port
      server.close((closeError) => {
        if (closeError) {
          reject(closeError)
          return
        }

        resolve(port)
      })
    })
  })
}

async function waitForPreview({ endpointUrl, healthcheckPath, timeoutMs }) {
  const deadline = Date.now() + timeoutMs
  const targetUrl = healthcheckPath ? new URL(healthcheckPath, endpointUrl).toString() : endpointUrl

  while (Date.now() < deadline) {
    try {
      const response = await fetch(targetUrl, { method: 'GET' })
      if (response.ok) {
        return true
      }
    } catch {
      // Keep polling until the timeout expires.
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 1500)
    })
  }

  return false
}

async function removeDirectoryContents(targetPath) {
  if (!pathExists(targetPath)) {
    return
  }

  await fs.promises.rm(targetPath, { recursive: true, force: true })
}

async function ensureDirectory(targetPath) {
  await fs.promises.mkdir(targetPath, { recursive: true })
}

async function extractContextArchive(archivePath, targetDir) {
  const inspectResult = await runLoggedProcess('tar', ['-tf', archivePath], {
    logPath: null,
    timeoutMs: DEFAULT_BUILD_TIMEOUT_MS,
  })

  if (inspectResult.exitCode !== 0) {
    throw new Error(inspectResult.output.trim() || 'Could not inspect the tar archive.')
  }

  for (const entry of inspectResult.output.split(/\r?\n/)) {
    const normalizedEntry = entry.trim().replace(/\\/g, '/')
    if (!normalizedEntry) {
      continue
    }

    const segments = normalizedEntry.split('/').filter(Boolean)
    if (normalizedEntry.startsWith('/') || segments.includes('..')) {
      throw new Error('The tar archive contains an invalid file path.')
    }
  }

  const extractResult = await runLoggedProcess('tar', ['-xf', archivePath, '-C', targetDir], {
    logPath: null,
    timeoutMs: DEFAULT_BUILD_TIMEOUT_MS,
  })

  if (extractResult.exitCode !== 0) {
    throw new Error(extractResult.output.trim() || 'Could not extract the tar archive.')
  }
}

function parseComposePsOutput(text) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) {
    return []
  }

  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) {
      return parsed
    }
    if (parsed && typeof parsed === 'object') {
      return [parsed]
    }
  } catch {
    return trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const parsed = JSON.parse(line)
          return parsed && typeof parsed === 'object' ? [parsed] : []
        } catch {
          return []
        }
      })
  }

  return []
}

function parseComposeTargetPort(value) {
  if (typeof value === 'number') {
    return resolveNumericPort(value)
  }

  const normalized = String(value ?? '').trim()
  if (!normalized) {
    return null
  }

  const withoutProtocol = normalized.split('/')[0]?.trim() ?? ''
  if (!withoutProtocol) {
    return null
  }

  const segments = withoutProtocol
    .split(':')
    .map((entry) => entry.trim())
    .filter(Boolean)

  if (segments.length === 0) {
    return null
  }

  return resolveNumericPort(segments.at(-1))
}

function normalizeComposePortEntry(entry) {
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    const target = resolveNumericPort(entry.target)
    if (!target) {
      return null
    }

    const normalized = { target }
    if (typeof entry.protocol === 'string' && entry.protocol.trim()) {
      normalized.protocol = entry.protocol.trim()
    }
    if (typeof entry.app_protocol === 'string' && entry.app_protocol.trim()) {
      normalized.app_protocol = entry.app_protocol.trim()
    }
    if (typeof entry.mode === 'string' && entry.mode.trim()) {
      normalized.mode = entry.mode.trim()
    }

    return normalized
  }

  const target = parseComposeTargetPort(entry)
  return target ? { target, protocol: 'tcp' } : null
}

function collectPreviewComposePorts(serviceConfig, previewContainerPort) {
  const configuredPorts = Array.isArray(serviceConfig?.ports)
    ? serviceConfig.ports.map((entry) => normalizeComposePortEntry(entry)).filter(Boolean)
    : []

  if (configuredPorts.length > 0) {
    return configuredPorts
  }

  const exposedPorts = Array.isArray(serviceConfig?.expose)
    ? serviceConfig.expose
        .map((entry) => {
          const target = parseComposeTargetPort(entry)
          return target ? { target, protocol: 'tcp' } : null
        })
        .filter(Boolean)
    : []

  if (exposedPorts.length > 0) {
    return exposedPorts
  }

  const fallbackPort = resolveNumericPort(previewContainerPort)
  return fallbackPort ? [{ target: fallbackPort, protocol: 'tcp' }] : null
}

function choosePreviewTargetPort(ports, previewContainerPort) {
  if (!Array.isArray(ports) || ports.length === 0) {
    return resolveNumericPort(previewContainerPort)
  }

  const requestedPort = resolveNumericPort(previewContainerPort)
  if (requestedPort) {
    const requestedMatch = ports.find((entry) => resolveNumericPort(entry?.target) === requestedPort)
    if (requestedMatch) {
      return requestedPort
    }
  }

  for (const port of COMPOSE_PREVIEW_HTTP_PORTS) {
    const httpMatch = ports.find((entry) => resolveNumericPort(entry?.target) === port)
    if (httpMatch) {
      return port
    }
  }

  return resolveNumericPort(ports[0]?.target) ?? resolveNumericPort(previewContainerPort)
}

function scoreComposeServiceForPreview(serviceName, ports, previewContainerPort) {
  const normalizedName = normalizeComposeServiceName(serviceName)
  let score = 0

  if (/(?:^|[-_])(front|frontend|web|ui|client|site|viewer|app|www|nginx)(?:$|[-_])/.test(normalizedName)) {
    score += 80
  }

  if (/(?:^|[-_])(back|backend|api|server|worker|queue|job|cron|db|redis|mysql|postgres|mongo)(?:$|[-_])/.test(normalizedName)) {
    score -= 60
  }

  const targetPort = choosePreviewTargetPort(ports, previewContainerPort)
  if (targetPort && COMPOSE_PREVIEW_HTTP_PORTS.includes(targetPort)) {
    score += 40
  }

  const requestedPort = resolveNumericPort(previewContainerPort)
  if (requestedPort && targetPort === requestedPort) {
    score += 120
  }

  if (Array.isArray(ports) && ports.length > 0) {
    score += 10
  }

  return {
    score,
    targetPort,
  }
}

function selectComposePreviewService(services, { previewContainerPort, previewServiceName } = {}) {
  if (!services || typeof services !== 'object' || Array.isArray(services)) {
    return {
      serviceName: null,
      targetPort: resolveNumericPort(previewContainerPort),
    }
  }

  const requestedServiceName = normalizeComposeServiceName(previewServiceName)
  if (requestedServiceName) {
    for (const [serviceName, serviceConfig] of Object.entries(services)) {
      if (normalizeComposeServiceName(serviceName) !== requestedServiceName) {
        continue
      }

      const ports = collectPreviewComposePorts(serviceConfig, previewContainerPort) ?? []
      return {
        serviceName,
        targetPort: choosePreviewTargetPort(ports, previewContainerPort),
      }
    }
  }

  let bestMatch = null
  let bestIndex = Number.POSITIVE_INFINITY

  for (const [index, [serviceName, serviceConfig]] of Object.entries(services).entries()) {
    const ports = collectPreviewComposePorts(serviceConfig, previewContainerPort) ?? []
    const candidate = scoreComposeServiceForPreview(serviceName, ports, previewContainerPort)
    if (!bestMatch || candidate.score > bestMatch.score || (candidate.score === bestMatch.score && index < bestIndex)) {
      bestMatch = {
        serviceName,
        targetPort: candidate.targetPort,
        score: candidate.score,
      }
      bestIndex = index
    }
  }

  return {
    serviceName: bestMatch?.serviceName ?? null,
    targetPort: bestMatch?.targetPort ?? resolveNumericPort(previewContainerPort),
  }
}

async function generatePreviewComposeFile({
  composeFileAbsolutePath,
  composeProjectName,
  logPath,
  previewContainerPort,
  previewServiceName,
}) {
  await ensureDirectory(DOCKER_CONTEXTS_ROOT)

  const configResult = await runLoggedProcess(
    'docker',
    ['compose', '-p', composeProjectName, '-f', composeFileAbsolutePath, 'config', '--format', 'json'],
    {
      cwd: path.dirname(composeFileAbsolutePath),
      logPath,
      timeoutMs: DEFAULT_BUILD_TIMEOUT_MS,
    },
  )

  if (configResult.exitCode !== 0) {
    throw new Error(configResult.output.trim() || 'Compose file could not be normalized for preview.')
  }

  let parsedConfig
  try {
    parsedConfig = JSON.parse(configResult.output)
  } catch {
    throw new Error('Compose file normalization returned invalid JSON.')
  }

  if (!parsedConfig || typeof parsedConfig !== 'object' || Array.isArray(parsedConfig)) {
    throw new Error('Compose file normalization returned an invalid config object.')
  }

  const services =
    parsedConfig.services && typeof parsedConfig.services === 'object' && !Array.isArray(parsedConfig.services)
      ? parsedConfig.services
      : null

  if (!services) {
    throw new Error('Compose file normalization could not find any services.')
  }

  const previewTarget = selectComposePreviewService(services, {
    previewContainerPort,
    previewServiceName,
  })

  let hasPublishedPreviewPort = false
  const previewServices = {}

  for (const [serviceName, serviceConfig] of Object.entries(services)) {
    if (!serviceConfig || typeof serviceConfig !== 'object' || Array.isArray(serviceConfig)) {
      previewServices[serviceName] = serviceConfig
      continue
    }

    const normalizedService = { ...serviceConfig }
    delete normalizedService.container_name

    const previewPorts = collectPreviewComposePorts(serviceConfig, previewContainerPort)
    if (previewPorts && previewPorts.length > 0) {
      normalizedService.ports = previewPorts
      hasPublishedPreviewPort = true
    } else {
      delete normalizedService.ports
    }

    previewServices[serviceName] = normalizedService
  }

  const previewConfig = {
    ...parsedConfig,
    name: composeProjectName,
    services: previewServices,
  }

  const previewComposePath = path.join(DOCKER_CONTEXTS_ROOT, `compose-preview-${composeProjectName}-${randomUUID()}.json`)
  await fs.promises.writeFile(previewComposePath, JSON.stringify(previewConfig, null, 2), 'utf8')
  appendToLogFile(logPath, `JB Hub preview compose generated: ${previewComposePath}\n`)
  if (previewTarget.serviceName) {
    appendToLogFile(
      logPath,
      `JB Hub preview target service: ${previewTarget.serviceName}${previewTarget.targetPort ? `:${previewTarget.targetPort}` : ''}\n`,
    )
  }

  if (!hasPublishedPreviewPort) {
    appendToLogFile(logPath, 'JB Hub preview warning: no HTTP port could be inferred from this compose file.\n')
  }

  return {
    previewComposePath,
    previewServiceName: previewTarget.serviceName,
    previewTargetPort: previewTarget.targetPort,
  }
}

function resolveComposePublishedPort(psEntries, { preferredServiceName, preferredTargetPort } = {}) {
  const normalizedPreferredService = normalizeComposeServiceName(preferredServiceName)
  const normalizedPreferredTargetPort = resolveNumericPort(preferredTargetPort)

  function findPublishedPort(entries, { requireService = false, requireTargetPort = false } = {}) {
    for (const entry of entries) {
      if (requireService && normalizeComposeServiceName(entry?.Service) !== normalizedPreferredService) {
        continue
      }

      const publishers = Array.isArray(entry?.Publishers) ? entry.Publishers : []
      for (const publisher of publishers) {
        const protocol = typeof publisher?.Protocol === 'string' ? publisher.Protocol.trim().toLowerCase() : 'tcp'
        if (protocol && protocol !== 'tcp') {
          continue
        }

        const targetPort = resolveNumericPort(publisher?.TargetPort)
        if (requireTargetPort && targetPort !== normalizedPreferredTargetPort) {
          continue
        }

        const publishedPort = resolveNumericPort(publisher?.PublishedPort)
        if (publishedPort) {
          return publishedPort
        }
      }
    }

    return null
  }

  if (normalizedPreferredService && normalizedPreferredTargetPort) {
    const exactMatch = findPublishedPort(psEntries, { requireService: true, requireTargetPort: true })
    if (exactMatch) {
      return exactMatch
    }
  }

  if (normalizedPreferredService) {
    const serviceMatch = findPublishedPort(psEntries, { requireService: true })
    if (serviceMatch) {
      return serviceMatch
    }
  }

  if (normalizedPreferredTargetPort) {
    const targetPortMatch = findPublishedPort(psEntries, { requireTargetPort: true })
    if (targetPortMatch) {
      return targetPortMatch
    }
  }

  return findPublishedPort(psEntries)
}

function buildComposeServiceEndpoints(
  psEntries,
  { deploymentToken, preferredServiceName, preferredTargetPort, preferredHostPort } = {},
) {
  const normalizedPreferredService = normalizeComposeServiceName(preferredServiceName)
  const normalizedPreferredTargetPort = resolveNumericPort(preferredTargetPort)
  const normalizedPreferredHostPort = resolveNumericPort(preferredHostPort)
  const endpointMap = new Map()

  for (const entry of Array.isArray(psEntries) ? psEntries : []) {
    const serviceName = typeof entry?.Service === 'string' && entry.Service.trim() ? entry.Service.trim() : null
    const publishers = Array.isArray(entry?.Publishers) ? entry.Publishers : []

    for (const publisher of publishers) {
      const protocol = typeof publisher?.Protocol === 'string' ? publisher.Protocol.trim().toLowerCase() : 'tcp'
      if (protocol && protocol !== 'tcp') {
        continue
      }

      const hostPort = resolveNumericPort(publisher?.PublishedPort)
      if (!hostPort) {
        continue
      }

      const containerPort = resolveNumericPort(publisher?.TargetPort)
      const normalizedServiceName = normalizeComposeServiceName(serviceName)
      const key = `${normalizedServiceName || 'service'}:${containerPort || 'port'}:${hostPort}`
      if (endpointMap.has(key)) {
        continue
      }

      const isPrimary =
        (normalizedPreferredService && normalizedServiceName === normalizedPreferredService) ||
        (normalizedPreferredTargetPort && containerPort === normalizedPreferredTargetPort) ||
        (normalizedPreferredHostPort && hostPort === normalizedPreferredHostPort)

      endpointMap.set(
        key,
        serializeServiceEndpoint({
          deploymentToken,
          serviceName,
          containerPort,
          hostPort,
          isPrimary,
        }),
      )
    }
  }

  return Array.from(endpointMap.values()).sort((left, right) => {
    const leftPrimary = left.isPrimary ? 1 : 0
    const rightPrimary = right.isPrimary ? 1 : 0
    if (leftPrimary !== rightPrimary) {
      return rightPrimary - leftPrimary
    }

    const leftScore = scoreComposeServiceForPreview(left.serviceName || '', [{ target: left.containerPort }], normalizedPreferredTargetPort).score
    const rightScore = scoreComposeServiceForPreview(right.serviceName || '', [{ target: right.containerPort }], normalizedPreferredTargetPort).score
    if (leftScore !== rightScore) {
      return rightScore - leftScore
    }

    const leftName = left.serviceName || ''
    const rightName = right.serviceName || ''
    const nameComparison = leftName.localeCompare(rightName, 'en', { numeric: true })
    if (nameComparison !== 0) {
      return nameComparison
    }

    return (left.hostPort ?? 0) - (right.hostPort ?? 0)
  })
}

async function readComposePsEntriesForDeployment(deploymentRow) {
  const imageReference = String(deploymentRow.image_reference ?? '')
  if (!imageReference.startsWith('compose:')) {
    return []
  }

  const definitionName = String(deploymentRow.definition_name ?? '')
  const definitionDir = getProjectContainerDirectory(Number(deploymentRow.project_id), definitionName)
  const composeFileName = findComposeFileName(definitionDir)
  if (!composeFileName) {
    return []
  }

  const composeProjectName = deploymentRow.container_name || imageReference.slice('compose:'.length)
  const composeFileAbsolutePath = path.join(definitionDir, composeFileName)
  const psResult = await runLoggedProcess(
    'docker',
    ['compose', '-p', composeProjectName, '-f', composeFileAbsolutePath, 'ps', '--format', 'json'],
    {
      cwd: path.dirname(composeFileAbsolutePath),
      logPath: null,
      timeoutMs: 30000,
    },
  )

  if (psResult.exitCode !== 0) {
    return []
  }

  return parseComposePsOutput(psResult.output)
}

async function enrichDeploymentRow(deploymentRow, { preferredServiceName, preferredTargetPort } = {}) {
  const deployment = serializeDeployment(deploymentRow)
  const imageReference = String(deploymentRow.image_reference ?? '')
  const deploymentToken = deployment.deploymentToken

  if (imageReference.startsWith('compose:') && deployment.status === 'running') {
    try {
      const psEntries = await readComposePsEntriesForDeployment(deploymentRow)
      const serviceEndpoints = buildComposeServiceEndpoints(psEntries, {
        deploymentToken,
        preferredServiceName,
        preferredTargetPort: resolveNumericPort(preferredTargetPort) ?? resolveNumericPort(deploymentRow.container_port),
        preferredHostPort: resolveNumericPort(deploymentRow.host_port),
      })

      if (serviceEndpoints.length > 0) {
        return serializeDeployment(deploymentRow, { serviceEndpoints })
      }
    } catch {
      // Ignore compose inspection errors and fall back to the stored endpoint.
    }
  }

  const fallbackServiceEndpoints =
    deployment.endpointUrl || deployment.sitePreviewUrl
      ? [
          serializeServiceEndpoint({
            deploymentToken,
            serviceName: imageReference.startsWith('compose:') ? null : 'app',
            containerPort: resolveNumericPort(deploymentRow.container_port),
            hostPort: resolveNumericPort(deploymentRow.host_port),
            isPrimary: true,
          }),
        ]
      : []

  return serializeDeployment(deploymentRow, {
    serviceEndpoints: fallbackServiceEndpoints.filter((entry) => entry.endpointUrl || entry.sitePreviewUrl),
  })
}

function resolvePublishedPortFromDockerPortOutput(text) {
  const match = String(text ?? '').match(/:(\d{2,5})\s*$/m)
  return match ? resolveNumericPort(match[1]) : null
}

async function stopDockerDeployment(db, deploymentRow, { remove = true } = {}) {
  const imageReference = String(deploymentRow.image_reference ?? '')
  if (imageReference.startsWith('compose:')) {
    const composeProjectName = deploymentRow.container_name || imageReference.slice('compose:'.length)
    let errorMessage = null

    try {
      const listResult = await runLoggedProcess(
        'docker',
        ['ps', '-aq', '--filter', `label=com.docker.compose.project=${composeProjectName}`],
        {
          logPath: null,
          timeoutMs: 30000,
        },
      )

      if (listResult.exitCode !== 0) {
        errorMessage = listResult.output.trim() || 'Failed to inspect compose containers.'
      } else {
        const containerIds = listResult.output
          .split(/\s+/)
          .map((entry) => entry.trim())
          .filter(Boolean)

        if (containerIds.length > 0) {
          const removeResult = await runLoggedProcess('docker', ['rm', '-f', ...containerIds], {
            logPath: null,
            timeoutMs: 60000,
          })

          if (removeResult.exitCode !== 0) {
            errorMessage = removeResult.output.trim() || 'Failed to stop the compose stack.'
          }
        }
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to stop the compose stack.'
    }

    db.prepare(
      `UPDATE docker_deployments
       SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP, stopped_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(errorMessage ? 'failed' : 'stopped', errorMessage, deploymentRow.id)

    return serializeDeployment(db.prepare('SELECT * FROM docker_deployments WHERE id = ?').get(deploymentRow.id))
  }

  const identifier = deploymentRow.container_id || deploymentRow.container_name
  if (!identifier) {
    db.prepare(
      'UPDATE docker_deployments SET status = ?, updated_at = CURRENT_TIMESTAMP, stopped_at = CURRENT_TIMESTAMP WHERE id = ?',
    ).run('stopped', deploymentRow.id)
    return serializeDeployment(db.prepare('SELECT * FROM docker_deployments WHERE id = ?').get(deploymentRow.id))
  }

  const args = remove ? ['rm', '-f', identifier] : ['stop', identifier]
  let errorMessage = null

  try {
    const result = await runLoggedProcess('docker', args, {
      logPath: null,
      timeoutMs: 30000,
    })
    if (result.exitCode !== 0) {
      errorMessage = result.output.trim() || 'Failed to stop the container.'
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : 'Failed to stop the container.'
  }

  db.prepare(
    `UPDATE docker_deployments
     SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP, stopped_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).run(errorMessage ? 'failed' : 'stopped', errorMessage, deploymentRow.id)

  return serializeDeployment(db.prepare('SELECT * FROM docker_deployments WHERE id = ?').get(deploymentRow.id))
}

async function runDockerPreview({
  db,
  jobId,
  projectId,
  definitionName,
  imageReference,
  uploaderName,
  containerPort,
  preferredHostPort,
  healthcheckPath,
  readinessTimeoutSec,
}) {
  const runningDeployments = db
    .prepare('SELECT * FROM docker_deployments WHERE project_id = ? AND definition_name = ? AND status = ?')
    .all(projectId, definitionName, 'running')

  for (const deploymentRow of runningDeployments) {
    await stopDockerDeployment(db, deploymentRow)
  }

  const deploymentToken = randomUUID()
  const containerName = `jbhub-p${projectId}-${slugifyName(definitionName)}-${jobId}`

  const insertResult = db
    .prepare(
      `INSERT INTO docker_deployments (
         project_id,
         image_record_id,
         deployment_id,
         uploader_name,
         definition_name,
         container_name,
         container_port,
         host_port,
         status,
         image_reference,
         build_job_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      projectId,
      0,
      deploymentToken,
      uploaderName,
      definitionName,
      containerName,
      containerPort,
      resolveNumericPort(preferredHostPort),
      'starting',
      imageReference,
      jobId,
    )

  const deploymentId = Number(insertResult.lastInsertRowid)
  let hostPort = resolveNumericPort(preferredHostPort)
  let endpointUrl = hostPort ? `http://${DOCKER_PREVIEW_HOST}:${hostPort}` : null

  try {
    const runArgs = ['run', '-d', '--name', containerName]
    if (hostPort && containerPort) {
      runArgs.push('-p', `${hostPort}:${containerPort}`)
    } else {
      runArgs.push('-P')
    }
    runArgs.push(imageReference)

    const runResult = await runLoggedProcess(
      'docker',
      runArgs,
      {
        logPath: getBuildLogPath(jobId),
        timeoutMs: 120000,
      },
    )

    if (runResult.exitCode !== 0) {
      throw new Error(runResult.output.trim() || 'Container failed to start.')
    }

    const containerId = runResult.output.trim().split(/\s+/).filter(Boolean).at(-1) ?? null
    if (!hostPort && containerId && containerPort) {
      const portResult = await runLoggedProcess('docker', ['port', containerId, `${containerPort}/tcp`], {
        logPath: null,
        timeoutMs: 30000,
      })

      if (portResult.exitCode === 0) {
        hostPort = resolvePublishedPortFromDockerPortOutput(portResult.output)
        endpointUrl = hostPort ? `http://${DOCKER_PREVIEW_HOST}:${hostPort}` : null
      }
    }

    const ready = endpointUrl
      ? await waitForPreview({
          endpointUrl,
          healthcheckPath,
          timeoutMs:
            (Number.isFinite(Number(readinessTimeoutSec)) && Number(readinessTimeoutSec) > 0
              ? Number(readinessTimeoutSec)
              : DEFAULT_READINESS_TIMEOUT_MS / 1000) * 1000,
        })
      : false

    db.prepare(
      `UPDATE docker_deployments
       SET status = ?, container_id = ?, endpoint_url = ?, run_output = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(
      'running',
      containerId,
      endpointUrl,
      runResult.output.trim() || null,
      endpointUrl
        ? ready
          ? null
          : 'Preview is running, but the readiness check did not succeed before the timeout.'
        : 'Preview is running, but no published HTTP port was detected.',
      deploymentId,
    )

    db.prepare(
      `UPDATE docker_build_jobs
       SET status = ?, deployment_id = ?, preferred_host_port = ?, finished_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run('running', deploymentId, hostPort, jobId)

    return await enrichDeploymentRow(db.prepare('SELECT * FROM docker_deployments WHERE id = ?').get(deploymentId))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Container failed to start.'
    db.prepare(
      `UPDATE docker_deployments
       SET status = ?, error_message = ?, endpoint_url = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run('failed', message, endpointUrl, deploymentId)

    throw error
  }
}

async function runDockerComposePreview({
  db,
  jobId,
  projectId,
  definitionName,
  composeFileAbsolutePath,
  uploaderName,
  previewContainerPort,
  previewServiceName,
  healthcheckPath,
  readinessTimeoutSec,
}) {
  const runningDeployments = db
    .prepare('SELECT * FROM docker_deployments WHERE project_id = ? AND definition_name = ? AND status = ?')
    .all(projectId, definitionName, 'running')

  for (const deploymentRow of runningDeployments) {
    await stopDockerDeployment(db, deploymentRow)
  }

  const deploymentToken = randomUUID()
  const composeProjectName = `jbhub-p${projectId}-${slugifyName(definitionName)}-${jobId}`
  const imageReference = `compose:${composeProjectName}`

  const insertResult = db
    .prepare(
      `INSERT INTO docker_deployments (
         project_id,
         image_record_id,
         deployment_id,
         uploader_name,
         definition_name,
         container_name,
         container_port,
         host_port,
         status,
         image_reference,
         build_job_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      projectId,
      0,
      deploymentToken,
      uploaderName,
      definitionName,
      composeProjectName,
      null,
      null,
      'starting',
      imageReference,
      jobId,
    )

  const deploymentId = Number(insertResult.lastInsertRowid)
  const {
    previewComposePath: previewComposeFilePath,
    previewServiceName: selectedPreviewServiceName,
    previewTargetPort,
  } = await generatePreviewComposeFile({
    composeFileAbsolutePath,
    composeProjectName,
    logPath: getBuildLogPath(jobId),
    previewContainerPort,
    previewServiceName,
  })

  try {
    const upResult = await runLoggedProcess(
      'docker',
      ['compose', '-p', composeProjectName, '-f', previewComposeFilePath, 'up', '-d', '--build'],
      {
        cwd: path.dirname(composeFileAbsolutePath),
        logPath: getBuildLogPath(jobId),
        timeoutMs: DEFAULT_BUILD_TIMEOUT_MS,
      },
    )

    if (upResult.exitCode !== 0) {
      throw new Error(upResult.output.trim() || 'Compose stack failed to start.')
    }

    const psResult = await runLoggedProcess(
      'docker',
      ['compose', '-p', composeProjectName, '-f', previewComposeFilePath, 'ps', '--format', 'json'],
      {
        cwd: path.dirname(composeFileAbsolutePath),
        logPath: null,
        timeoutMs: 30000,
      },
    )

    const psEntries = parseComposePsOutput(psResult.output)
    const hostPort = resolveComposePublishedPort(psEntries, {
      preferredServiceName: selectedPreviewServiceName,
      preferredTargetPort: previewTargetPort,
    })
    const endpointUrl = hostPort ? `http://${DOCKER_PREVIEW_HOST}:${hostPort}` : null
    const ready = endpointUrl
      ? await waitForPreview({
          endpointUrl,
          healthcheckPath,
          timeoutMs:
            (Number.isFinite(Number(readinessTimeoutSec)) && Number(readinessTimeoutSec) > 0
              ? Number(readinessTimeoutSec)
              : DEFAULT_READINESS_TIMEOUT_MS / 1000) * 1000,
        })
      : false

    const containerListResult = await runLoggedProcess(
      'docker',
      ['ps', '-aq', '--filter', `label=com.docker.compose.project=${composeProjectName}`],
      {
        logPath: null,
        timeoutMs: 30000,
      },
    )

    const containerId = containerListResult.output
      .split(/\s+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .at(-1) ?? null

    db.prepare(
      `UPDATE docker_deployments
       SET status = ?, container_id = ?, host_port = ?, endpoint_url = ?, run_output = ?, image_reference = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(
      'running',
      containerId,
      hostPort,
      endpointUrl,
      upResult.output.trim() || null,
      imageReference,
      endpointUrl
        ? ready
          ? null
          : 'Compose stack is running, but the readiness check did not succeed before the timeout.'
        : 'Compose stack is running, but no published HTTP port was detected.',
      deploymentId,
    )

    db.prepare(
      `UPDATE docker_build_jobs
       SET status = ?, deployment_id = ?, preferred_host_port = ?, image_reference = ?, finished_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run('running', deploymentId, hostPort, imageReference, jobId)

    return await enrichDeploymentRow(db.prepare('SELECT * FROM docker_deployments WHERE id = ?').get(deploymentId), {
      preferredServiceName: selectedPreviewServiceName,
      preferredTargetPort: previewTargetPort,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Compose stack failed to start.'
    db.prepare(
      `UPDATE docker_deployments
       SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run('failed', message, deploymentId)

    throw error
  } finally {
    try {
      await fs.promises.rm(previewComposeFilePath, { force: true })
    } catch {
      // Ignore preview compose cleanup errors.
    }
  }
}

async function processDockerBuildJob(db, jobRow) {
  const jobId = Number(jobRow.id)
  const projectId = Number(jobRow.project_id)
  const definitionName = String(jobRow.definition_name ?? jobRow.source_file_name ?? '')
  const definitionDir = getProjectContainerDirectory(projectId, definitionName)
  const logPath = getBuildLogPath(jobId)
  const buildContextRoot = getBuildContextPath(jobId)

  await ensureDirectory(DOCKER_LOGS_ROOT)
  await ensureDirectory(DOCKER_CONTEXTS_ROOT)
  await ensureDirectory(DOCKER_ARTIFACTS_ROOT)
  await removeDirectoryContents(logPath)
  await fs.promises.writeFile(logPath, `# JB Hub build job ${jobId}\n`, 'utf8')

  db.prepare(
    'UPDATE docker_build_jobs SET status = ?, started_at = CURRENT_TIMESTAMP, log_path = ?, error_message = NULL WHERE id = ?',
  ).run('building', logPath, jobId)

  if (!pathExists(definitionDir)) {
    db.prepare(
      'UPDATE docker_build_jobs SET status = ?, error_message = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?',
    ).run('failed', 'The container definition no longer exists.', jobId)
    return
  }

  const metadata = await readContainerMetadata(definitionDir)
  const metadataBuild = metadata.data?.build ?? {}
  const metadataRun = metadata.data?.run ?? {}
  const composeFileName = findComposeFileName(definitionDir)
  const dockerfilePath = normalizeProjectRelativePath(jobRow.dockerfile_path ?? metadataBuild.dockerfile ?? 'Dockerfile', 'Dockerfile')
  const contextPath = normalizeProjectRelativePath(jobRow.context_path ?? metadataBuild.context ?? '.', '.')
  const requestedContainerPort =
    resolveNumericPort(jobRow.container_port) ??
    resolveNumericPort(jobRow.requested_container_port) ??
    resolveNumericPort(metadataRun.containerPort)

  await removeDirectoryContents(buildContextRoot)
  await fs.promises.cp(definitionDir, buildContextRoot, { recursive: true, force: true })

  const dockerfileAbsolutePath = path.join(buildContextRoot, dockerfilePath)
  const composeFileAbsolutePath = composeFileName ? path.join(buildContextRoot, composeFileName) : null
  const contextAbsolutePath = path.join(buildContextRoot, contextPath)
  const dockerfileContents = await readTextFileIfExists(dockerfileAbsolutePath)
  const containerPort = requestedContainerPort ?? inferPortFromDockerfileContents(dockerfileContents)

  if (composeFileAbsolutePath && pathExists(composeFileAbsolutePath)) {
    try {
      const offlineImageLoadMessage = await loadOfflineImagesIfPresent(buildContextRoot, logPath)
      if (offlineImageLoadMessage) {
        appendToLogFile(logPath, `\n${offlineImageLoadMessage}\n`)
      }

      await runDockerComposePreview({
        db,
        jobId,
        projectId,
        definitionName,
        composeFileAbsolutePath,
        uploaderName: String(jobRow.uploader_name ?? ''),
        previewContainerPort: containerPort,
        previewServiceName:
          typeof metadataRun.previewService === 'string' && metadataRun.previewService.trim()
            ? metadataRun.previewService.trim()
            : null,
        healthcheckPath:
          typeof metadataRun.healthcheckPath === 'string' && metadataRun.healthcheckPath.trim()
            ? metadataRun.healthcheckPath.trim()
            : null,
        readinessTimeoutSec: resolveNumericPort(metadataRun.readinessTimeoutSec),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Compose preview deployment failed.'
      db.prepare(
        'UPDATE docker_build_jobs SET status = ?, error_message = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?',
      ).run('failed', message, jobId)
      appendToLogFile(logPath, `\nCompose deployment error: ${message}\n`)
    }

    return
  }

  if (!pathExists(dockerfileAbsolutePath)) {
    db.prepare(
      'UPDATE docker_build_jobs SET status = ?, error_message = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?',
    ).run('failed', 'Dockerfile could not be found for the selected definition.', jobId)
    return
  }

  if (!pathExists(contextAbsolutePath)) {
    db.prepare(
      'UPDATE docker_build_jobs SET status = ?, error_message = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?',
    ).run('failed', 'Build context could not be found for the selected definition.', jobId)
    return
  }

  if (!containerPort) {
    db.prepare(
      'UPDATE docker_build_jobs SET status = ?, error_message = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?',
    ).run('failed', 'Container port could not be inferred. Add EXPOSE or jbhub.container metadata.', jobId)
    return
  }

  const dockerRuntime = await getDockerRuntimeStatus()
  if (!dockerRuntime.available) {
    db.prepare(
      'UPDATE docker_build_jobs SET status = ?, error_message = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?',
    ).run('failed', dockerRuntime.error || 'Docker engine is unavailable.', jobId)
    appendToLogFile(logPath, `\nDocker runtime error: ${dockerRuntime.error || 'Docker engine is unavailable.'}\n`)
    return
  }

  const imageName = slugifyName(jobRow.image_name || `jbhub-project-${projectId}-${definitionName}`)
  const imageTag = slugifyName(jobRow.image_tag || `job-${jobId}`)
  const imageReference = `${imageName}:${imageTag}`

  db.prepare(
    `UPDATE docker_build_jobs
     SET image_name = ?, image_tag = ?, image_reference = ?, container_port = ?, context_path = ?, dockerfile_path = ?
     WHERE id = ?`,
  ).run(imageName, imageTag, imageReference, containerPort, contextPath, dockerfilePath, jobId)

  const buildResult = await runLoggedProcess(
    'docker',
    ['build', '--pull=false', '-f', dockerfileAbsolutePath, '-t', imageReference, contextAbsolutePath],
    {
      cwd: buildContextRoot,
      logPath,
      timeoutMs: DEFAULT_BUILD_TIMEOUT_MS,
    },
  )

  if (buildResult.exitCode !== 0) {
    db.prepare(
      'UPDATE docker_build_jobs SET status = ?, error_message = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?',
    ).run('failed', buildResult.output.trim() || 'Docker build failed.', jobId)
    return
  }

  try {
    await runDockerPreview({
      db,
      jobId,
      projectId,
      definitionName,
      imageReference,
      uploaderName: String(jobRow.uploader_name ?? ''),
      containerPort,
      preferredHostPort: resolveNumericPort(jobRow.preferred_host_port),
      healthcheckPath:
        typeof metadataRun.healthcheckPath === 'string' && metadataRun.healthcheckPath.trim()
          ? metadataRun.healthcheckPath.trim()
          : null,
      readinessTimeoutSec: resolveNumericPort(metadataRun.readinessTimeoutSec),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Preview deployment failed.'
    db.prepare(
      'UPDATE docker_build_jobs SET status = ?, error_message = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?',
    ).run('failed', message, jobId)
    appendToLogFile(logPath, `\nPreview deployment error: ${message}\n`)
  }
}

export function attachProjectContainerRoutes(app, { db, jwt, jwtSecret }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS docker_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      definition_name TEXT NOT NULL,
      image_reference TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );
  `)

  for (const migrationSql of [
    'ALTER TABLE docker_build_jobs ADD COLUMN definition_name TEXT',
    'ALTER TABLE docker_build_jobs ADD COLUMN log_path TEXT',
    'ALTER TABLE docker_build_jobs ADD COLUMN deployment_id INTEGER',
    'ALTER TABLE docker_deployments ADD COLUMN definition_name TEXT',
    'ALTER TABLE docker_deployments ADD COLUMN container_id TEXT',
    'ALTER TABLE docker_deployments ADD COLUMN endpoint_url TEXT',
    'ALTER TABLE docker_deployments ADD COLUMN image_reference TEXT',
    'ALTER TABLE docker_deployments ADD COLUMN build_job_id INTEGER',
    'ALTER TABLE docker_deployments ADD COLUMN run_output TEXT',
    'ALTER TABLE docker_deployments ADD COLUMN error_message TEXT',
    'ALTER TABLE docker_deployments ADD COLUMN stopped_at DATETIME',
  ]) {
    try {
      db.exec(migrationSql)
    } catch {
      // Ignore duplicate column errors.
    }
  }

  const workerState = {
    active: false,
    stopped: false,
    timer: null,
  }

  async function pumpDockerBuildJobs() {
    if (workerState.active || workerState.stopped) {
      return
    }

    workerState.active = true
    try {
      while (!workerState.stopped) {
        const nextJob = db.prepare('SELECT * FROM docker_build_jobs WHERE status = ? ORDER BY id ASC LIMIT 1').get('queued')
        if (!nextJob) {
          break
        }
        await processDockerBuildJob(db, nextJob)
      }
    } finally {
      workerState.active = false
    }
  }

  function scheduleBuildPump() {
    void pumpDockerBuildJobs()
  }

  workerState.timer = setInterval(scheduleBuildPump, BUILD_POLL_INTERVAL_MS)
  scheduleBuildPump()

  function readProjectById(projectId) {
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId)
  }

  app.get('/api/v1/projects/:id/containers', async (req, res, next) => {
    const projectId = Number.parseInt(String(req.params.id), 10)
    if (!Number.isFinite(projectId) || projectId <= 0) {
      return res.status(400).json({ error: 'Invalid project id.' })
    }

    try {
      const project = readProjectById(projectId)
      if (!project) {
        return res.status(404).json({ error: 'Project not found.' })
      }

      return res.json({
        docker: await getDockerRuntimeStatus(),
        definitions: await scanProjectContainerDefinitions(projectId, db),
        buildJobs: db.prepare('SELECT * FROM docker_build_jobs WHERE project_id = ? ORDER BY id DESC LIMIT 20').all(projectId).map(serializeBuildJob),
        deployments: await Promise.all(
          db
            .prepare('SELECT * FROM docker_deployments WHERE project_id = ? ORDER BY id DESC LIMIT 20')
            .all(projectId)
            .map((row) => enrichDeploymentRow(row)),
        ),
      })
    } catch (error) {
      return next(error)
    }
  })

  app.post('/api/v1/projects/:id/containers/upload', async (req, res, next) => {
    const projectId = Number.parseInt(String(req.params.id), 10)
    if (!Number.isFinite(projectId) || projectId <= 0) {
      return res.status(400).json({ error: 'Invalid project id.' })
    }

    try {
      const project = readProjectById(projectId)
      if (!project) {
        return res.status(404).json({ error: 'Project not found.' })
      }

      if (!hasProjectWriteAccess({ req, project, jwt, jwtSecret })) {
        return res.status(403).json({ error: 'Only the project author can manage containers.' })
      }

      const uploadedDockerfile =
        req.files && req.files.dockerfile
          ? Array.isArray(req.files.dockerfile)
            ? req.files.dockerfile[0]
            : req.files.dockerfile
          : null
      const uploadedComposeFile =
        req.files && req.files.composeFile
          ? Array.isArray(req.files.composeFile)
            ? req.files.composeFile[0]
            : req.files.composeFile
          : null
      const uploadedContextTar =
        req.files && req.files.contextTar
          ? Array.isArray(req.files.contextTar)
            ? req.files.contextTar[0]
            : req.files.contextTar
          : null

      if (!req.files || (!req.files.files && !uploadedDockerfile && !uploadedComposeFile && !uploadedContextTar)) {
        return res.status(400).json({ error: 'Upload Dockerfile + compose, Dockerfile + compose + tar, compose + tar, or a Dockerfile.' })
      }

      const relativePaths = normalizeUploadedRelativePaths(req.body?.relativePaths)
      const requestedDefinitionName = sanitizePathSegment(req.body?.definitionName, 'main')

      if (uploadedDockerfile && uploadedComposeFile && uploadedContextTar && !req.files.files) {
        const definitionDir = getProjectContainerDirectory(projectId, requestedDefinitionName)
        const archivePath = path.join(
          DOCKER_ARTIFACTS_ROOT,
          `${requestedDefinitionName}-${Date.now()}-${sanitizePathSegment(uploadedContextTar.name, 'context.tar')}`,
        )

        await removeDirectoryContents(definitionDir)
        await ensureDirectory(definitionDir)
        await ensureDirectory(DOCKER_ARTIFACTS_ROOT)
        await uploadedContextTar.mv(archivePath)

        try {
          await extractContextArchive(archivePath, definitionDir)
          await writeContainerDefinitionEntryFiles({
            definitionDir,
            uploadedDockerfile,
            uploadedComposeFile,
          })
        } catch (error) {
          await removeDirectoryContents(definitionDir)
          await removeDirectoryContents(archivePath)
          throw error
        }

        await removeDirectoryContents(archivePath)

        return res.status(201).json({
          uploadedDefinitionName: requestedDefinitionName,
          definitions: await scanProjectContainerDefinitions(projectId, db),
        })
      }

      if (uploadedDockerfile && uploadedComposeFile && !uploadedContextTar && !req.files.files) {
        const definitionDir = getProjectContainerDirectory(projectId, requestedDefinitionName)
        await writeContainerDefinitionEntryFiles({
          definitionDir,
          uploadedDockerfile,
          uploadedComposeFile,
        })

        return res.status(201).json({
          uploadedDefinitionName: requestedDefinitionName,
          definitions: await scanProjectContainerDefinitions(projectId, db),
        })
      }

      if (uploadedComposeFile || uploadedContextTar) {
        if (!uploadedComposeFile || !uploadedContextTar) {
          return res.status(400).json({ error: 'Upload both a compose file and a tar archive.' })
        }

        const definitionDir = getProjectContainerDirectory(projectId, requestedDefinitionName)
        const archivePath = path.join(
          DOCKER_ARTIFACTS_ROOT,
          `${requestedDefinitionName}-${Date.now()}-${sanitizePathSegment(uploadedContextTar.name, 'context.tar')}`,
        )

        await removeDirectoryContents(definitionDir)
        await ensureDirectory(definitionDir)
        await ensureDirectory(DOCKER_ARTIFACTS_ROOT)
        await uploadedContextTar.mv(archivePath)

        try {
          await extractContextArchive(archivePath, definitionDir)
          await writeContainerDefinitionEntryFiles({
            definitionDir,
            uploadedComposeFile,
          })
        } catch (error) {
          await removeDirectoryContents(definitionDir)
          await removeDirectoryContents(archivePath)
          throw error
        }

        await removeDirectoryContents(archivePath)

        return res.status(201).json({
          uploadedDefinitionName: requestedDefinitionName,
          definitions: await scanProjectContainerDefinitions(projectId, db),
        })
      }

      if (uploadedDockerfile && !req.files.files) {
        const definitionDir = getProjectContainerDirectory(projectId, requestedDefinitionName)
        await ensureDirectory(definitionDir)
        await uploadedDockerfile.mv(path.join(definitionDir, 'Dockerfile'))

        return res.status(201).json({
          uploadedDefinitionName: requestedDefinitionName,
          definitions: await scanProjectContainerDefinitions(projectId, db),
        })
      }

      const uploadedFiles = Array.isArray(req.files.files) ? req.files.files : [req.files.files]

      const preparedFiles = uploadedFiles.map((uploadedFile, index) => {
        const fallbackName = sanitizePathSegment(uploadedFile.name, `file-${index + 1}`)
        const requestedPath = normalizeProjectRelativePath(relativePaths[index] ?? fallbackName, fallbackName)
        const segments = requestedPath.split('/').filter(Boolean)
        return {
          uploadedFile,
          definitionName: segments.length > 1 ? sanitizePathSegment(segments[0], requestedDefinitionName) : requestedDefinitionName,
          relativeFilePath: segments.length > 1 ? segments.slice(1).join('/') : normalizeProjectRelativePath(requestedPath, fallbackName),
        }
      })

      const definitionNames = Array.from(new Set(preparedFiles.map((item) => item.definitionName)))
      if (definitionNames.length !== 1) {
        return res.status(400).json({ error: 'Upload one container bundle at a time.' })
      }

      const definitionName = definitionNames[0]
      const definitionDir = getProjectContainerDirectory(projectId, definitionName)
      await removeDirectoryContents(definitionDir)
      await ensureDirectory(definitionDir)

      let hasDockerfile = false
      for (const item of preparedFiles) {
        if (isRestrictedContainerPath(item.relativeFilePath)) {
          return res.status(400).json({ error: 'Sensitive files cannot be uploaded in a container bundle.' })
        }

        const targetPath = path.join(definitionDir, item.relativeFilePath)
        const relativeToDefinition = path.relative(definitionDir, targetPath)
        if (relativeToDefinition.startsWith('..') || path.isAbsolute(relativeToDefinition)) {
          return res.status(400).json({ error: 'Invalid container file path.' })
        }

        await ensureDirectory(path.dirname(targetPath))
        await item.uploadedFile.mv(targetPath)
        if (path.basename(targetPath).toLowerCase() === 'dockerfile') {
          hasDockerfile = true
        }
      }

      if (!hasDockerfile && !pathExists(path.join(definitionDir, 'Dockerfile'))) {
        await removeDirectoryContents(definitionDir)
        return res.status(400).json({ error: 'Dockerfile is required in the uploaded container bundle.' })
      }

      return res.status(201).json({
        uploadedDefinitionName: definitionName,
        definitions: await scanProjectContainerDefinitions(projectId, db),
      })
    } catch (error) {
      return next(error)
    }
  })

  app.post('/api/v1/projects/:id/containers/build', async (req, res, next) => {
    const projectId = Number.parseInt(String(req.params.id), 10)
    if (!Number.isFinite(projectId) || projectId <= 0) {
      return res.status(400).json({ error: 'Invalid project id.' })
    }

    try {
      const project = readProjectById(projectId)
      if (!project) {
        return res.status(404).json({ error: 'Project not found.' })
      }

      if (!hasProjectWriteAccess({ req, project, jwt, jwtSecret })) {
        return res.status(403).json({ error: 'Only the project author can manage containers.' })
      }

      const definitionName = sanitizePathSegment(req.body?.definitionName, '')
      if (!definitionName) {
        return res.status(400).json({ error: 'definitionName is required.' })
      }

      const definitionDir = getProjectContainerDirectory(projectId, definitionName)
      if (!pathExists(definitionDir)) {
        return res.status(404).json({ error: 'Container definition not found.' })
      }

      const detectedDockerfileName = findDockerfileName(definitionDir)

      const result = db.prepare(
        `INSERT INTO docker_build_jobs (
           project_id, uploader_name, source_file_name, source_archive_path, dockerfile_path, context_path,
           image_name, image_tag, requested_container_port, preferred_host_port, status, definition_name
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        projectId,
        readProjectActorName(req) || String(project.author ?? ''),
        definitionName,
        definitionDir,
        normalizeProjectRelativePath(req.body?.dockerfilePath ?? detectedDockerfileName ?? 'Dockerfile', 'Dockerfile'),
        normalizeProjectRelativePath(req.body?.contextPath ?? '.', '.'),
        slugifyName(`jbhub-project-${projectId}-${definitionName}`),
        `job-${Date.now()}`,
        resolveNumericPort(req.body?.containerPort),
        resolveNumericPort(req.body?.preferredHostPort),
        'queued',
        definitionName,
      )

      const job = serializeBuildJob(db.prepare('SELECT * FROM docker_build_jobs WHERE id = ?').get(Number(result.lastInsertRowid)))
      scheduleBuildPump()
      return res.status(202).json({ job })
    } catch (error) {
      return next(error)
    }
  })

  app.get('/api/v1/containers/build-jobs/:jobId/logs', async (req, res, next) => {
    const jobId = Number.parseInt(String(req.params.jobId), 10)
    if (!Number.isFinite(jobId) || jobId <= 0) {
      return res.status(400).json({ error: 'Invalid job id.' })
    }

    try {
      const row = db.prepare('SELECT * FROM docker_build_jobs WHERE id = ?').get(jobId)
      if (!row) {
        return res.status(404).json({ error: 'Build job not found.' })
      }

      const logPath = row.log_path ? String(row.log_path) : getBuildLogPath(jobId)
      return res.json({
        job: serializeBuildJob(row),
        logs: (await readTextFileIfExists(logPath)) ?? '',
      })
    } catch (error) {
      return next(error)
    }
  })

  app.post('/api/v1/containers/deployments/:deploymentId/:action', async (req, res, next) => {
    const deploymentId = Number.parseInt(String(req.params.deploymentId), 10)
    const action = String(req.params.action ?? '')
    if (!Number.isFinite(deploymentId) || deploymentId <= 0) {
      return res.status(400).json({ error: 'Invalid deployment id.' })
    }
    if (!['start', 'stop', 'restart'].includes(action)) {
      return res.status(400).json({ error: 'Invalid deployment action.' })
    }

    try {
      const deploymentRow = db.prepare('SELECT * FROM docker_deployments WHERE id = ?').get(deploymentId)
      if (!deploymentRow) {
        return res.status(404).json({ error: 'Deployment not found.' })
      }

      const project = readProjectById(Number(deploymentRow.project_id))
      if (!project) {
        return res.status(404).json({ error: 'Project not found.' })
      }
      if (!hasProjectWriteAccess({ req, project, jwt, jwtSecret })) {
        return res.status(403).json({ error: 'Only the project author can manage containers.' })
      }

      if (action === 'stop') {
        return res.json({ deployment: await stopDockerDeployment(db, deploymentRow) })
      }

      if (!deploymentRow.image_reference) {
        return res.status(400).json({ error: 'This deployment cannot be started because no image is recorded.' })
      }

      if (action === 'restart' && deploymentRow.status === 'running') {
        await stopDockerDeployment(db, deploymentRow)
      }

       const imageReference = String(deploymentRow.image_reference ?? '')
       if (imageReference.startsWith('compose:')) {
         const definitionName = String(deploymentRow.definition_name ?? '')
         const definitionDir = getProjectContainerDirectory(Number(deploymentRow.project_id), definitionName)
         const composeFileName = findComposeFileName(definitionDir)
         const metadata = await readContainerMetadata(definitionDir)
         const metadataRun = metadata.data?.run ?? {}
         if (!composeFileName) {
           return res.status(400).json({ error: 'Compose file could not be found for this deployment.' })
         }

         return res.json({
           deployment: await runDockerComposePreview({
             db,
             jobId: Number(deploymentRow.build_job_id ?? 0) || Number(deploymentRow.id),
             projectId: Number(deploymentRow.project_id),
             definitionName,
             composeFileAbsolutePath: path.join(definitionDir, composeFileName),
             uploaderName: String(deploymentRow.uploader_name ?? ''),
             previewContainerPort: resolveNumericPort(deploymentRow.container_port),
             previewServiceName:
               typeof metadataRun.previewService === 'string' && metadataRun.previewService.trim()
                 ? metadataRun.previewService.trim()
                 : null,
             healthcheckPath:
               typeof metadataRun.healthcheckPath === 'string' && metadataRun.healthcheckPath.trim()
                 ? metadataRun.healthcheckPath.trim()
                 : null,
             readinessTimeoutSec: resolveNumericPort(metadataRun.readinessTimeoutSec),
           }),
         })
       }

      return res.json({
        deployment: await runDockerPreview({
          db,
          jobId: Number(deploymentRow.build_job_id ?? 0) || Number(deploymentRow.id),
          projectId: Number(deploymentRow.project_id),
          definitionName: String(deploymentRow.definition_name ?? ''),
          imageReference: String(deploymentRow.image_reference),
          uploaderName: String(deploymentRow.uploader_name ?? ''),
          containerPort: resolveNumericPort(deploymentRow.container_port),
          preferredHostPort: resolveNumericPort(deploymentRow.host_port),
          healthcheckPath: null,
          readinessTimeoutSec: null,
        }),
      })
    } catch (error) {
      return next(error)
    }
  })

  app.use('/api/v1/container-previews/:deploymentToken', async (req, res, next) => {
    try {
      const token = String(req.params.deploymentToken ?? '')
      const deployment = db.prepare('SELECT * FROM docker_deployments WHERE deployment_id = ? LIMIT 1').get(token)
      if (!deployment || deployment.status !== 'running') {
        return res.status(404).send('Preview is not available.')
      }

      const enrichedDeployment = await enrichDeploymentRow(deployment)
      const requestUrl = new URL(`http://preview.local${req.originalUrl}`)
      const proxyBasePath = buildContainerPreviewPath(token).replace(/\/$/, '')
      const serviceBasePath = `${proxyBasePath}/services/`

      let targetHostPort = enrichedDeployment.hostPort
      let forwardPath = requestUrl.pathname.slice(proxyBasePath.length) || '/'

      if (requestUrl.pathname.startsWith(serviceBasePath)) {
        const serviceRemainder = requestUrl.pathname.slice(serviceBasePath.length)
        const [encodedServiceName, ...pathSegments] = serviceRemainder.split('/')
        const requestedServiceName = decodeURIComponent(encodedServiceName || '').trim()
        if (!requestedServiceName) {
          return res.status(404).send('Preview service was not specified.')
        }

        const selectedService = (enrichedDeployment.serviceEndpoints ?? []).find(
          (serviceEndpoint) =>
            normalizeComposeServiceName(serviceEndpoint.serviceName) === normalizeComposeServiceName(requestedServiceName),
        )

        if (!selectedService?.hostPort) {
          return res.status(404).send('Preview service is not available.')
        }

        targetHostPort = selectedService.hostPort
        const normalizedForwardPath = pathSegments.join('/')
        forwardPath = normalizedForwardPath ? `/${normalizedForwardPath}` : '/'
      }

      if (!targetHostPort) {
        return res.status(404).send('Preview is not available.')
      }

      const targetUrl = `http://${DOCKER_PREVIEW_HOST}:${targetHostPort}${forwardPath}${requestUrl.search}`

      const headers = new Headers()
      for (const [key, value] of Object.entries(req.headers)) {
        if (!value) continue
        const normalizedKey = key.toLowerCase()
        if (['host', 'connection', 'content-length', 'accept-encoding'].includes(normalizedKey)) continue
        headers.set(key, Array.isArray(value) ? value.join(', ') : String(value))
      }

      let body
      if (!['GET', 'HEAD'].includes(req.method)) {
        if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
          body = req.body
        } else if (req.body && Object.keys(req.body).length > 0) {
          body = headers.get('content-type')?.includes('application/json') ? JSON.stringify(req.body) : new URLSearchParams(req.body)
        }
      }

      const response = await fetch(targetUrl, {
        method: req.method,
        headers,
        body,
        redirect: 'manual',
        duplex: body ? 'half' : undefined,
      })

      res.status(response.status)
      for (const [key, value] of response.headers) {
        const normalizedKey = key.toLowerCase()
        if (['content-security-policy', 'x-frame-options', 'content-encoding'].includes(normalizedKey)) continue
        res.setHeader(key, value)
      }

      if (!response.body) {
        res.end()
        return
      }

      Readable.fromWeb(response.body).pipe(res)
    } catch (error) {
      return next(error)
    }
  })

  return {
    stop() {
      workerState.stopped = true
      if (workerState.timer) {
        clearInterval(workerState.timer)
      }
    },
  }
}
