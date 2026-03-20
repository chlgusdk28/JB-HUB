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
const CONTAINER_META_FILE_NAMES = ['jbhub.container.json', 'jbhub.container.yml', 'jbhub.container.yaml']
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

function serializeDeployment(row) {
  const hostPort = resolveNumericPort(row.host_port)
  return {
    id: Number(row.id),
    projectId: Number(row.project_id),
    buildJobId: Number.isFinite(Number(row.build_job_id)) ? Number(row.build_job_id) : null,
    definitionName: row.definition_name ? String(row.definition_name) : '',
    deploymentToken: row.deployment_id ? String(row.deployment_id) : String(row.id),
    uploaderName: row.uploader_name ? String(row.uploader_name) : '',
    containerName: row.container_name ? String(row.container_name) : null,
    containerId: row.container_id ? String(row.container_id) : null,
    containerPort: resolveNumericPort(row.container_port),
    hostPort,
    imageReference: row.image_reference ? String(row.image_reference) : null,
    status: row.status ? String(row.status) : 'stopped',
    endpointUrl: row.endpoint_url ? String(row.endpoint_url) : hostPort ? `http://127.0.0.1:${hostPort}` : null,
    sitePreviewUrl: row.deployment_id ? `/api/v1/container-previews/${row.deployment_id}/` : null,
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

  const deploymentsByDefinition = new Map()
  for (const row of db.prepare('SELECT * FROM docker_deployments WHERE project_id = ? ORDER BY id DESC').all(projectId)) {
    const definitionName = String(row.definition_name ?? '')
    if (!definitionName || deploymentsByDefinition.has(definitionName)) {
      continue
    }
    deploymentsByDefinition.set(definitionName, serializeDeployment(row))
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
    const dockerfilePath = normalizeProjectRelativePath(metadataBuild.dockerfile ?? 'Dockerfile', 'Dockerfile')
    const contextPath = normalizeProjectRelativePath(metadataBuild.context ?? '.', '.')
    const dockerfileAbsolutePath = path.join(definitionDir, dockerfilePath)

    if (!pathExists(dockerfileAbsolutePath)) {
      continue
    }

    const dockerfileContents = await readTextFileIfExists(dockerfileAbsolutePath)
    const containerPort = resolveNumericPort(metadataRun.containerPort) ?? inferPortFromDockerfileContents(dockerfileContents)
    const warnings = [...metadata.warnings]
    if (!pathExists(path.join(definitionDir, '.dockerignore'))) {
      warnings.push('.dockerignore is recommended.')
    }
    if (!containerPort) {
      warnings.push('Container port could not be inferred. Add EXPOSE or container metadata.')
    }

    const files = await listContainerDefinitionFiles(definitionDir)
    if (files.length <= 2 && dockerfileNeedsLocalContext(dockerfileContents)) {
      warnings.push('This Dockerfile uses COPY or ADD. Upload the matching context files before building.')
    }

    definitions.push({
      name: definitionName,
      rootPath: `${CONTAINER_ROOT_DIR}/${definitionName}`,
      dockerfilePath: `${CONTAINER_ROOT_DIR}/${definitionName}/${dockerfilePath}`,
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
      activeDeployment: deploymentsByDefinition.get(definitionName) ?? null,
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

async function stopDockerDeployment(db, deploymentRow, { remove = true } = {}) {
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

  const hostPort = await allocatePort(preferredHostPort)
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
      hostPort,
      'starting',
      imageReference,
      jobId,
    )

  const deploymentId = Number(insertResult.lastInsertRowid)
  const endpointUrl = `http://127.0.0.1:${hostPort}`

  try {
    const runResult = await runLoggedProcess(
      'docker',
      ['run', '-d', '--name', containerName, '-p', `${hostPort}:${containerPort}`, imageReference],
      {
        logPath: getBuildLogPath(jobId),
        timeoutMs: 120000,
      },
    )

    if (runResult.exitCode !== 0) {
      throw new Error(runResult.output.trim() || 'Container failed to start.')
    }

    const containerId = runResult.output.trim().split(/\s+/).filter(Boolean).at(-1) ?? null
    const ready = await waitForPreview({
      endpointUrl,
      healthcheckPath,
      timeoutMs:
        (Number.isFinite(Number(readinessTimeoutSec)) && Number(readinessTimeoutSec) > 0
          ? Number(readinessTimeoutSec)
          : DEFAULT_READINESS_TIMEOUT_MS / 1000) * 1000,
    })

    db.prepare(
      `UPDATE docker_deployments
       SET status = ?, container_id = ?, endpoint_url = ?, run_output = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(
      'running',
      containerId,
      endpointUrl,
      runResult.output.trim() || null,
      ready ? null : 'Preview is running, but the readiness check did not succeed before the timeout.',
      deploymentId,
    )

    db.prepare(
      `UPDATE docker_build_jobs
       SET status = ?, deployment_id = ?, preferred_host_port = ?, finished_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run('running', deploymentId, hostPort, jobId)

    return serializeDeployment(db.prepare('SELECT * FROM docker_deployments WHERE id = ?').get(deploymentId))
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
  const dockerfilePath = normalizeProjectRelativePath(jobRow.dockerfile_path ?? metadataBuild.dockerfile ?? 'Dockerfile', 'Dockerfile')
  const contextPath = normalizeProjectRelativePath(jobRow.context_path ?? metadataBuild.context ?? '.', '.')
  const requestedContainerPort =
    resolveNumericPort(jobRow.container_port) ??
    resolveNumericPort(jobRow.requested_container_port) ??
    resolveNumericPort(metadataRun.containerPort)

  await removeDirectoryContents(buildContextRoot)
  await fs.promises.cp(definitionDir, buildContextRoot, { recursive: true, force: true })

  const dockerfileAbsolutePath = path.join(buildContextRoot, dockerfilePath)
  const contextAbsolutePath = path.join(buildContextRoot, contextPath)
  const dockerfileContents = await readTextFileIfExists(dockerfileAbsolutePath)
  const containerPort = requestedContainerPort ?? inferPortFromDockerfileContents(dockerfileContents)

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
        deployments: db.prepare('SELECT * FROM docker_deployments WHERE project_id = ? ORDER BY id DESC LIMIT 20').all(projectId).map(serializeDeployment),
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

      if (!req.files || (!req.files.files && !uploadedDockerfile)) {
        return res.status(400).json({ error: 'Dockerfile or container files are required.' })
      }

      const relativePaths = normalizeUploadedRelativePaths(req.body?.relativePaths)
      const requestedDefinitionName = sanitizePathSegment(req.body?.definitionName, 'main')

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
        normalizeProjectRelativePath(req.body?.dockerfilePath ?? 'Dockerfile', 'Dockerfile'),
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
      if (!deployment || !deployment.host_port || deployment.status !== 'running') {
        return res.status(404).send('Preview is not available.')
      }

      const requestUrl = new URL(`http://preview.local${req.originalUrl}`)
      const proxyBasePath = `/api/v1/container-previews/${token}`
      const forwardPath = requestUrl.pathname.slice(proxyBasePath.length) || '/'
      const targetUrl = `http://127.0.0.1:${deployment.host_port}${forwardPath}${requestUrl.search}`

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
