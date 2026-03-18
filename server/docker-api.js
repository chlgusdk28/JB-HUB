import express from 'express'
import fileUpload from 'express-fileupload'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const DOCKER_UPLOADS_ROOT = path.join(process.cwd(), 'docker-uploads', 'projects')
const DOCKER_TEMP_DIR = path.join(process.cwd(), 'docker-temp')
const DOCKER_UPLOAD_LIMIT_BYTES = 1536 * 1024 * 1024
const DEFAULT_LOG_TAIL = 200
const PORT_RANGE_START = 46000
const PORT_RANGE_END = 48999
const DOCKER_LABEL_PREFIX = 'jb.hub'
const DOCKER_BUILD_EXTRACT_ROOT = path.join(DOCKER_TEMP_DIR, 'build-jobs')
const DOCKER_COMPOSE_DEPLOY_ROOT = path.join(DOCKER_TEMP_DIR, 'compose-deployments')
const DOCKER_BUILD_WORKER_POLL_MS = 3000
const DOCKER_BUILD_MAX_BUFFER_BYTES = 50 * 1024 * 1024
const DOCKER_BUILD_LOG_EXCERPT_LENGTH = 4000
const DOCKER_COMPOSE_MAX_BUFFER_BYTES = 20 * 1024 * 1024

fs.mkdirSync(DOCKER_UPLOADS_ROOT, { recursive: true })
fs.mkdirSync(DOCKER_TEMP_DIR, { recursive: true })
fs.mkdirSync(DOCKER_BUILD_EXTRACT_ROOT, { recursive: true })
fs.mkdirSync(DOCKER_COMPOSE_DEPLOY_ROOT, { recursive: true })

function formatBytes(bytes) {
  const numericValue = Number(bytes)
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = numericValue
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function sanitizeFileName(fileName) {
  const baseName = path.basename(String(fileName || 'image.tar'))
  const sanitized = baseName.replace(/[^A-Za-z0-9._-]/g, '_')
  return sanitized.length > 0 ? sanitized : 'image.tar'
}

function isSupportedDockerArchiveFileName(fileName) {
  const normalized = path.basename(String(fileName || '')).trim().toLowerCase()
  return normalized.endsWith('.tar') || normalized.endsWith('.tar.gz') || normalized.endsWith('.tgz')
}

function isEnvironmentConfigFileName(fileName) {
  const normalized = path.basename(String(fileName || '')).trim().toLowerCase()
  return Boolean(normalized) && /(^|[._-])env([._-].+)?$/i.test(normalized)
}

function isComposeConfigFileName(fileName) {
  const normalized = path.basename(String(fileName || '')).trim().toLowerCase()
  return Boolean(normalized) && (normalized.endsWith('.yml') || normalized.endsWith('.yaml'))
}

function isSupportedDockerSourceBundleFileName(fileName) {
  return isSupportedDockerArchiveFileName(fileName)
}

function parseComposeServiceNames(rawValue) {
  const lines = String(rawValue || '').split(/\r?\n/)
  const serviceNames = []
  let servicesIndent = null
  let serviceIndent = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const currentIndent = line.match(/^\s*/)?.[0]?.length ?? 0

    if (servicesIndent === null) {
      if (/^services\s*:\s*$/i.test(trimmed)) {
        servicesIndent = currentIndent
      }
      continue
    }

    if (currentIndent <= servicesIndent) {
      break
    }

    const serviceMatch = line.match(/^(\s+)([A-Za-z0-9._-]+)\s*:\s*$/)
    if (!serviceMatch) {
      continue
    }

    const nextServiceIndent = serviceMatch[1].length
    if (serviceIndent === null) {
      serviceIndent = nextServiceIndent
    }

    if (nextServiceIndent === serviceIndent) {
      serviceNames.push(serviceMatch[2])
    }
  }

  return uniqueStrings(serviceNames)
}

function getUploadedFile(fileField) {
  if (!fileField) {
    return null
  }

  return Array.isArray(fileField) ? fileField[0] ?? null : fileField
}

function sanitizePathSegment(value, fallback = 'item') {
  const normalized = String(value || fallback)
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized.length > 0 ? normalized.slice(0, 80) : fallback
}

function sanitizeDockerImageName(value, fallback = 'jb-hub-app') {
  const rawSegments = String(value || '')
    .trim()
    .toLowerCase()
    .split('/')
    .map((segment) =>
      segment
        .replace(/[^a-z0-9._-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, ''),
    )
    .filter(Boolean)

  const normalized = rawSegments.join('/')
  return normalized.length > 0 ? normalized.slice(0, 200) : fallback
}

function sanitizeDockerImageTag(value, fallback = 'latest') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized.length > 0 ? normalized.slice(0, 120) : fallback
}

function normalizeDockerContainerPortSpec(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) {
    return null
  }

  const match = normalized.match(/^(\d{1,5})(?:\/(tcp|udp))?$/)
  if (!match) {
    return null
  }

  const port = Number.parseInt(match[1], 10)
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    return null
  }

  return `${port}/${match[2] ?? 'tcp'}`
}

function buildDockerBuildLogExcerpt(logText) {
  const normalized = String(logText || '').trim()
  if (!normalized) {
    return null
  }

  if (normalized.length <= DOCKER_BUILD_LOG_EXCERPT_LENGTH) {
    return normalized
  }

  return normalized.slice(-DOCKER_BUILD_LOG_EXCERPT_LENGTH)
}

function isPathInsideDirectory(parentDir, targetPath) {
  const relativePath = path.relative(parentDir, targetPath)
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
}

function listSingleTopLevelDirectory(rootDir) {
  const entries = fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.'))

  return entries.length === 1 && entries[0].isDirectory() ? entries[0].name : null
}

function resolveBundlePath(rootDir, requestedPath) {
  const normalizedPath = toNullableString(requestedPath, 255) ?? '.'
  const candidates = [path.resolve(rootDir, normalizedPath)]
  const nestedRoot = listSingleTopLevelDirectory(rootDir)

  if (nestedRoot) {
    candidates.push(path.resolve(rootDir, nestedRoot, normalizedPath))
  }

  for (const candidate of candidates) {
    if (isPathInsideDirectory(rootDir, candidate) && fs.existsSync(candidate)) {
      return candidate
    }
  }

  const directPath = path.resolve(rootDir, normalizedPath)
  if (!isPathInsideDirectory(rootDir, directPath)) {
    throw new Error('validation:Docker build paths must stay inside the uploaded bundle.')
  }

  return directPath
}

async function extractDockerSourceArchive(archivePath, destinationDir) {
  await fs.promises.rm(destinationDir, { recursive: true, force: true })
  await fs.promises.mkdir(destinationDir, { recursive: true })
  await execFileAsync('tar', ['-xf', archivePath, '-C', destinationDir], {
    maxBuffer: DOCKER_BUILD_MAX_BUFFER_BYTES,
  })
}

function buildDockerSourceImageReference(jobRecord) {
  const fallbackName = `jb-hub-p${jobRecord.project_id}-job${jobRecord.id}`
  const imageName = sanitizeDockerImageName(jobRecord.image_name, fallbackName)
  const imageTag = sanitizeDockerImageTag(jobRecord.image_tag, 'latest')

  return {
    imageName,
    imageTag,
    imageReference: `${imageName}:${imageTag}`,
  }
}

function parseStoredRuntimeEnvironmentEntries(rawValue) {
  const parsedValue = parseJsonValue(rawValue, rawValue)
  return parseEnvironmentEntries(parsedValue)
}

function readSingleHeader(value) {
  if (Array.isArray(value)) {
    return value[0] ?? ''
  }

  return typeof value === 'string' ? value : ''
}

function defaultReadActorName(req) {
  return String(readSingleHeader(req.headers['x-jb-user-name']) || '').trim().slice(0, 120)
}

function normalizeDockerActorName(actorName) {
  return typeof actorName === 'string' ? actorName.trim().toLowerCase() : ''
}

function canManageDockerResource(actorName, uploaderName, projectAuthor) {
  const normalizedActor = normalizeDockerActorName(actorName)
  const normalizedUploader = normalizeDockerActorName(uploaderName)
  const normalizedProjectAuthor = normalizeDockerActorName(projectAuthor)

  return (
    normalizedActor.length > 0 &&
    (normalizedActor === normalizedUploader || normalizedActor === normalizedProjectAuthor)
  )
}

function toNullableString(value, maxLength = 500) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized.slice(0, maxLength) : null
}

function toMysqlDatetimeValue(value) {
  if (!value) {
    return null
  }

  const parsed = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  const hours = String(parsed.getHours()).padStart(2, '0')
  const minutes = String(parsed.getMinutes()).padStart(2, '0')
  const seconds = String(parsed.getSeconds()).padStart(2, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

function parseOptionalPositiveInt(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function normalizeEnvironmentVariableName(value) {
  return String(value || '').trim()
}

function validateEnvironmentVariableName(variableName) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(variableName)
}

function parseEnvironmentEntries(rawValue) {
  if (rawValue === null || rawValue === undefined) {
    return []
  }

  if (Array.isArray(rawValue)) {
    return rawValue.flatMap((entry) => parseEnvironmentEntries(entry))
  }

  if (typeof rawValue === 'object') {
    return Object.entries(rawValue).map(([key, value]) => {
      const variableName = normalizeEnvironmentVariableName(key)
      if (!validateEnvironmentVariableName(variableName)) {
        throw new Error(`validation:환경 변수 이름이 올바르지 않습니다: ${key}`)
      }

      return [variableName, String(value ?? '')]
    })
  }

  const rawText = String(rawValue).trim()
  if (!rawText) {
    return []
  }

  try {
    const parsedJson = JSON.parse(rawText)
    if (parsedJson && typeof parsedJson === 'object') {
      return parseEnvironmentEntries(parsedJson)
    }
  } catch {
    // Fall back to KEY=VALUE parsing.
  }

  const entries = []
  for (const line of rawText.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex <= 0) {
      throw new Error('validation:환경 변수는 KEY=VALUE 형식으로 입력해야 합니다.')
    }

    const variableName = normalizeEnvironmentVariableName(trimmed.slice(0, separatorIndex))
    if (!validateEnvironmentVariableName(variableName)) {
      throw new Error(`validation:환경 변수 이름이 올바르지 않습니다: ${variableName}`)
    }

    entries.push([variableName, trimmed.slice(separatorIndex + 1)])
  }

  return entries
}

function mergeEnvironmentEntryGroups(...entryGroups) {
  const mergedEntries = new Map()

  for (const entryGroup of entryGroups) {
    for (const [variableName, variableValue] of entryGroup ?? []) {
      mergedEntries.set(variableName, variableValue)
    }
  }

  return [...mergedEntries.entries()]
}

function parseJsonValue(value, fallback) {
  if (value === null || value === undefined) {
    return fallback
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return fallback
    }
  }

  return value
}

function parseRepoTag(repoTag) {
  if (typeof repoTag !== 'string' || !repoTag.trim()) {
    return { imageName: null, imageTag: null }
  }

  const normalized = repoTag.trim()
  const lastSlashIndex = normalized.lastIndexOf('/')
  const lastColonIndex = normalized.lastIndexOf(':')

  if (lastColonIndex > lastSlashIndex) {
    return {
      imageName: normalized.slice(0, lastColonIndex),
      imageTag: normalized.slice(lastColonIndex + 1),
    }
  }

  return {
    imageName: normalized,
    imageTag: null,
  }
}

function sortPortSpecs(portSpecs) {
  return [...portSpecs].sort((left, right) => {
    const [leftPort, leftProtocol = 'tcp'] = left.split('/')
    const [rightPort, rightProtocol = 'tcp'] = right.split('/')
    const leftNumeric = Number.parseInt(leftPort, 10)
    const rightNumeric = Number.parseInt(rightPort, 10)

    if (Number.isFinite(leftNumeric) && Number.isFinite(rightNumeric) && leftNumeric !== rightNumeric) {
      return leftNumeric - rightNumeric
    }

    return `${leftProtocol}:${leftPort}`.localeCompare(`${rightProtocol}:${rightPort}`)
  })
}

function isMissingDockerObjectError(error) {
  const message = String(error?.stderr || error?.stdout || error?.message || '')
  return /No such (container|image|object)/i.test(message)
}

function isDockerImageInUseError(error) {
  const message = String(error?.stderr || error?.stdout || error?.message || '')
  return /image is being used by running container/i.test(message)
}

async function parseDockerManifest(tarPath) {
  const { stdout } = await execFileAsync('tar', ['-xOf', tarPath, 'manifest.json'], {
    maxBuffer: 10 * 1024 * 1024,
  })
  const parsed = JSON.parse(stdout)

  if (!Array.isArray(parsed)) {
    throw new Error('validation:도커 이미지 아카이브 형식이 올바르지 않습니다.')
  }

  const repoTags = []
  let layerCount = 0

  for (const entry of parsed) {
    if (Array.isArray(entry?.RepoTags)) {
      repoTags.push(...entry.RepoTags.filter((value) => typeof value === 'string' && value.trim()))
    }
    if (Array.isArray(entry?.Layers)) {
      layerCount = Math.max(layerCount, entry.Layers.length)
    }
  }

  return {
    repoTags,
    layerCount,
  }
}

async function readArchiveEntry(tarPath, entryNames) {
  for (const entryName of entryNames) {
    try {
      const { stdout } = await execFileAsync('tar', ['-xOf', tarPath, entryName], {
        maxBuffer: 10 * 1024 * 1024,
      })
      if (stdout) {
        return stdout
      }
    } catch {
      // Try the next candidate path inside the archive.
    }
  }

  return null
}

async function readArchiveJsonEntry(tarPath, entryNames) {
  const rawEntry = await readArchiveEntry(tarPath, entryNames)
  if (!rawEntry) {
    return null
  }

  return JSON.parse(rawEntry)
}

async function parseDockerRepositoriesEntry(tarPath) {
  const repositories = await readArchiveJsonEntry(tarPath, ['repositories', './repositories'])
  if (!repositories || typeof repositories !== 'object' || Array.isArray(repositories)) {
    return []
  }

  const repoTags = []
  for (const [imageName, tagMap] of Object.entries(repositories)) {
    const normalizedImageName = toNullableString(String(imageName || ''), 255)
    if (!normalizedImageName || !tagMap || typeof tagMap !== 'object' || Array.isArray(tagMap)) {
      continue
    }

    for (const tagName of Object.keys(tagMap)) {
      const normalizedTagName = toNullableString(String(tagName || ''), 120)
      if (!normalizedTagName) {
        continue
      }

      repoTags.push(`${normalizedImageName}:${normalizedTagName}`)
    }
  }

  return uniqueStrings(repoTags)
}

function buildOciBlobEntryNames(digest) {
  const [algorithm, hash] = String(digest || '').split(':')
  if (!algorithm || !hash) {
    return []
  }

  return [`blobs/${algorithm}/${hash}`, `./blobs/${algorithm}/${hash}`]
}

async function collectOciLayerCount(tarPath, descriptor, visitedDigests = new Set()) {
  const digest = toNullableString(descriptor?.digest, 255)
  if (!digest || visitedDigests.has(digest)) {
    return 0
  }

  visitedDigests.add(digest)
  const parsed = await readArchiveJsonEntry(tarPath, buildOciBlobEntryNames(digest))
  if (!parsed || typeof parsed !== 'object') {
    return 0
  }

  if (Array.isArray(parsed.layers)) {
    return parsed.layers.length
  }

  if (Array.isArray(parsed.manifests)) {
    let maxLayerCount = 0
    for (const nestedDescriptor of parsed.manifests) {
      maxLayerCount = Math.max(maxLayerCount, await collectOciLayerCount(tarPath, nestedDescriptor, visitedDigests))
    }
    return maxLayerCount
  }

  return 0
}

async function parseDockerArchiveMetadata(tarPath) {
  const repositoriesRepoTags = await parseDockerRepositoriesEntry(tarPath)
  const dockerManifest = await readArchiveJsonEntry(tarPath, ['manifest.json', './manifest.json'])
  if (Array.isArray(dockerManifest)) {
    const repoTags = []
    let layerCount = 0

    for (const entry of dockerManifest) {
      if (Array.isArray(entry?.RepoTags)) {
        repoTags.push(...entry.RepoTags.filter((value) => typeof value === 'string' && value.trim()))
      }
      if (Array.isArray(entry?.Layers)) {
        layerCount = Math.max(layerCount, entry.Layers.length)
      }
    }

    return {
      format: 'docker-archive',
      repoTags: uniqueStrings([...repoTags, ...repositoriesRepoTags]),
      layerCount,
    }
  }

  const ociIndex = await readArchiveJsonEntry(tarPath, ['index.json', './index.json'])
  if (ociIndex && typeof ociIndex === 'object' && Array.isArray(ociIndex.manifests)) {
    const repoTags = []
    let layerCount = 0

    for (const descriptor of ociIndex.manifests) {
      const annotations = descriptor?.annotations && typeof descriptor.annotations === 'object' ? descriptor.annotations : {}
      const imageName = toNullableString(annotations['io.containerd.image.name'], 255)
      const imageTag = toNullableString(annotations['org.opencontainers.image.ref.name'], 255)

      if (imageName) {
        repoTags.push(imageName)
      } else if (imageTag) {
        repoTags.push(imageTag)
      }

      layerCount = Math.max(layerCount, await collectOciLayerCount(tarPath, descriptor))
    }

    return {
      format: 'oci-archive',
      repoTags: uniqueStrings([...repoTags, ...repositoriesRepoTags]),
      layerCount,
    }
  }

  throw new Error('validation:도커 이미지 아카이브 형식이 올바르지 않습니다.')
}

function parseDockerLoadOutput(output) {
  const loadedReferences = []
  const loadedImageIds = []

  for (const line of String(output || '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }

    const referenceMatch = trimmed.match(/^Loaded image:\s+(.+)$/i)
    if (referenceMatch) {
      loadedReferences.push(referenceMatch[1].trim())
      continue
    }

    const imageIdMatch = trimmed.match(/^Loaded image ID:\s+(.+)$/i)
    if (imageIdMatch) {
      loadedImageIds.push(imageIdMatch[1].trim())
    }
  }

  return {
    loadedReferences,
    loadedImageIds,
  }
}

function uniqueStrings(values) {
  const normalizedValues = []
  const seen = new Set()

  for (const value of values) {
    const normalized = toNullableString(typeof value === 'string' ? value : String(value ?? ''), 255)
    if (!normalized || seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
    normalizedValues.push(normalized)
  }

  return normalizedValues
}

function listDockerBundleReferences(imageRecord) {
  return uniqueStrings([
    imageRecord?.image_reference,
    ...parseDockerLoadOutput(imageRecord?.load_output).loadedReferences,
  ]).filter((value) => !/^sha256:/i.test(value))
}

function isDockerEngineUnavailableMessage(value) {
  const normalized = String(value || '').toLowerCase()
  return (
    normalized.includes('cannot connect to the docker daemon') ||
    normalized.includes('error during connect') ||
    normalized.includes('is the docker daemon running') ||
    normalized.includes('permission denied while trying to connect') ||
    normalized.includes('/var/run/docker.sock') ||
    normalized.includes('open //./pipe/docker_engine') ||
    normalized.includes('open \\\\.\\pipe\\docker_engine')
  )
}

function normalizeDockerEngineErrorMessage(value) {
  const message = toNullableString(String(value || '').trim(), 1000) ?? 'Docker 엔진에 연결할 수 없습니다.'
  if (isDockerEngineUnavailableMessage(message)) {
    return 'JB-Hub API가 Docker 엔진에 연결되지 않았습니다. 폐쇄망에서는 docker-compose.airgap.docker-features.yml을 함께 적용해 Docker 소켓을 마운트해야 합니다.'
  }

  return message
}

async function assertDockerEngineAvailable() {
  try {
    const { stdout } = await execFileAsync('docker', ['version', '--format', '{{.Server.Version}}'], {
      maxBuffer: 1024 * 1024,
    })
    const version = toNullableString(String(stdout || '').trim(), 120)
    if (!version) {
      const error = new Error('Docker 엔진 버전을 확인하지 못했습니다.')
      error.code = 'DOCKER_ENGINE_UNAVAILABLE'
      throw error
    }

    return version
  } catch (error) {
    const nextError = new Error(normalizeDockerEngineErrorMessage(error?.stderr || error?.message || error))
    nextError.code = 'DOCKER_ENGINE_UNAVAILABLE'
    throw nextError
  }
}

async function getProjectDockerRuntimeStatus() {
  const dockerVersion = await getDockerServerVersion()
  const hasEngineError = !dockerVersion || isDockerEngineUnavailableMessage(dockerVersion)
  return {
    dockerVersion: hasEngineError ? null : dockerVersion,
    engineAvailable: !hasEngineError,
    engineError: hasEngineError ? normalizeDockerEngineErrorMessage(dockerVersion) : null,
  }
}

function sanitizeDockerAlias(value, fallback = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^[^a-z0-9]+/, '')

  if (!normalized) {
    return fallback
  }

  return normalized.slice(0, 63)
}

function buildComposeDeploymentProjectName(projectId, deploymentId) {
  return sanitizeDockerAlias(`jb-hub-p${projectId}-d${deploymentId}`, `jbhub-p${projectId}-d${deploymentId}`).slice(0, 63)
}

function getComposeDeploymentRuntimeDir(deploymentId) {
  return path.join(DOCKER_COMPOSE_DEPLOY_ROOT, String(deploymentId))
}

function getComposeDeploymentEnvFilePath(deploymentId) {
  return path.join(getComposeDeploymentRuntimeDir(deploymentId), '.env')
}

function getComposeDeploymentOverrideFilePath(deploymentId) {
  return path.join(getComposeDeploymentRuntimeDir(deploymentId), 'docker-compose.runtime.yml')
}

function buildDockerComposeArgs(projectName, composeFilePaths, commandArgs, envFilePath = null) {
  const args = ['compose', '--project-name', projectName]

  if (envFilePath) {
    args.push('--env-file', envFilePath)
  }

  for (const composeFilePath of uniqueStrings(composeFilePaths)) {
    args.push('-f', composeFilePath)
  }

  return [...args, ...commandArgs]
}

async function execDockerCompose(projectName, composeFilePaths, commandArgs, options = {}) {
  return await execFileAsync('docker', buildDockerComposeArgs(projectName, composeFilePaths, commandArgs, options.envFilePath), {
    cwd: options.cwd ?? process.cwd(),
    maxBuffer: options.maxBuffer ?? DOCKER_COMPOSE_MAX_BUFFER_BYTES,
  })
}

function formatEnvironmentEntriesAsEnvFile(entryGroup) {
  const lines = []

  for (const [variableName, variableValue] of entryGroup ?? []) {
    lines.push(`${variableName}=${String(variableValue ?? '')}`)
  }

  return lines.length > 0 ? `${lines.join('\n')}\n` : ''
}

async function loadDockerComposeConfig(projectName, composeFilePaths, envFilePath, cwd) {
  const { stdout } = await execDockerCompose(
    projectName,
    composeFilePaths,
    ['config', '--format', 'json'],
    {
      cwd,
      envFilePath,
    },
  )

  const parsed = JSON.parse(stdout)
  return parsed && typeof parsed === 'object' ? parsed : {}
}

function getComposeServiceMap(composeConfig) {
  if (!composeConfig || typeof composeConfig !== 'object' || Array.isArray(composeConfig)) {
    return {}
  }

  const services = composeConfig.services
  return services && typeof services === 'object' && !Array.isArray(services) ? services : {}
}

function getComposeNetworkNames(composeConfig) {
  if (!composeConfig || typeof composeConfig !== 'object' || Array.isArray(composeConfig)) {
    return ['default']
  }

  const networks = composeConfig.networks
  if (!networks || typeof networks !== 'object' || Array.isArray(networks)) {
    return ['default']
  }

  const networkNames = Object.keys(networks)
  return networkNames.length > 0 ? networkNames : ['default']
}

function normalizeComposePortEntry(portEntry) {
  if (!portEntry) {
    return null
  }

  if (typeof portEntry === 'object' && !Array.isArray(portEntry)) {
    const target = Number.parseInt(String(portEntry.target ?? ''), 10)
    if (!Number.isFinite(target) || target <= 0 || target > 65535) {
      return null
    }

    const protocol = String(portEntry.protocol ?? 'tcp').trim().toLowerCase() || 'tcp'
    return {
      containerPortSpec: normalizeDockerContainerPortSpec(`${target}/${protocol}`),
      publishedPort: parseOptionalPositiveInt(portEntry.published),
    }
  }

  if (typeof portEntry === 'string') {
    const normalized = portEntry.trim()
    if (!normalized) {
      return null
    }

    const [mappingText, protocolText = 'tcp'] = normalized.split('/')
    const mappingSegments = mappingText.split(':').filter(Boolean)
    const containerPortValue = mappingSegments[mappingSegments.length - 1]
    const publishedPortValue = mappingSegments.length > 1 ? mappingSegments[mappingSegments.length - 2] : null

    return {
      containerPortSpec: normalizeDockerContainerPortSpec(`${containerPortValue}/${protocolText}`),
      publishedPort: parseOptionalPositiveInt(publishedPortValue),
    }
  }

  return null
}

function listComposeServicePortEntries(serviceConfig) {
  const ports = Array.isArray(serviceConfig?.ports) ? serviceConfig.ports : []
  return ports.map((entry) => normalizeComposePortEntry(entry)).filter(Boolean)
}

function listComposeServicePortSpecs(serviceConfig) {
  return sortPortSpecs(
    listComposeServicePortEntries(serviceConfig)
      .map((entry) => entry.containerPortSpec)
      .filter(Boolean),
  )
}

function getComposePublishedHostPort(serviceConfig, containerPortSpec = null) {
  const normalizedContainerPort = normalizeDockerContainerPortSpec(containerPortSpec)
  const portEntries = listComposeServicePortEntries(serviceConfig)

  if (normalizedContainerPort) {
    const matchingEntry = portEntries.find(
      (entry) => entry.containerPortSpec === normalizedContainerPort && entry.publishedPort,
    )
    if (matchingEntry?.publishedPort) {
      return matchingEntry.publishedPort
    }
  }

  return portEntries.find((entry) => entry.publishedPort)?.publishedPort ?? null
}

function matchesComposeServiceImage(serviceConfig, imageInfo) {
  const serviceImage = toNullableString(serviceConfig?.image, 255)
  if (!serviceImage) {
    return false
  }

  const normalizedServiceImage = serviceImage.toLowerCase()
  const parsedServiceImage = parseRepoTag(normalizedServiceImage)
  const candidates = uniqueStrings([
    imageInfo?.imageReference,
    imageInfo?.imageName,
    ...(Array.isArray(imageInfo?.repoTags) ? imageInfo.repoTags : []),
  ]).map((value) => value.toLowerCase())

  return candidates.some((candidate) => {
    if (normalizedServiceImage === candidate) {
      return true
    }

    const parsedCandidate = parseRepoTag(candidate)
    if (parsedServiceImage.imageName && parsedCandidate.imageName && parsedServiceImage.imageName === parsedCandidate.imageName) {
      return true
    }

    return Boolean(parsedCandidate.imageName && normalizedServiceImage.endsWith(parsedCandidate.imageName))
  })
}

function scoreComposePrimaryService(serviceName, serviceConfig, bundleInfo) {
  const primaryImage = bundleInfo?.primaryImage ?? null
  const normalizedServiceName = sanitizeDockerAlias(serviceName, '').toLowerCase()
  const portSpecs = listComposeServicePortSpecs(serviceConfig)
  const referenceText = uniqueStrings([serviceName, serviceConfig?.image, ...portSpecs]).join(' ').toLowerCase()

  let score = 0

  if (primaryImage && matchesComposeServiceImage(serviceConfig, primaryImage)) {
    score += 220
  }

  if (Array.isArray(primaryImage?.aliases) && primaryImage.aliases.map((value) => value.toLowerCase()).includes(normalizedServiceName)) {
    score += 120
  }

  if (portSpecs.length > 0) {
    score += 40
  }

  if (Array.isArray(primaryImage?.exposedPorts) && primaryImage.exposedPorts.some((portSpec) => portSpecs.includes(portSpec))) {
    score += 110
  }

  if (/(frontend|front-end|web|ui|client|site|nginx)/.test(referenceText)) {
    score += 90
  }

  if (/(backend|api|worker|job|queue|db|database|redis|postgres|mysql|mariadb)/.test(referenceText)) {
    score -= 70
  }

  return score
}

function selectPrimaryComposeService(composeConfig, bundleInfo) {
  const serviceEntries = Object.entries(getComposeServiceMap(composeConfig))
  if (serviceEntries.length === 0) {
    return null
  }

  const sortedEntries = [...serviceEntries].sort(([leftName, leftConfig], [rightName, rightConfig]) => {
    const scoreDifference = scoreComposePrimaryService(rightName, rightConfig, bundleInfo) - scoreComposePrimaryService(leftName, leftConfig, bundleInfo)
    if (scoreDifference !== 0) {
      return scoreDifference
    }

    const leftPortRank = getDockerPortPreferenceRank(listComposeServicePortSpecs(leftConfig)[0] ?? '')
    const rightPortRank = getDockerPortPreferenceRank(listComposeServicePortSpecs(rightConfig)[0] ?? '')
    if (leftPortRank !== rightPortRank) {
      return leftPortRank - rightPortRank
    }

    return String(leftName).localeCompare(String(rightName))
  })

  return sortedEntries[0]?.[0] ?? null
}

function ensureComposeServicesReferenceImages(composeConfig) {
  for (const [serviceName, serviceConfig] of Object.entries(getComposeServiceMap(composeConfig))) {
    if (!toNullableString(serviceConfig?.image, 255)) {
      throw new Error(`validation:Compose service "${serviceName}" must define image: when deploying an uploaded image bundle.`)
    }
  }
}

function buildComposePortBinding(hostPort, containerPortSpec) {
  const [containerPort, protocol = 'tcp'] = String(containerPortSpec || '').split('/')
  return protocol.toLowerCase() === 'tcp' ? `${hostPort}:${containerPort}` : `${hostPort}:${containerPort}/${protocol}`
}

function buildComposeDeploymentOverrideFile(composeConfig, options) {
  const serviceNames = Object.keys(getComposeServiceMap(composeConfig))
  const networkNames = getComposeNetworkNames(composeConfig)
  const lines = ['services:']
  const baseLabels = [
    [`${DOCKER_LABEL_PREFIX}.projectId`, String(options.projectId)],
    [`${DOCKER_LABEL_PREFIX}.imageRecordId`, String(options.imageRecordId)],
    [`${DOCKER_LABEL_PREFIX}.deploymentId`, String(options.deploymentId)],
    [`${DOCKER_LABEL_PREFIX}.owner`, sanitizePathSegment(options.uploaderName, 'user')],
    [`${DOCKER_LABEL_PREFIX}.composeProject`, options.composeProjectName],
  ]

  for (const serviceName of serviceNames) {
    lines.push(`  ${JSON.stringify(serviceName)}:`)
    lines.push('    labels:')

    for (const [labelKey, labelValue] of [...baseLabels, [`${DOCKER_LABEL_PREFIX}.role`, serviceName === options.primaryServiceName ? 'primary' : 'sidecar']]) {
      lines.push(`      ${JSON.stringify(labelKey)}: ${JSON.stringify(String(labelValue))}`)
    }

    if ((options.environmentEntries ?? []).length > 0) {
      lines.push('    environment:')
      for (const [variableName, variableValue] of options.environmentEntries) {
        lines.push(`      ${JSON.stringify(variableName)}: ${JSON.stringify(String(variableValue ?? ''))}`)
      }
    }

    if (
      serviceName === options.primaryServiceName &&
      options.injectPrimaryPortBinding &&
      options.hostPort &&
      options.containerPort
    ) {
      lines.push('    ports:')
      lines.push(`      - ${JSON.stringify(buildComposePortBinding(options.hostPort, options.containerPort))}`)
    }
  }

  if (networkNames.length > 0) {
    lines.push('networks:')
    for (const networkName of networkNames) {
      lines.push(`  ${JSON.stringify(networkName)}:`)
      lines.push('    labels:')
      for (const [labelKey, labelValue] of baseLabels) {
        lines.push(`      ${JSON.stringify(labelKey)}: ${JSON.stringify(String(labelValue))}`)
      }
    }
  }

  return `${lines.join('\n')}\n`
}

function getDockerPortPreferenceRank(portSpec) {
  const preferredPorts = ['80/tcp', '443/tcp', '3000/tcp', '8080/tcp', '4173/tcp', '5173/tcp']
  const exactMatchIndex = preferredPorts.indexOf(portSpec)
  if (exactMatchIndex >= 0) {
    return exactMatchIndex
  }

  const [portValue = ''] = String(portSpec || '').split('/')
  const numericPort = Number.parseInt(portValue, 10)
  return Number.isFinite(numericPort) ? preferredPorts.length + numericPort : preferredPorts.length + 10000
}

function buildDeploymentNetworkName(projectId, deploymentId) {
  return `jb-hub-p${projectId}-d${deploymentId}-net`.slice(0, 120)
}

function buildServiceContainerName(projectId, deploymentId, uploaderName, serviceName = null) {
  const baseName = buildContainerName(projectId, deploymentId, uploaderName)
  if (!serviceName) {
    return baseName
  }

  return `${baseName}-${sanitizePathSegment(serviceName, 'svc')}`.slice(0, 120)
}

function extractDockerContainerName(inspectResult) {
  return toNullableString(String(inspectResult?.Name || '').replace(/^\/+/, ''), 120)
}

function deriveDockerServiceAliases(imageInfo) {
  const rawCandidates = []
  const references = uniqueStrings([
    imageInfo?.imageReference,
    imageInfo?.imageName,
    ...(Array.isArray(imageInfo?.repoTags) ? imageInfo.repoTags : []),
  ])

  for (const reference of references) {
    const { imageName } = parseRepoTag(reference)
    const normalizedImageName = imageName || reference
    const lastPathSegment = normalizedImageName.split('/').filter(Boolean).pop()

    if (!lastPathSegment) {
      continue
    }

    rawCandidates.push(lastPathSegment)

    const splitTokens = lastPathSegment.split(/[-_]+/).filter(Boolean)
    if (splitTokens.length > 1) {
      rawCandidates.push(splitTokens[splitTokens.length - 1])
    }
  }

  return uniqueStrings(rawCandidates.map((value) => sanitizeDockerAlias(value)).filter(Boolean))
}

function scorePrimaryBundleImage(imageInfo) {
  const referenceText = uniqueStrings([
    imageInfo?.imageName,
    imageInfo?.imageReference,
    ...(Array.isArray(imageInfo?.aliases) ? imageInfo.aliases : []),
  ])
    .join(' ')
    .toLowerCase()

  let score = 0

  if (/(frontend|front-end|web|ui|client|site|nginx)/.test(referenceText)) {
    score += 120
  }

  if (/(backend|api|worker|job|queue|db|database|redis|postgres|mysql|mariadb)/.test(referenceText)) {
    score -= 80
  }

  const exposedPorts = Array.isArray(imageInfo?.exposedPorts) ? imageInfo.exposedPorts : []
  if (exposedPorts.length > 0) {
    score += 20
  }

  if (exposedPorts.some((portSpec) => getDockerPortPreferenceRank(portSpec) < 6)) {
    score += 60
  }

  return score
}

function selectPrimaryBundleImage(bundleImages) {
  const sortedImages = [...bundleImages].sort((left, right) => {
    const scoreDifference = scorePrimaryBundleImage(right) - scorePrimaryBundleImage(left)
    if (scoreDifference !== 0) {
      return scoreDifference
    }

    const leftPortRank = getDockerPortPreferenceRank(left.exposedPorts?.[0] ?? '')
    const rightPortRank = getDockerPortPreferenceRank(right.exposedPorts?.[0] ?? '')
    if (leftPortRank !== rightPortRank) {
      return leftPortRank - rightPortRank
    }

    return String(left.imageReference || left.imageId || '').localeCompare(String(right.imageReference || right.imageId || ''))
  })

  return sortedImages[0] ?? null
}

function getTrackedDockerImageIdentifiers(imageRecord) {
  const loadInfo = parseDockerLoadOutput(imageRecord?.load_output)
  return uniqueStrings([
    imageRecord?.image_reference,
    imageRecord?.image_id,
    ...loadInfo.loadedReferences,
    ...loadInfo.loadedImageIds,
  ])
}

async function inspectDockerBundleIdentifiers(identifiers) {
  const bundleImages = []
  const seenImages = new Set()
  let lastError = null

  for (const identifier of uniqueStrings(identifiers)) {
    try {
      const imageInfo = await inspectDockerImage(identifier)
      const aliases = deriveDockerServiceAliases(imageInfo)
      const identityKey = imageInfo.imageId || imageInfo.imageReference || identifier

      if (seenImages.has(identityKey)) {
        continue
      }

      seenImages.add(identityKey)
      bundleImages.push({
        ...imageInfo,
        aliases,
      })
    } catch (error) {
      lastError = error
    }
  }

  if (bundleImages.length === 0) {
    throw lastError ?? new Error('validation:Could not inspect the uploaded Docker image archive.')
  }

  const primaryImage = selectPrimaryBundleImage(bundleImages)
  if (!primaryImage) {
    throw new Error('validation:Could not determine which image should be exposed to the host.')
  }

  return {
    bundleImages,
    primaryImage,
  }
}

async function inspectDockerBundle(imageRecord) {
  return await inspectDockerBundleIdentifiers(getTrackedDockerImageIdentifiers(imageRecord))
}

async function inspectDockerImage(identifier) {
  const { stdout } = await execFileAsync('docker', ['image', 'inspect', identifier], {
    maxBuffer: 10 * 1024 * 1024,
  })
  const parsed = JSON.parse(stdout)
  const imageInfo = Array.isArray(parsed) ? parsed[0] : null

  if (!imageInfo || typeof imageInfo !== 'object') {
    throw new Error('validation:도커 이미지를 검사하지 못했습니다.')
  }

  const repoTags = Array.isArray(imageInfo.RepoTags)
    ? imageInfo.RepoTags.filter((value) => typeof value === 'string' && value.trim())
    : []
  const { imageName, imageTag } = parseRepoTag(repoTags[0] ?? identifier)
  const exposedPorts = sortPortSpecs(Object.keys(imageInfo.Config?.ExposedPorts ?? {}))

  return {
    imageId: toNullableString(imageInfo.Id, 200),
    imageName,
    imageTag,
    imageReference: repoTags[0] ?? toNullableString(identifier, 255),
    repoTags,
    sizeBytes: Number(imageInfo.Size ?? 0),
    layers: Array.isArray(imageInfo.RootFS?.Layers) ? imageInfo.RootFS.Layers.length : 0,
    architecture: toNullableString(imageInfo.Architecture, 64),
    exposedPorts,
  }
}

async function inspectDockerContainer(containerId) {
  const { stdout } = await execFileAsync('docker', ['container', 'inspect', containerId], {
    maxBuffer: 10 * 1024 * 1024,
  })
  const parsed = JSON.parse(stdout)
  return Array.isArray(parsed) ? parsed[0] ?? null : null
}

async function listDockerContainerIdsByLabel(labelKey, labelValue) {
  const { stdout } = await execFileAsync(
    'docker',
    ['ps', '-aq', '--no-trunc', '--filter', `label=${labelKey}=${labelValue}`],
    {
      maxBuffer: 10 * 1024 * 1024,
    },
  )

  return String(stdout || '')
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
}

async function listDockerNetworkIdsByLabel(labelKey, labelValue) {
  const { stdout } = await execFileAsync(
    'docker',
    ['network', 'ls', '-q', '--filter', `label=${labelKey}=${labelValue}`],
    {
      maxBuffer: 10 * 1024 * 1024,
    },
  )

  return String(stdout || '')
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
}

async function listDockerContainerLogs(containerId, tail) {
  const { stdout, stderr } = await execFileAsync('docker', ['logs', '--tail', String(tail), containerId], {
    maxBuffer: 10 * 1024 * 1024,
  })
  return [stdout, stderr].filter(Boolean).join('\n').trim()
}

async function createDockerNetwork(networkName, labels) {
  const dockerArgs = ['network', 'create', '--driver', 'bridge']

  for (const [labelKey, labelValue] of labels) {
    dockerArgs.push('--label', `${labelKey}=${labelValue}`)
  }

  dockerArgs.push(networkName)

  try {
    await execFileAsync('docker', dockerArgs, {
      maxBuffer: 10 * 1024 * 1024,
    })
  } catch (error) {
    const message = String(error?.stderr || error?.stdout || error?.message || '')
    if (!/already exists/i.test(message)) {
      throw error
    }
  }
}

function extractMostRelevantLogLine(logText) {
  const lines = String(logText || '')
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return null
  }

  const priorityLine =
    [...lines].reverse().find((line) => /\b(fatal|error|exception|failed)\b/i.test(line)) ??
    lines[lines.length - 1]

  return toNullableString(priorityLine, 2000)
}

async function resolveDeploymentErrorMessage(containerId, status, fallbackMessage) {
  const normalizedFallback = toNullableString(fallbackMessage, 2000)
  if (normalizedFallback) {
    return normalizedFallback
  }

  if (!containerId || status === 'running') {
    return null
  }

  try {
    const recentLogs = await listDockerContainerLogs(containerId, 80)
    return extractMostRelevantLogLine(recentLogs)
  } catch {
    return null
  }
}

function createPortProbeServer() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.once('listening', () => resolve(server))
    server.listen(0, '127.0.0.1')
  })
}

async function isPortAvailable(port) {
  return await new Promise((resolve) => {
    const server = net.createServer()
    server.unref()

    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })

    server.listen(port, '127.0.0.1')
  })
}

async function listPublishedDockerHostPorts() {
  const usedPorts = new Set()

  try {
    const { stdout } = await execFileAsync('docker', ['ps', '--format', '{{.Ports}}'], {
      maxBuffer: 10 * 1024 * 1024,
    })

    for (const line of String(stdout || '').split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed) {
        continue
      }

      const hostPortPattern = /(?:^|[\s,])(?:[^,\s]+:)?(\d+)->/g
      let match = hostPortPattern.exec(trimmed)
      while (match) {
        const port = Number.parseInt(match[1], 10)
        if (Number.isFinite(port) && port > 0) {
          usedPorts.add(port)
        }
        match = hostPortPattern.exec(trimmed)
      }
    }
  } catch {
    // Fall back to socket probing when Docker metadata is unavailable.
  }

  return usedPorts
}

function isDockerPortBindingError(error) {
  const message = String(error?.stderr || error?.stdout || error?.message || '')
  return /port is already allocated|bind .* failed/i.test(message)
}

async function allocateHostPort(preferredPort, needsPortBinding, excludedPorts = []) {
  if (!needsPortBinding) {
    return null
  }

  const publishedPorts = await listPublishedDockerHostPorts()
  for (const excludedPort of excludedPorts) {
    const numericPort = Number(excludedPort)
    if (Number.isFinite(numericPort) && numericPort > 0) {
      publishedPorts.add(numericPort)
    }
  }

  const isCandidatePortAvailable = async (candidatePort) => {
    return !publishedPorts.has(candidatePort) && (await isPortAvailable(candidatePort))
  }

  if (preferredPort && (await isCandidatePortAvailable(preferredPort))) {
    return preferredPort
  }

  const fallbackServer = await createPortProbeServer()
  const address = fallbackServer.address()
  const fallbackPort = typeof address === 'object' && address ? address.port : null

  await new Promise((resolve) => fallbackServer.close(resolve))

  if (fallbackPort && (await isCandidatePortAvailable(fallbackPort))) {
    return fallbackPort
  }

  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port += 1) {
    if (await isCandidatePortAvailable(port)) {
      return port
    }
  }

  if (!fallbackPort) {
    throw new Error('validation:도커 배포에 사용할 빈 호스트 포트가 없습니다.')
  }

  return fallbackPort
}

function buildContainerName(projectId, deploymentId, uploaderName) {
  const sanitizedUploader = sanitizePathSegment(uploaderName, 'user')
  return `jb-hub-p${projectId}-d${deploymentId}-${sanitizedUploader}`.slice(0, 120)
}

function buildDeploymentEndpoint(hostPort, containerPort) {
  if (!hostPort || !containerPort) {
    return null
  }

  const [, protocol = 'tcp'] = containerPort.split('/')
  if (protocol.toLowerCase() !== 'tcp') {
    return `udp://127.0.0.1:${hostPort}`
  }

  return `http://127.0.0.1:${hostPort}`
}

async function listDeploymentContainers(deploymentRecord) {
  const labelContainerIds = await listDockerContainerIdsByLabel(
    `${DOCKER_LABEL_PREFIX}.deploymentId`,
    String(deploymentRecord.id),
  )
  const composeProjectContainerIds =
    labelContainerIds.length === 0
      ? await listDockerContainerIdsByLabel(
          'com.docker.compose.project',
          buildComposeDeploymentProjectName(deploymentRecord.project_id, deploymentRecord.id),
        )
      : []
  const containerIds = uniqueStrings([deploymentRecord.container_id, ...labelContainerIds, ...composeProjectContainerIds])
  const containers = []

  for (const containerId of containerIds) {
    try {
      containers.push({
        containerId,
        inspectResult: await inspectDockerContainer(containerId),
      })
    } catch (error) {
      if (!isMissingDockerObjectError(error)) {
        throw error
      }
    }
  }

  return containers
}

function selectPrimaryDeploymentContainer(containerEntries, deploymentRecord) {
  if (deploymentRecord?.container_id) {
    const matchedEntry = containerEntries.find((entry) => entry.containerId === deploymentRecord.container_id)
    if (matchedEntry) {
      return matchedEntry
    }
  }

  const labeledPrimary = containerEntries.find(
    (entry) => entry.inspectResult?.Config?.Labels?.[`${DOCKER_LABEL_PREFIX}.role`] === 'primary',
  )
  if (labeledPrimary) {
    return labeledPrimary
  }

  if (deploymentRecord?.container_name) {
    const matchedEntry = containerEntries.find(
      (entry) => extractDockerContainerName(entry.inspectResult) === deploymentRecord.container_name,
    )
    if (matchedEntry) {
      return matchedEntry
    }
  }

  return containerEntries[0] ?? null
}

function orderDeploymentContainers(containerEntries, primaryContainerId, primaryLast) {
  const deduplicatedEntries = []
  const seenContainerIds = new Set()

  for (const entry of containerEntries) {
    if (seenContainerIds.has(entry.containerId)) {
      continue
    }

    seenContainerIds.add(entry.containerId)
    deduplicatedEntries.push(entry)
  }

  return deduplicatedEntries.sort((left, right) => {
    const leftIsPrimary = left.containerId === primaryContainerId
    const rightIsPrimary = right.containerId === primaryContainerId
    if (leftIsPrimary !== rightIsPrimary) {
      if (primaryLast) {
        return leftIsPrimary ? 1 : -1
      }

      return leftIsPrimary ? -1 : 1
    }

    const leftRole = left.inspectResult?.Config?.Labels?.[`${DOCKER_LABEL_PREFIX}.role`] || ''
    const rightRole = right.inspectResult?.Config?.Labels?.[`${DOCKER_LABEL_PREFIX}.role`] || ''
    if (leftRole !== rightRole) {
      return leftRole.localeCompare(rightRole)
    }

    return String(extractDockerContainerName(left.inspectResult) || left.containerId).localeCompare(
      String(extractDockerContainerName(right.inspectResult) || right.containerId),
    )
  })
}

function normalizeContainerStateTimestamp(value) {
  if (!value || value === '0001-01-01T00:00:00Z') {
    return null
  }

  return value
}

function summarizeDeploymentContainers(containerEntries, deploymentRecord) {
  if (containerEntries.length === 0) {
    return {
      primaryEntry: null,
      nextContainerId: deploymentRecord.container_id ?? null,
      nextContainerName: deploymentRecord.container_name ?? null,
      nextStatus: 'removed',
      nextStartedAt: deploymentRecord.started_at ?? null,
      nextStoppedAt: new Date().toISOString(),
      problemEntry: null,
    }
  }

  const primaryEntry = selectPrimaryDeploymentContainer(containerEntries, deploymentRecord)
  const primaryState = primaryEntry?.inspectResult?.State ?? null
  const statuses = containerEntries.map((entry) => {
    const state = entry.inspectResult?.State ?? {}
    return {
      entry,
      status: toNullableString(state.Status, 64) ?? 'unknown',
      exitCode: Number(state.ExitCode ?? 0),
      startedAt: normalizeContainerStateTimestamp(state.StartedAt),
      stoppedAt: normalizeContainerStateTimestamp(state.FinishedAt),
    }
  })

  let nextStatus = statuses.find((item) => item.entry.containerId === primaryEntry?.containerId)?.status ?? deploymentRecord.status
  if (statuses.every((item) => item.status === 'running')) {
    nextStatus = 'running'
  } else if (statuses.some((item) => item.status === 'restarting')) {
    nextStatus = 'restarting'
  } else if (statuses.every((item) => item.status === 'exited')) {
    nextStatus = 'exited'
  } else if (statuses.every((item) => item.status === 'created')) {
    nextStatus = 'creating'
  } else if (statuses.some((item) => item.status === 'running')) {
    nextStatus = 'failed'
  }

  const startedCandidates = statuses.map((item) => item.startedAt).filter(Boolean)
  const stoppedCandidates = statuses.map((item) => item.stoppedAt).filter(Boolean)
  const nextStartedAt =
    statuses.find((item) => item.entry.containerId === primaryEntry?.containerId)?.startedAt ??
    startedCandidates[0] ??
    deploymentRecord.started_at ??
    null
  const nextStoppedAt =
    nextStatus === 'running' || nextStatus === 'creating'
      ? null
      : statuses.find((item) => item.entry.containerId === primaryEntry?.containerId)?.stoppedAt ??
        stoppedCandidates[0] ??
        deploymentRecord.stopped_at ??
        new Date().toISOString()

  const problemEntry =
    statuses.find((item) => item.status === 'restarting')?.entry ??
    statuses.find((item) => item.status === 'exited' && item.exitCode !== 0)?.entry ??
    statuses.find((item) => !['running', 'created'].includes(item.status))?.entry ??
    (nextStatus === 'failed'
      ? statuses.find((item) => item.entry.containerId !== primaryEntry?.containerId && item.status !== 'running')?.entry
      : null)

  return {
    primaryEntry,
    nextContainerId: primaryEntry?.containerId ?? deploymentRecord.container_id ?? null,
    nextContainerName: extractDockerContainerName(primaryEntry?.inspectResult) ?? deploymentRecord.container_name ?? null,
    nextStatus,
    nextStartedAt,
    nextStoppedAt,
    problemEntry,
  }
}

function toDockerImageDto(row, actorName, projectAuthor, projectWriteAccess = false) {
  return {
    id: Number(row.id),
    projectId: Number(row.project_id),
    uploaderName: row.uploader_name,
    originalFileName: row.original_file_name,
    tarPath: row.tar_path,
    imageName: row.image_name,
    imageTag: row.image_tag,
    imageReference: row.image_reference,
    imageId: row.image_id,
    sizeBytes: Number(row.size_bytes ?? 0),
    sizeFormatted: formatBytes(row.size_bytes),
    layers: Number(row.layers ?? 0),
    architecture: row.architecture,
    exposedPorts: Array.isArray(parseJsonValue(row.exposed_ports, [])) ? parseJsonValue(row.exposed_ports, []) : [],
    environmentFileName: row.environment_file_name ?? null,
    composeFileName: row.compose_file_name ?? null,
    composeServices: Array.isArray(parseJsonValue(row.compose_services, [])) ? parseJsonValue(row.compose_services, []) : [],
    bundleReferences: listDockerBundleReferences(row),
    loadStatus: row.load_status,
    loadOutput: row.load_output,
    loadError: row.load_error,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
    canManage: projectWriteAccess || canManageDockerResource(actorName, row.uploader_name, projectAuthor),
  }
}

function toDockerDeploymentDto(row, actorName, projectAuthor, projectWriteAccess = false) {
  return {
    id: Number(row.id),
    projectId: Number(row.project_id),
    imageId: Number(row.image_id),
    uploaderName: row.uploader_name,
    containerName: row.container_name,
    containerId: row.container_id,
    status: row.status,
    hostPort: row.host_port === null || row.host_port === undefined ? null : Number(row.host_port),
    containerPort: row.container_port,
    endpointUrl: row.endpoint_url,
    runOutput: row.run_output,
    errorMessage: row.error_message,
    startedAt: row.started_at?.toISOString?.() ?? row.started_at ?? null,
    stoppedAt: row.stopped_at?.toISOString?.() ?? row.stopped_at ?? null,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
    canManage: projectWriteAccess || canManageDockerResource(actorName, row.uploader_name, projectAuthor),
  }
}

function toDockerBuildJobDto(row, actorName, projectAuthor, projectWriteAccess = false) {
  return {
    id: Number(row.id),
    projectId: Number(row.project_id),
    uploaderName: row.uploader_name,
    sourceFileName: row.source_file_name,
    dockerfilePath: row.dockerfile_path,
    contextPath: row.context_path,
    imageName: row.image_name ?? null,
    imageTag: row.image_tag ?? null,
    requestedContainerPort: row.requested_container_port ?? null,
    preferredHostPort:
      row.preferred_host_port === null || row.preferred_host_port === undefined
        ? null
        : Number(row.preferred_host_port),
    environmentFileName: row.environment_file_name ?? null,
    status: row.status,
    buildOutputExcerpt: buildDockerBuildLogExcerpt(row.build_output),
    errorMessage: row.error_message ?? null,
    imageRecordId: row.image_record_id === null || row.image_record_id === undefined ? null : Number(row.image_record_id),
    deploymentId: row.deployment_id === null || row.deployment_id === undefined ? null : Number(row.deployment_id),
    startedAt: row.started_at?.toISOString?.() ?? row.started_at ?? null,
    finishedAt: row.finished_at?.toISOString?.() ?? row.finished_at ?? null,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
    canManage: projectWriteAccess || canManageDockerResource(actorName, row.uploader_name, projectAuthor),
  }
}

async function getDockerImageRecord(pool, imageId) {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        project_id,
        uploader_name,
        original_file_name,
        tar_path,
        image_name,
        image_tag,
        image_reference,
        image_id,
        size_bytes,
        layers,
        architecture,
        exposed_ports,
        environment_file_name,
        environment_file_path,
        compose_file_name,
        compose_file_path,
        compose_services,
        load_status,
        load_output,
        load_error,
        created_at,
        updated_at
      FROM docker_images
      WHERE id = ?
      LIMIT 1
    `,
    [imageId],
  )

  return rows[0] ?? null
}

async function getDockerDeploymentRecord(pool, deploymentId) {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        project_id,
        image_id,
        uploader_name,
        container_name,
        container_id,
        status,
        host_port,
        container_port,
        endpoint_url,
        run_output,
        error_message,
        started_at,
        stopped_at,
        created_at,
        updated_at
      FROM docker_deployments
      WHERE id = ?
      LIMIT 1
    `,
    [deploymentId],
  )

  return rows[0] ?? null
}

async function getDockerBuildJobRecord(pool, buildJobId) {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        project_id,
        uploader_name,
        source_file_name,
        source_archive_path,
        dockerfile_path,
        context_path,
        image_name,
        image_tag,
        requested_container_port,
        preferred_host_port,
        environment_file_name,
        environment_file_path,
        runtime_environment,
        status,
        build_output,
        error_message,
        image_record_id,
        deployment_id,
        started_at,
        finished_at,
        created_at,
        updated_at
      FROM docker_build_jobs
      WHERE id = ?
      LIMIT 1
    `,
    [buildJobId],
  )

  return rows[0] ?? null
}

async function listDockerImagesByProject(pool, projectId) {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        project_id,
        uploader_name,
        original_file_name,
        tar_path,
        image_name,
        image_tag,
        image_reference,
        image_id,
        size_bytes,
        layers,
        architecture,
        exposed_ports,
        environment_file_name,
        environment_file_path,
        compose_file_name,
        compose_file_path,
        compose_services,
        load_status,
        load_output,
        load_error,
        created_at,
        updated_at
      FROM docker_images
      WHERE project_id = ?
      ORDER BY id DESC
    `,
    [projectId],
  )

  return rows
}

async function listDockerDeploymentsByProject(pool, projectId) {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        project_id,
        image_id,
        uploader_name,
        container_name,
        container_id,
        status,
        host_port,
        container_port,
        endpoint_url,
        run_output,
        error_message,
        started_at,
        stopped_at,
        created_at,
        updated_at
      FROM docker_deployments
      WHERE project_id = ?
      ORDER BY id DESC
    `,
    [projectId],
  )

  return rows
}

async function listDockerBuildJobsByProject(pool, projectId) {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        project_id,
        uploader_name,
        source_file_name,
        source_archive_path,
        dockerfile_path,
        context_path,
        image_name,
        image_tag,
        requested_container_port,
        preferred_host_port,
        environment_file_name,
        environment_file_path,
        runtime_environment,
        status,
        build_output,
        error_message,
        image_record_id,
        deployment_id,
        started_at,
        finished_at,
        created_at,
        updated_at
      FROM docker_build_jobs
      WHERE project_id = ?
      ORDER BY id DESC
    `,
    [projectId],
  )

  return rows
}

async function updateDockerImageRecord(pool, imageId, updates) {
  const fields = Object.entries(updates)
  if (fields.length === 0) {
    return
  }

  const sql = `UPDATE docker_images SET ${fields.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`
  const values = [...fields.map(([, value]) => value), imageId]
  await pool.execute(sql, values)
}

async function updateDockerDeploymentRecord(pool, deploymentId, updates) {
  const fields = Object.entries(updates)
  if (fields.length === 0) {
    return
  }

  const sql = `UPDATE docker_deployments SET ${fields.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`
  const values = [...fields.map(([, value]) => value), deploymentId]
  await pool.execute(sql, values)
}

async function insertDockerBuildJobRecord(pool, payload) {
  const [result] = await pool.execute(
    `
      INSERT INTO docker_build_jobs (
        project_id,
        uploader_name,
        source_file_name,
        source_archive_path,
        dockerfile_path,
        context_path,
        image_name,
        image_tag,
        requested_container_port,
        preferred_host_port,
        environment_file_name,
        environment_file_path,
        runtime_environment,
        status,
        build_output,
        error_message,
        image_record_id,
        deployment_id,
        started_at,
        finished_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.projectId,
      payload.uploaderName,
      payload.sourceFileName,
      payload.sourceArchivePath,
      payload.dockerfilePath ?? 'Dockerfile',
      payload.contextPath ?? '.',
      payload.imageName ?? null,
      payload.imageTag ?? null,
      payload.requestedContainerPort ?? null,
      payload.preferredHostPort ?? null,
      payload.environmentFileName ?? null,
      payload.environmentFilePath ?? null,
      payload.runtimeEnvironment ?? null,
      payload.status ?? 'queued',
      payload.buildOutput ?? null,
      payload.errorMessage ?? null,
      payload.imageRecordId ?? null,
      payload.deploymentId ?? null,
      payload.startedAt ?? null,
      payload.finishedAt ?? null,
    ],
  )

  return Number(result.insertId)
}

async function updateDockerBuildJobRecord(pool, buildJobId, updates) {
  const fields = Object.entries(updates)
  if (fields.length === 0) {
    return
  }

  const sql = `UPDATE docker_build_jobs SET ${fields.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`
  const values = [...fields.map(([, value]) => value), buildJobId]
  await pool.execute(sql, values)
}

async function listTrackedDeploymentHostPorts(pool) {
  const [rows] = await pool.query(
    `
      SELECT DISTINCT host_port
      FROM docker_deployments
      WHERE host_port IS NOT NULL
        AND status IN ('creating', 'running', 'restarting')
    `,
  )

  return rows
    .map((row) => Number(row.host_port))
    .filter((port) => Number.isFinite(port) && port > 0)
}

async function loadDockerImageArchive(tarPath) {
  const { stdout, stderr } = await execFileAsync('docker', ['load', '-i', tarPath], {
    maxBuffer: 10 * 1024 * 1024,
  })
  return `${stdout || ''}${stderr || ''}`.trim()
}

async function syncDockerDeploymentState(pool, deploymentRecord) {
  try {
    const containerEntries = await listDeploymentContainers(deploymentRecord)
    const summary = summarizeDeploymentContainers(containerEntries, deploymentRecord)
    const nextErrorMessage =
      (summary.problemEntry
        ? await resolveDeploymentErrorMessage(
            summary.problemEntry.containerId,
            summary.nextStatus,
            summary.problemEntry.inspectResult?.State?.Error,
          )
        : summary.primaryEntry
          ? await resolveDeploymentErrorMessage(
              summary.primaryEntry.containerId,
              summary.nextStatus,
              summary.primaryEntry.inspectResult?.State?.Error,
            )
          : null) ??
      deploymentRecord.error_message ??
      (summary.nextStatus === 'removed' ? 'Deployment containers are missing.' : null)

    if (
      summary.nextContainerName !== deploymentRecord.container_name ||
      summary.nextContainerId !== deploymentRecord.container_id ||
      summary.nextStatus !== deploymentRecord.status ||
      summary.nextStartedAt !== deploymentRecord.started_at ||
      summary.nextStoppedAt !== deploymentRecord.stopped_at ||
      nextErrorMessage !== deploymentRecord.error_message
    ) {
      await updateDockerDeploymentRecord(pool, deploymentRecord.id, {
        container_name: summary.nextContainerName,
        container_id: summary.nextContainerId,
        status: summary.nextStatus,
        started_at: toMysqlDatetimeValue(summary.nextStartedAt),
        stopped_at: toMysqlDatetimeValue(summary.nextStoppedAt),
        error_message: nextErrorMessage,
      })

      return {
        ...deploymentRecord,
        container_name: summary.nextContainerName,
        container_id: summary.nextContainerId,
        status: summary.nextStatus,
        started_at: summary.nextStartedAt,
        stopped_at: summary.nextStoppedAt,
        error_message: nextErrorMessage,
      }
    }

    return deploymentRecord
  } catch (error) {
    if (!isMissingDockerObjectError(error)) {
      throw error
    }

    const missingMessage = 'Deployment containers are missing.'
    if (deploymentRecord.status !== 'removed') {
      await updateDockerDeploymentRecord(pool, deploymentRecord.id, {
        container_id: null,
        status: 'removed',
        stopped_at: toMysqlDatetimeValue(new Date()),
        error_message: '컨테이너가 더 이상 존재하지 않습니다.',
      })
    }

    return {
      ...deploymentRecord,
      container_id: null,
      status: 'removed',
      stopped_at: toMysqlDatetimeValue(new Date()),
      error_message: '컨테이너가 더 이상 존재하지 않습니다.',
    }
  }
}

async function buildProjectDockerSummary(pool, projectId, actorName, projectAuthor, projectWriteAccess = false) {
  const [imageRows, deploymentRows, buildJobRows] = await Promise.all([
    listDockerImagesByProject(pool, projectId),
    listDockerDeploymentsByProject(pool, projectId),
    listDockerBuildJobsByProject(pool, projectId),
  ])
  const runtimeStatus = await getProjectDockerRuntimeStatus()

  const syncedDeployments = runtimeStatus.engineAvailable
    ? await Promise.all(deploymentRows.map((deployment) => syncDockerDeploymentState(pool, deployment)))
    : deploymentRows

  return {
    runtime: runtimeStatus,
    images: imageRows.map((row) => toDockerImageDto(row, actorName, projectAuthor, projectWriteAccess)),
    deployments: syncedDeployments.map((row) => toDockerDeploymentDto(row, actorName, projectAuthor, projectWriteAccess)),
    buildJobs: buildJobRows.map((row) => toDockerBuildJobDto(row, actorName, projectAuthor, projectWriteAccess)),
  }
}

async function insertDockerImageRecord(pool, payload) {
  const [result] = await pool.execute(
    `
      INSERT INTO docker_images (
        project_id,
        uploader_name,
        original_file_name,
        tar_path,
        image_name,
        image_tag,
        image_reference,
        image_id,
        size_bytes,
        layers,
        architecture,
        exposed_ports,
        environment_file_name,
        environment_file_path,
        compose_file_name,
        compose_file_path,
        compose_services,
        load_status,
        load_output,
        load_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.projectId,
      payload.uploaderName,
      payload.originalFileName,
      payload.tarPath,
      payload.imageName,
      payload.imageTag,
      payload.imageReference,
      payload.imageId,
      payload.sizeBytes,
      payload.layers,
      payload.architecture,
      JSON.stringify(payload.exposedPorts ?? []),
      payload.environmentFileName ?? null,
      payload.environmentFilePath ?? null,
      payload.composeFileName ?? null,
      payload.composeFilePath ?? null,
      JSON.stringify(payload.composeServices ?? []),
      payload.loadStatus,
      payload.loadOutput,
      payload.loadError,
    ],
  )

  return Number(result.insertId)
}

async function insertDockerDeploymentRecord(pool, payload) {
  const [result] = await pool.execute(
    `
      INSERT INTO docker_deployments (
        project_id,
        image_id,
        uploader_name,
        container_name,
        container_id,
        status,
        host_port,
        container_port,
        endpoint_url,
        run_output,
        error_message,
        started_at,
        stopped_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.projectId,
      payload.imageId,
      payload.uploaderName,
      payload.containerName,
      payload.containerId,
      payload.status,
      payload.hostPort,
      payload.containerPort,
      payload.endpointUrl,
      payload.runOutput,
      payload.errorMessage,
      payload.startedAt,
      payload.stoppedAt,
    ],
  )

  return Number(result.insertId)
}

async function ensureDockerImageIsRemovedIfOrphaned(pool, imageRecord, ignoredImageIds = []) {
  const identifier = imageRecord.image_id || imageRecord.image_reference
  if (!identifier) {
    return
  }

  const ignoredIds = ignoredImageIds.filter((value) => Number.isFinite(Number(value)))
  const idPlaceholders = ignoredIds.map(() => '?').join(', ')
  const sql = `
    SELECT COUNT(*) AS count
    FROM docker_images
    WHERE id <> ?
      ${ignoredIds.length > 0 ? `AND id NOT IN (${idPlaceholders})` : ''}
      AND (
        (image_id IS NOT NULL AND image_id = ?)
        OR (image_reference IS NOT NULL AND image_reference = ?)
      )
  `
  const params = [imageRecord.id, ...ignoredIds, imageRecord.image_id, imageRecord.image_reference]
  const [rows] = await pool.query(sql, params)
  const referenceCount = Number(rows[0]?.count ?? 0)

  if (referenceCount > 0) {
    return
  }

  try {
    await execFileAsync('docker', ['image', 'rm', '-f', identifier], {
      maxBuffer: 10 * 1024 * 1024,
    })
  } catch (error) {
    if (!isMissingDockerObjectError(error) && !isDockerImageInUseError(error)) {
      throw error
    }
  }
}

async function removeContainerIfExists(containerId) {
  if (!containerId) {
    return
  }

  try {
    await execFileAsync('docker', ['rm', '-f', containerId], {
      maxBuffer: 10 * 1024 * 1024,
    })
  } catch (error) {
    if (!isMissingDockerObjectError(error)) {
      throw error
    }
  }
}

async function removeContainersByLabel(labelKey, labelValue) {
  const containerIds = await listDockerContainerIdsByLabel(labelKey, labelValue)
  for (const containerId of containerIds) {
    await removeContainerIfExists(containerId)
  }
}

async function deleteDockerImageRecord(pool, imageRecord) {
  const [deploymentRows] = await pool.query(
    `
      SELECT id, container_id
      FROM docker_deployments
      WHERE image_id = ?
      ORDER BY id DESC
    `,
    [imageRecord.id],
  )

  for (const deployment of deploymentRows) {
    await removeContainerIfExists(deployment.container_id)
  }

  await removeContainersByLabel(`${DOCKER_LABEL_PREFIX}.imageRecordId`, String(imageRecord.id))

  await ensureDockerImageIsRemovedIfOrphaned(pool, imageRecord)

  for (const filePath of [imageRecord.tar_path, imageRecord.environment_file_path, imageRecord.compose_file_path]) {
    if (filePath) {
      await fs.promises.rm(filePath, { force: true })
    }
  }

  await pool.execute('DELETE FROM docker_images WHERE id = ?', [imageRecord.id])
}

async function runDockerDeployment(pool, imageRecord, uploaderName, preferredHostPort, environmentEntries = []) {
  const exposedPorts = Array.isArray(parseJsonValue(imageRecord.exposed_ports, []))
    ? sortPortSpecs(parseJsonValue(imageRecord.exposed_ports, []))
    : []
  const selectedContainerPort = exposedPorts[0] ?? null
  const attemptedHostPorts = new Set()
  let hostPort = await allocateHostPort(preferredHostPort, Boolean(selectedContainerPort), [
    ...(await listTrackedDeploymentHostPorts(pool)),
    ...attemptedHostPorts,
  ])

  const deploymentId = await insertDockerDeploymentRecord(pool, {
    projectId: imageRecord.project_id,
    imageId: imageRecord.id,
    uploaderName,
    containerName: null,
    containerId: null,
    status: 'creating',
    hostPort,
    containerPort: selectedContainerPort,
    endpointUrl: buildDeploymentEndpoint(hostPort, selectedContainerPort),
    runOutput: null,
    errorMessage: null,
    startedAt: null,
    stoppedAt: null,
  })

  const containerName = buildContainerName(imageRecord.project_id, deploymentId, uploaderName)
  const dockerArgs = [
    'run',
    '-d',
    '--name',
    containerName,
    '--restart',
    'unless-stopped',
    '--label',
    `${DOCKER_LABEL_PREFIX}.projectId=${imageRecord.project_id}`,
    '--label',
    `${DOCKER_LABEL_PREFIX}.imageRecordId=${imageRecord.id}`,
    '--label',
    `${DOCKER_LABEL_PREFIX}.deploymentId=${deploymentId}`,
    '--label',
    `${DOCKER_LABEL_PREFIX}.owner=${sanitizePathSegment(uploaderName, 'user')}`,
  ]

  if (selectedContainerPort && hostPort) {
    dockerArgs.push('-p', `${hostPort}:${selectedContainerPort}`)
  }

  for (const [variableName, variableValue] of environmentEntries) {
    dockerArgs.push('-e', `${variableName}=${variableValue}`)
  }

  dockerArgs.push(imageRecord.image_reference || imageRecord.image_id)

  while (true) {
    let containerId = null

    try {
    const { stdout, stderr } = await execFileAsync('docker', dockerArgs, {
      maxBuffer: 10 * 1024 * 1024,
    })
    containerId = String(stdout || '').trim()
    const inspectResult = await inspectDockerContainer(containerId)
    const nextStatus = toNullableString(inspectResult?.State?.Status, 64) ?? 'running'
    const startedAt =
      inspectResult?.State?.StartedAt && inspectResult.State.StartedAt !== '0001-01-01T00:00:00Z'
        ? inspectResult.State.StartedAt
        : new Date().toISOString()
    const stoppedAt =
      inspectResult?.State?.FinishedAt && inspectResult.State.FinishedAt !== '0001-01-01T00:00:00Z'
        ? inspectResult.State.FinishedAt
        : null
    const runOutput = [stdout, stderr].filter(Boolean).join('\n').trim() || null
      const errorMessage = await resolveDeploymentErrorMessage(
        containerId,
        nextStatus,
        inspectResult?.State?.Error,
      )

      if (selectedContainerPort && hostPort && isDockerPortBindingError({ message: errorMessage }) && attemptedHostPorts.size < 16) {
        await removeContainerIfExists(containerId)
        containerId = null
        attemptedHostPorts.add(hostPort)
        hostPort = await allocateHostPort(null, true, [
          ...(await listTrackedDeploymentHostPorts(pool)),
          ...attemptedHostPorts,
        ])
        const publishFlagIndex = dockerArgs.indexOf('-p')
        if (publishFlagIndex >= 0) {
          dockerArgs.splice(publishFlagIndex, 2, '-p', `${hostPort}:${selectedContainerPort}`)
        }
        await updateDockerDeploymentRecord(pool, deploymentId, {
          host_port: hostPort,
          endpoint_url: buildDeploymentEndpoint(hostPort, selectedContainerPort),
          container_name: null,
          container_id: null,
          status: 'creating',
          error_message: null,
          run_output: null,
          started_at: null,
          stopped_at: null,
        })
        continue
      }

      await updateDockerDeploymentRecord(pool, deploymentId, {
        container_name: containerName,
      container_id: containerId,
      status: nextStatus,
      run_output: runOutput,
      error_message: errorMessage,
      started_at: toMysqlDatetimeValue(startedAt),
      stopped_at: toMysqlDatetimeValue(stoppedAt),
    })

    return await getDockerDeploymentRecord(pool, deploymentId)
  } catch (error) {
    if (containerId) {
      await removeContainerIfExists(containerId)
      containerId = null
    }

    if (selectedContainerPort && hostPort && isDockerPortBindingError(error) && attemptedHostPorts.size < 16) {
      attemptedHostPorts.add(hostPort)
      hostPort = await allocateHostPort(null, true, [
        ...(await listTrackedDeploymentHostPorts(pool)),
        ...attemptedHostPorts,
      ])
      const publishFlagIndex = dockerArgs.indexOf('-p')
      if (publishFlagIndex >= 0) {
        dockerArgs.splice(publishFlagIndex, 2, '-p', `${hostPort}:${selectedContainerPort}`)
      }
      await updateDockerDeploymentRecord(pool, deploymentId, {
        host_port: hostPort,
        endpoint_url: buildDeploymentEndpoint(hostPort, selectedContainerPort),
        container_name: null,
        container_id: null,
        status: 'creating',
        error_message: null,
        run_output: null,
        started_at: null,
        stopped_at: null,
      })
      continue
    }

    await updateDockerDeploymentRecord(pool, deploymentId, {
      container_name: containerName,
      status: 'failed',
      error_message: toNullableString(String(error?.stderr || error?.message || '도커 실행에 실패했습니다.'), 2000),
      run_output: toNullableString(String(error?.stdout || ''), 2000),
      stopped_at: toMysqlDatetimeValue(new Date()),
    })
    return await getDockerDeploymentRecord(pool, deploymentId)
  }
}
}

async function ensureDockerImageBundleIsRemovedIfOrphaned(pool, imageRecord, ignoredImageIds = []) {
  const identifiers = getTrackedDockerImageIdentifiers(imageRecord)
  if (identifiers.length === 0) {
    return
  }

  const ignoredIds = ignoredImageIds
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
  const idPlaceholders = ignoredIds.map(() => '?').join(', ')
  const [rows] = await pool.query(
    `
      SELECT id, image_id, image_reference, load_output
      FROM docker_images
      WHERE id <> ?
        ${ignoredIds.length > 0 ? `AND id NOT IN (${idPlaceholders})` : ''}
    `,
    [imageRecord.id, ...ignoredIds],
  )

  const referencedIdentifiers = new Set()
  for (const row of rows) {
    for (const identifier of getTrackedDockerImageIdentifiers(row)) {
      referencedIdentifiers.add(identifier)
    }
  }

  for (const identifier of identifiers) {
    if (referencedIdentifiers.has(identifier)) {
      continue
    }

    try {
      await execFileAsync('docker', ['image', 'rm', '-f', identifier], {
        maxBuffer: 10 * 1024 * 1024,
      })
    } catch (error) {
      if (!isMissingDockerObjectError(error) && !isDockerImageInUseError(error)) {
        throw error
      }
    }
  }
}

async function removeDockerNetworkIfExists(networkId) {
  if (!networkId) {
    return
  }

  try {
    await execFileAsync('docker', ['network', 'rm', networkId], {
      maxBuffer: 10 * 1024 * 1024,
    })
  } catch (error) {
    const message = String(error?.stderr || error?.stdout || error?.message || '')
    if (!/No such network/i.test(message)) {
      throw error
    }
  }
}

async function removeNetworksByLabel(labelKey, labelValue) {
  const networkIds = await listDockerNetworkIdsByLabel(labelKey, labelValue)
  for (const networkId of networkIds) {
    await removeDockerNetworkIfExists(networkId)
  }
}

async function deleteDockerBundleImageRecord(pool, imageRecord) {
  const [deploymentRows] = await pool.query(
    `
      SELECT id, container_id
      FROM docker_deployments
      WHERE image_id = ?
      ORDER BY id DESC
    `,
    [imageRecord.id],
  )

  for (const deployment of deploymentRows) {
    if (imageRecord.compose_file_path) {
      await removeComposeDeploymentIfExists(imageRecord, deployment.id)
    }
    await removeContainersByLabel(`${DOCKER_LABEL_PREFIX}.deploymentId`, String(deployment.id))
    await removeContainerIfExists(deployment.container_id)
    await removeNetworksByLabel(`${DOCKER_LABEL_PREFIX}.deploymentId`, String(deployment.id))
    await fs.promises.rm(getComposeDeploymentRuntimeDir(deployment.id), { recursive: true, force: true }).catch(() => {})
  }

  await removeContainersByLabel(`${DOCKER_LABEL_PREFIX}.imageRecordId`, String(imageRecord.id))
  await removeNetworksByLabel(`${DOCKER_LABEL_PREFIX}.imageRecordId`, String(imageRecord.id))
  await ensureDockerImageBundleIsRemovedIfOrphaned(pool, imageRecord)

  if (imageRecord.tar_path) {
    await fs.promises.rm(imageRecord.tar_path, { force: true })
  }

  await pool.execute('DELETE FROM docker_images WHERE id = ?', [imageRecord.id])
}

function buildRuntimeBundleImages(bundleInfo) {
  return [...bundleInfo.bundleImages].sort((left, right) => {
    const leftIsPrimary =
      (left.imageReference || left.imageId) === (bundleInfo.primaryImage.imageReference || bundleInfo.primaryImage.imageId)
    const rightIsPrimary =
      (right.imageReference || right.imageId) === (bundleInfo.primaryImage.imageReference || bundleInfo.primaryImage.imageId)

    if (leftIsPrimary !== rightIsPrimary) {
      return leftIsPrimary ? 1 : -1
    }

    return String(left.imageReference || left.imageId || '').localeCompare(String(right.imageReference || right.imageId || ''))
  })
}

async function removeComposeDeploymentIfExists(imageRecord, deploymentId) {
  const composeFilePath = toNullableString(imageRecord?.compose_file_path, 500)
  if (!composeFilePath || !fs.existsSync(composeFilePath)) {
    return
  }

  const composeFilePaths = [composeFilePath]
  const overrideFilePath = getComposeDeploymentOverrideFilePath(deploymentId)
  const envFilePath = getComposeDeploymentEnvFilePath(deploymentId)

  if (fs.existsSync(overrideFilePath)) {
    composeFilePaths.push(overrideFilePath)
  }

  try {
    await execDockerCompose(
      buildComposeDeploymentProjectName(imageRecord.project_id, deploymentId),
      composeFilePaths,
      ['down', '--remove-orphans'],
      {
        cwd: path.dirname(composeFilePath),
        envFilePath: fs.existsSync(envFilePath) ? envFilePath : null,
      },
    )
  } catch {
    // Fall back to label-based cleanup below when the compose project metadata is gone.
  }
}

async function runDockerComposeDeployment(pool, imageRecord, uploaderName, preferredHostPort, environmentEntries = []) {
  const composeFilePath = toNullableString(imageRecord.compose_file_path, 500)
  if (!composeFilePath) {
    throw new Error('validation:Compose deployment requires an uploaded compose file.')
  }

  const bundleInfo = await inspectDockerBundle(imageRecord)
  const deploymentId = await insertDockerDeploymentRecord(pool, {
    projectId: imageRecord.project_id,
    imageId: imageRecord.id,
    uploaderName,
    containerName: null,
    containerId: null,
    status: 'creating',
    hostPort: null,
    containerPort: null,
    endpointUrl: null,
    runOutput: null,
    errorMessage: null,
    startedAt: null,
    stoppedAt: null,
  })
  const composeProjectName = buildComposeDeploymentProjectName(imageRecord.project_id, deploymentId)
  const composeWorkingDir = path.dirname(composeFilePath)
  const runtimeDir = getComposeDeploymentRuntimeDir(deploymentId)
  const envFilePath = getComposeDeploymentEnvFilePath(deploymentId)
  const overrideFilePath = getComposeDeploymentOverrideFilePath(deploymentId)

  try {
    await fs.promises.mkdir(runtimeDir, { recursive: true })
    await fs.promises.writeFile(envFilePath, formatEnvironmentEntriesAsEnvFile(environmentEntries), 'utf8')

    const composeConfig = await loadDockerComposeConfig(composeProjectName, [composeFilePath], envFilePath, composeWorkingDir)
    ensureComposeServicesReferenceImages(composeConfig)

    const composeServices = getComposeServiceMap(composeConfig)
    const primaryServiceName = selectPrimaryComposeService(composeConfig, bundleInfo)
    if (!primaryServiceName || !composeServices[primaryServiceName]) {
      throw new Error('validation:Could not determine the primary compose service for this bundle.')
    }

    const primaryServiceConfig = composeServices[primaryServiceName]
    const selectedContainerPort =
      listComposeServicePortSpecs(primaryServiceConfig)[0] ?? bundleInfo.primaryImage.exposedPorts[0] ?? null
    const composePublishedHostPort = getComposePublishedHostPort(primaryServiceConfig, selectedContainerPort)
    const hostPort =
      composePublishedHostPort ??
      (selectedContainerPort
        ? await allocateHostPort(preferredHostPort, true, await listTrackedDeploymentHostPorts(pool))
        : null)
    const endpointUrl = buildDeploymentEndpoint(hostPort, selectedContainerPort)

    await updateDockerDeploymentRecord(pool, deploymentId, {
      host_port: hostPort,
      container_port: selectedContainerPort,
      endpoint_url: endpointUrl,
    })

    await fs.promises.writeFile(
      overrideFilePath,
      buildComposeDeploymentOverrideFile(composeConfig, {
        projectId: imageRecord.project_id,
        imageRecordId: imageRecord.id,
        deploymentId,
        uploaderName,
        composeProjectName,
        primaryServiceName,
        environmentEntries,
        hostPort,
        containerPort: selectedContainerPort,
        injectPrimaryPortBinding: !composePublishedHostPort && Boolean(hostPort && selectedContainerPort),
      }),
      'utf8',
    )

    const composeFilePaths = [composeFilePath, overrideFilePath]
    const { stdout, stderr } = await execDockerCompose(
      composeProjectName,
      composeFilePaths,
      ['up', '-d', '--remove-orphans'],
      {
        cwd: composeWorkingDir,
        envFilePath,
      },
    )
    const runOutput = [stdout, stderr].filter(Boolean).join('\n').trim() || null
    const currentDeployment = await getDockerDeploymentRecord(pool, deploymentId)
    if (!currentDeployment) {
      throw new Error('Compose deployment record disappeared before state sync completed.')
    }
    const syncedDeployment = await syncDockerDeploymentState(pool, currentDeployment)

    await updateDockerDeploymentRecord(pool, deploymentId, {
      container_name: syncedDeployment?.container_name ?? null,
      container_id: syncedDeployment?.container_id ?? null,
      status: syncedDeployment?.status ?? 'creating',
      run_output: toNullableString(runOutput, 2000),
      error_message: syncedDeployment?.error_message ?? null,
      started_at: toMysqlDatetimeValue(syncedDeployment?.started_at ?? null),
      stopped_at: toMysqlDatetimeValue(syncedDeployment?.stopped_at ?? null),
    })

    return await getDockerDeploymentRecord(pool, deploymentId)
  } catch (error) {
    await removeComposeDeploymentIfExists(imageRecord, deploymentId)

    await updateDockerDeploymentRecord(pool, deploymentId, {
      status: 'failed',
      run_output: toNullableString(String(error?.stdout || error?.stderr || ''), 2000),
      error_message: toNullableString(String(error?.stderr || error?.message || 'Docker compose deployment failed.'), 2000),
      stopped_at: toMysqlDatetimeValue(new Date()),
    })

    return await getDockerDeploymentRecord(pool, deploymentId)
  }
}

async function runDockerBundleDeployment(pool, imageRecord, uploaderName, preferredHostPort, environmentEntries = []) {
  const bundleInfo = await inspectDockerBundle(imageRecord)
  const selectedContainerPort = bundleInfo.primaryImage.exposedPorts[0] ?? null
  const attemptedHostPorts = new Set()
  let hostPort = await allocateHostPort(preferredHostPort, Boolean(selectedContainerPort), [
    ...(await listTrackedDeploymentHostPorts(pool)),
    ...attemptedHostPorts,
  ])
  const deploymentId = await insertDockerDeploymentRecord(pool, {
    projectId: imageRecord.project_id,
    imageId: imageRecord.id,
    uploaderName,
    containerName: null,
    containerId: null,
    status: 'creating',
    hostPort,
    containerPort: selectedContainerPort,
    endpointUrl: buildDeploymentEndpoint(hostPort, selectedContainerPort),
    runOutput: null,
    errorMessage: null,
    startedAt: null,
    stoppedAt: null,
  })

  const networkName = buildDeploymentNetworkName(imageRecord.project_id, deploymentId)
  const labelEntries = [
    [`${DOCKER_LABEL_PREFIX}.projectId`, String(imageRecord.project_id)],
    [`${DOCKER_LABEL_PREFIX}.imageRecordId`, String(imageRecord.id)],
    [`${DOCKER_LABEL_PREFIX}.deploymentId`, String(deploymentId)],
    [`${DOCKER_LABEL_PREFIX}.owner`, sanitizePathSegment(uploaderName, 'user')],
  ]
  while (true) {
    const createdContainerIds = []
    let primaryContainerId = null
    let primaryContainerName = null

    try {
    await createDockerNetwork(networkName, labelEntries)

    const runOutputs = []
    for (const imageInfo of buildRuntimeBundleImages(bundleInfo)) {
      const isPrimary =
        (imageInfo.imageReference || imageInfo.imageId) ===
        (bundleInfo.primaryImage.imageReference || bundleInfo.primaryImage.imageId)
      const aliases = uniqueStrings([
        ...(Array.isArray(imageInfo.aliases) ? imageInfo.aliases : []),
        isPrimary ? 'app' : null,
      ])
      const containerName = isPrimary
        ? buildContainerName(imageRecord.project_id, deploymentId, uploaderName)
        : buildServiceContainerName(
            imageRecord.project_id,
            deploymentId,
            uploaderName,
            aliases[0] || imageInfo.imageName || imageInfo.imageReference,
          )
      const dockerArgs = [
        'run',
        '-d',
        '--name',
        containerName,
        '--restart',
        'unless-stopped',
        '--network',
        networkName,
        '--label',
        `${DOCKER_LABEL_PREFIX}.projectId=${imageRecord.project_id}`,
        '--label',
        `${DOCKER_LABEL_PREFIX}.imageRecordId=${imageRecord.id}`,
        '--label',
        `${DOCKER_LABEL_PREFIX}.deploymentId=${deploymentId}`,
        '--label',
        `${DOCKER_LABEL_PREFIX}.owner=${sanitizePathSegment(uploaderName, 'user')}`,
        '--label',
        `${DOCKER_LABEL_PREFIX}.role=${isPrimary ? 'primary' : 'sidecar'}`,
      ]

      for (const alias of aliases) {
        dockerArgs.push('--network-alias', alias)
      }

      if (isPrimary && selectedContainerPort && hostPort) {
        dockerArgs.push('-p', `${hostPort}:${selectedContainerPort}`)
      }

      for (const [variableName, variableValue] of environmentEntries) {
        dockerArgs.push('-e', `${variableName}=${variableValue}`)
      }

      dockerArgs.push(imageInfo.imageReference || imageInfo.imageId)

      const { stdout, stderr } = await execFileAsync('docker', dockerArgs, {
        maxBuffer: 10 * 1024 * 1024,
      })
      const containerId = String(stdout || '').trim()
      createdContainerIds.push(containerId)
      runOutputs.push([stdout, stderr].filter(Boolean).join('\n').trim())

      if (isPrimary) {
        primaryContainerId = containerId
        primaryContainerName = containerName
      }
    }

    const syncedDeployment = await syncDockerDeploymentState(
      pool,
      (await getDockerDeploymentRecord(pool, deploymentId)) ?? {
        id: deploymentId,
        project_id: imageRecord.project_id,
        image_id: imageRecord.id,
        uploader_name: uploaderName,
        container_name: primaryContainerName,
        container_id: primaryContainerId,
        status: 'creating',
        host_port: hostPort,
        container_port: selectedContainerPort,
        endpoint_url: buildDeploymentEndpoint(hostPort, selectedContainerPort),
        run_output: null,
        error_message: null,
        started_at: null,
        stopped_at: null,
      },
    )

    if (
      selectedContainerPort &&
      hostPort &&
      isDockerPortBindingError({ message: syncedDeployment?.error_message }) &&
      attemptedHostPorts.size < 16
    ) {
      for (const containerId of createdContainerIds.reverse()) {
        await removeContainerIfExists(containerId)
      }
      await removeDockerNetworkIfExists(networkName)
      attemptedHostPorts.add(hostPort)
      hostPort = await allocateHostPort(null, true, [
        ...(await listTrackedDeploymentHostPorts(pool)),
        ...attemptedHostPorts,
      ])
      await updateDockerDeploymentRecord(pool, deploymentId, {
        host_port: hostPort,
        endpoint_url: buildDeploymentEndpoint(hostPort, selectedContainerPort),
        container_name: null,
        container_id: null,
        status: 'creating',
        error_message: null,
        run_output: null,
        started_at: null,
        stopped_at: null,
      })
      continue
    }

    await updateDockerDeploymentRecord(pool, deploymentId, {
      container_name: primaryContainerName,
      container_id: primaryContainerId,
      status: syncedDeployment?.status ?? 'creating',
      run_output: toNullableString(runOutputs.filter(Boolean).join('\n'), 2000),
      error_message: syncedDeployment?.error_message ?? null,
      started_at: toMysqlDatetimeValue(syncedDeployment?.started_at ?? null),
      stopped_at: toMysqlDatetimeValue(syncedDeployment?.stopped_at ?? null),
    })

    return await getDockerDeploymentRecord(pool, deploymentId)
  } catch (error) {
    for (const containerId of createdContainerIds.reverse()) {
      await removeContainerIfExists(containerId)
    }
    await removeDockerNetworkIfExists(networkName)

    if (selectedContainerPort && hostPort && isDockerPortBindingError(error) && attemptedHostPorts.size < 16) {
      attemptedHostPorts.add(hostPort)
      hostPort = await allocateHostPort(null, true, [
        ...(await listTrackedDeploymentHostPorts(pool)),
        ...attemptedHostPorts,
      ])
      await updateDockerDeploymentRecord(pool, deploymentId, {
        host_port: hostPort,
        endpoint_url: buildDeploymentEndpoint(hostPort, selectedContainerPort),
        container_name: null,
        container_id: null,
        status: 'creating',
        error_message: null,
        run_output: null,
        started_at: null,
        stopped_at: null,
      })
      continue
    }

    await updateDockerDeploymentRecord(pool, deploymentId, {
      container_name: primaryContainerName,
      container_id: primaryContainerId,
      status: 'failed',
      error_message: toNullableString(String(error?.stderr || error?.message || 'Docker deployment failed.'), 2000),
      run_output: toNullableString(String(error?.stdout || error?.stderr || ''), 2000),
      stopped_at: toMysqlDatetimeValue(new Date()),
    })

    return await getDockerDeploymentRecord(pool, deploymentId)
  }
}
}

function getOrderedDeploymentContainerIds(deploymentRecord, containerEntries, action) {
  const primaryContainerId = selectPrimaryDeploymentContainer(containerEntries, deploymentRecord)?.containerId
  const orderedEntries = orderDeploymentContainers(
    containerEntries,
    primaryContainerId,
    action === 'start' || action === 'restart',
  )

  return orderedEntries.map((entry) => entry.containerId)
}

async function applyDockerBundleDeploymentAction(pool, deploymentRecord, action) {
  const containerEntries = await listDeploymentContainers(deploymentRecord)
  if (containerEntries.length === 0) {
    return await setDeploymentLifecycleState(pool, deploymentRecord, 'removed', 'Deployment containers are missing.')
  }

  const orderedContainerIds = getOrderedDeploymentContainerIds(deploymentRecord, containerEntries, action)
  for (const containerId of orderedContainerIds) {
    try {
      await execFileAsync('docker', [action, containerId], {
        maxBuffer: 10 * 1024 * 1024,
      })
    } catch (error) {
      if (!isMissingDockerObjectError(error)) {
        throw error
      }
    }
  }

  const latestDeployment = (await getDockerDeploymentRecord(pool, deploymentRecord.id)) ?? deploymentRecord
  return await syncDockerDeploymentState(pool, latestDeployment)
}

async function listDockerBundleDeploymentLogs(deploymentRecord, tail) {
  const containerEntries = await listDeploymentContainers(deploymentRecord)
  if (containerEntries.length === 0) {
    return ''
  }

  const primaryContainerId = selectPrimaryDeploymentContainer(containerEntries, deploymentRecord)?.containerId ?? null
  const orderedEntries = orderDeploymentContainers(containerEntries, primaryContainerId, false)
  const sections = []

  for (const entry of orderedEntries) {
    const containerName = extractDockerContainerName(entry.inspectResult) || entry.containerId.slice(0, 12)
    const status = toNullableString(entry.inspectResult?.State?.Status, 64) ?? 'unknown'
    let logs = ''

    try {
      logs = await listDockerContainerLogs(entry.containerId, tail)
    } catch (error) {
      logs = String(error?.stderr || error?.message || 'Could not read container logs.')
    }

    sections.push(`===== ${containerName} [${status}] =====\n${logs || '(no logs)'}`)
  }

  return sections.join('\n\n')
}

async function setDeploymentLifecycleState(pool, deploymentRecord, nextStatus, nextErrorMessage = null) {
  await updateDockerDeploymentRecord(pool, deploymentRecord.id, {
    status: nextStatus,
    error_message: nextErrorMessage,
    started_at: nextStatus === 'running' ? toMysqlDatetimeValue(new Date()) : toMysqlDatetimeValue(deploymentRecord.started_at),
    stopped_at: nextStatus === 'running' ? null : toMysqlDatetimeValue(new Date()),
  })

  return await getDockerDeploymentRecord(pool, deploymentRecord.id)
}

async function stopDeployment(pool, deploymentRecord) {
  if (!deploymentRecord.container_id) {
    return await setDeploymentLifecycleState(pool, deploymentRecord, 'removed', '컨테이너 ID가 없습니다.')
  }

  try {
    await execFileAsync('docker', ['stop', deploymentRecord.container_id], {
      maxBuffer: 10 * 1024 * 1024,
    })
  } catch (error) {
    if (!isMissingDockerObjectError(error)) {
      throw error
    }
  }

  return await setDeploymentLifecycleState(pool, deploymentRecord, 'exited')
}

async function startDeployment(pool, deploymentRecord) {
  if (!deploymentRecord.container_id) {
    return await setDeploymentLifecycleState(pool, deploymentRecord, 'removed', '컨테이너 ID가 없습니다.')
  }

  await execFileAsync('docker', ['start', deploymentRecord.container_id], {
    maxBuffer: 10 * 1024 * 1024,
  })

  const inspectResult = await inspectDockerContainer(deploymentRecord.container_id)
  const nextStatus = toNullableString(inspectResult?.State?.Status, 64) ?? 'running'
  const nextErrorMessage = await resolveDeploymentErrorMessage(
    deploymentRecord.container_id,
    nextStatus,
    inspectResult?.State?.Error,
  )

  await updateDockerDeploymentRecord(pool, deploymentRecord.id, {
    status: nextStatus,
    error_message: nextErrorMessage,
    started_at: toMysqlDatetimeValue(new Date()),
    stopped_at: null,
  })

  return await getDockerDeploymentRecord(pool, deploymentRecord.id)
}

async function restartDeployment(pool, deploymentRecord) {
  if (!deploymentRecord.container_id) {
    return await setDeploymentLifecycleState(pool, deploymentRecord, 'removed', '컨테이너 ID가 없습니다.')
  }

  await execFileAsync('docker', ['restart', deploymentRecord.container_id], {
    maxBuffer: 10 * 1024 * 1024,
  })

  const inspectResult = await inspectDockerContainer(deploymentRecord.container_id)
  const nextStatus = toNullableString(inspectResult?.State?.Status, 64) ?? 'running'
  const nextErrorMessage = await resolveDeploymentErrorMessage(
    deploymentRecord.container_id,
    nextStatus,
    inspectResult?.State?.Error,
  )

  await updateDockerDeploymentRecord(pool, deploymentRecord.id, {
    status: nextStatus,
    error_message: nextErrorMessage,
    started_at: toMysqlDatetimeValue(new Date()),
    stopped_at: null,
  })

  return await getDockerDeploymentRecord(pool, deploymentRecord.id)
}

function mergeRequestedContainerPort(exposedPorts, requestedContainerPort) {
  const normalizedRequestedPort = normalizeDockerContainerPortSpec(requestedContainerPort)
  if (!normalizedRequestedPort) {
    return sortPortSpecs(exposedPorts ?? [])
  }

  return sortPortSpecs([normalizedRequestedPort, ...(exposedPorts ?? []).filter((value) => value !== normalizedRequestedPort)])
}

async function resolveDockerBuildJobEnvironmentEntries(buildJobRecord) {
  const environmentFileEntries = buildJobRecord.environment_file_path
    ? parseEnvironmentEntries(await fs.promises.readFile(buildJobRecord.environment_file_path, 'utf8'))
    : []
  const inlineEntries = parseStoredRuntimeEnvironmentEntries(buildJobRecord.runtime_environment)
  return mergeEnvironmentEntryGroups(environmentFileEntries, inlineEntries)
}

async function executeDockerBuildJob(pool, buildJobRecord) {
  const extractionDir = path.join(DOCKER_BUILD_EXTRACT_ROOT, String(buildJobRecord.id))
  let buildOutput = buildJobRecord.build_output ?? null
  let imageRecordId = buildJobRecord.image_record_id ? Number(buildJobRecord.image_record_id) : null

  try {
    await updateDockerBuildJobRecord(pool, buildJobRecord.id, {
      status: 'extracting',
      error_message: null,
      started_at: toMysqlDatetimeValue(buildJobRecord.started_at ?? new Date()),
      finished_at: null,
    })

    await extractDockerSourceArchive(buildJobRecord.source_archive_path, extractionDir)

    const contextDir = resolveBundlePath(extractionDir, buildJobRecord.context_path || '.')
    const dockerfilePath = resolveBundlePath(extractionDir, buildJobRecord.dockerfile_path || 'Dockerfile')
    const contextStat = await fs.promises.stat(contextDir)
    const dockerfileStat = await fs.promises.stat(dockerfilePath)

    if (!contextStat.isDirectory()) {
      throw new Error(`validation:Build context is not a directory: ${buildJobRecord.context_path || '.'}`)
    }

    if (!dockerfileStat.isFile()) {
      throw new Error(`validation:Dockerfile was not found: ${buildJobRecord.dockerfile_path || 'Dockerfile'}`)
    }

    const imageRef = buildDockerSourceImageReference(buildJobRecord)

    await updateDockerBuildJobRecord(pool, buildJobRecord.id, {
      status: 'building',
      image_name: imageRef.imageName,
      image_tag: imageRef.imageTag,
    })

    const { stdout, stderr } = await execFileAsync(
      'docker',
      ['build', '-t', imageRef.imageReference, '-f', dockerfilePath, contextDir],
      {
        maxBuffer: DOCKER_BUILD_MAX_BUFFER_BYTES,
      },
    )
    buildOutput = [stdout, stderr].filter(Boolean).join('\n').trim() || null

    const inspectInfo = await inspectDockerImage(imageRef.imageReference)
    const exposedPorts = mergeRequestedContainerPort(
      inspectInfo.exposedPorts,
      buildJobRecord.requested_container_port,
    )

    imageRecordId = await insertDockerImageRecord(pool, {
      projectId: buildJobRecord.project_id,
      uploaderName: buildJobRecord.uploader_name,
      originalFileName: buildJobRecord.source_file_name,
      tarPath: buildJobRecord.source_archive_path,
      imageName: inspectInfo.imageName ?? imageRef.imageName,
      imageTag: inspectInfo.imageTag ?? imageRef.imageTag,
      imageReference: inspectInfo.imageReference ?? imageRef.imageReference,
      imageId: inspectInfo.imageId,
      sizeBytes: inspectInfo.sizeBytes,
      layers: inspectInfo.layers ?? 0,
      architecture: inspectInfo.architecture,
      exposedPorts,
      environmentFileName: buildJobRecord.environment_file_name ?? null,
      environmentFilePath: buildJobRecord.environment_file_path ?? null,
      composeFileName: null,
      composeFilePath: null,
      composeServices: [],
      loadStatus: 'built',
      loadOutput: buildOutput,
      loadError: null,
    })

    await updateDockerBuildJobRecord(pool, buildJobRecord.id, {
      image_record_id: imageRecordId,
      status: 'deploying',
      build_output: buildOutput,
      error_message: null,
    })

    const imageRecord = await getDockerImageRecord(pool, imageRecordId)
    const environmentEntries = await resolveDockerBuildJobEnvironmentEntries(buildJobRecord)
    const deploymentRecord = await runDockerDeployment(
      pool,
      imageRecord,
      buildJobRecord.uploader_name,
      parseOptionalPositiveInt(buildJobRecord.preferred_host_port),
      environmentEntries,
    )

    await updateDockerBuildJobRecord(pool, buildJobRecord.id, {
      deployment_id: deploymentRecord?.id ?? null,
      status: deploymentRecord?.status === 'failed' ? 'failed' : 'completed',
      build_output: buildOutput,
      error_message: deploymentRecord?.status === 'failed' ? deploymentRecord.error_message ?? null : null,
      finished_at: toMysqlDatetimeValue(new Date()),
    })
  } catch (error) {
    const errorOutput = [buildOutput, error?.stdout, error?.stderr].filter(Boolean).join('\n').trim() || null

    await updateDockerBuildJobRecord(pool, buildJobRecord.id, {
      status: 'failed',
      build_output: errorOutput,
      error_message: toNullableString(String(error?.stderr || error?.message || 'Docker source build failed.'), 2000),
      image_record_id: imageRecordId ?? null,
      finished_at: toMysqlDatetimeValue(new Date()),
    })
  } finally {
    await fs.promises.rm(extractionDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function claimNextDockerBuildJob(pool) {
  const [rows] = await pool.query(
    `
      SELECT id
      FROM docker_build_jobs
      WHERE status = 'queued'
      ORDER BY id ASC
      LIMIT 1
    `,
  )

  const nextJobId = Number(rows[0]?.id ?? 0)
  if (!Number.isFinite(nextJobId) || nextJobId <= 0) {
    return null
  }

  const [result] = await pool.execute(
    `
      UPDATE docker_build_jobs
      SET status = 'extracting',
          started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
          finished_at = NULL,
          error_message = NULL
      WHERE id = ?
        AND status = 'queued'
    `,
    [nextJobId],
  )

  if (Number(result.affectedRows ?? 0) === 0) {
    return null
  }

  return await getDockerBuildJobRecord(pool, nextJobId)
}

const dockerBuildWorkerState = {
  timer: null,
  running: false,
  rerunRequested: false,
}

async function processDockerBuildJobs(pool) {
  if (dockerBuildWorkerState.running) {
    dockerBuildWorkerState.rerunRequested = true
    return
  }

  dockerBuildWorkerState.running = true

  try {
    while (true) {
      const nextJob = await claimNextDockerBuildJob(pool)
      if (!nextJob) {
        break
      }

      await executeDockerBuildJob(pool, nextJob)
    }
  } finally {
    dockerBuildWorkerState.running = false

    if (dockerBuildWorkerState.rerunRequested) {
      dockerBuildWorkerState.rerunRequested = false
      setTimeout(() => {
        void processDockerBuildJobs(pool)
      }, 0)
    }
  }
}

function scheduleDockerBuildJobs(pool) {
  setTimeout(() => {
    void processDockerBuildJobs(pool)
  }, 0)
}

async function requeueInterruptedDockerBuildJobs(pool) {
  await pool.execute(
    `
      UPDATE docker_build_jobs
      SET status = 'queued',
          error_message = NULL,
          finished_at = NULL
      WHERE status IN ('extracting', 'building', 'deploying')
    `,
  )
}

export async function startDockerBuildJobWorker(pool) {
  if (dockerBuildWorkerState.timer) {
    return () => {
      if (dockerBuildWorkerState.timer) {
        clearInterval(dockerBuildWorkerState.timer)
        dockerBuildWorkerState.timer = null
      }
    }
  }

  await requeueInterruptedDockerBuildJobs(pool)

  dockerBuildWorkerState.timer = setInterval(() => {
    void processDockerBuildJobs(pool)
  }, DOCKER_BUILD_WORKER_POLL_MS)
  dockerBuildWorkerState.timer.unref?.()

  scheduleDockerBuildJobs(pool)

  return () => {
    if (dockerBuildWorkerState.timer) {
      clearInterval(dockerBuildWorkerState.timer)
      dockerBuildWorkerState.timer = null
    }
  }
}

async function cleanupProjectUploadDirectory(projectId) {
  await fs.promises.rm(path.join(DOCKER_UPLOADS_ROOT, String(projectId)), {
    recursive: true,
    force: true,
  })
}

async function listHostDockerContainers() {
  try {
    const { stdout } = await execFileAsync(
      'docker',
      ['ps', '-a', '--format', '{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}'],
      {
        maxBuffer: 10 * 1024 * 1024,
      },
    )

    return String(stdout || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [id = '', name = '', image = '', status = '', ports = ''] = line.split('|')
        return {
          id,
          name,
          image,
          status,
          ports,
        }
      })
  } catch (error) {
    return {
      error: toNullableString(String(error?.stderr || error?.message || 'Docker 컨테이너 목록을 불러오지 못했습니다.'), 1000),
      containers: [],
    }
  }
}

async function getDockerServerVersion() {
  try {
    const { stdout } = await execFileAsync('docker', ['version', '--format', '{{.Server.Version}}'], {
      maxBuffer: 1024 * 1024,
    })

    return toNullableString(String(stdout || '').trim(), 120)
  } catch (error) {
    return toNullableString(String(error?.stderr || error?.message || 'unknown'), 255)
  }
}

async function listAdminDockerImages(pool, limit = 20) {
  const [rows] = await pool.query(
    `
      SELECT
        i.*,
        p.title AS project_title,
        p.author AS project_author
      FROM docker_images i
      INNER JOIN projects p ON p.id = i.project_id
      ORDER BY i.updated_at DESC
      LIMIT ?
    `,
    [limit],
  )

  return rows
}

async function listAdminDockerDeployments(pool, limit = 20) {
  const [rows] = await pool.query(
    `
      SELECT
        d.*,
        p.title AS project_title,
        p.author AS project_author,
        i.image_reference,
        i.original_file_name
      FROM docker_deployments d
      INNER JOIN projects p ON p.id = d.project_id
      LEFT JOIN docker_images i ON i.id = d.image_id
      ORDER BY d.updated_at DESC
      LIMIT ?
    `,
    [limit],
  )

  return rows
}

async function buildAdminDockerOverview(pool) {
  const [dockerVersion, hostContainerResult, imageRows, deploymentRows, imageCountRows, deploymentCountRows] =
    await Promise.all([
      getDockerServerVersion(),
      listHostDockerContainers(),
      listAdminDockerImages(pool, 24),
      listAdminDockerDeployments(pool, 24),
      pool.query('SELECT COUNT(*) AS count FROM docker_images'),
      pool.query('SELECT COUNT(*) AS count FROM docker_deployments'),
    ])

  const syncedDeployments = []
  for (const row of deploymentRows) {
    const synced = await syncDockerDeploymentState(pool, row)
    syncedDeployments.push({
      ...toDockerDeploymentDto(synced, synced.uploader_name, synced.project_author ?? synced.uploader_name),
      projectTitle: row.project_title,
      projectAuthor: row.project_author,
      imageReference: row.image_reference,
      originalFileName: row.original_file_name,
      canManage: true,
    })
  }

  const images = imageRows.map((row) => ({
    ...toDockerImageDto(row, row.uploader_name, row.project_author ?? row.uploader_name),
    projectTitle: row.project_title,
    projectAuthor: row.project_author,
    canManage: true,
  }))

  const containers =
    Array.isArray(hostContainerResult) ? hostContainerResult : Array.isArray(hostContainerResult?.containers) ? hostContainerResult.containers : []

  return {
    runtime: {
      dockerVersion,
      hostContainerCount: containers.length,
      imageCount: Number(imageCountRows[0]?.[0]?.count ?? imageCountRows[0]?.count ?? 0),
      deploymentCount: Number(deploymentCountRows[0]?.[0]?.count ?? deploymentCountRows[0]?.count ?? 0),
      containerError: Array.isArray(hostContainerResult) ? null : hostContainerResult?.error ?? null,
    },
    images,
    deployments: syncedDeployments,
    hostContainers: containers,
  }
}

async function cleanupProjectDockerBuildJobs(pool, projectId) {
  const buildJobRows = await listDockerBuildJobsByProject(pool, projectId)

  for (const buildJob of buildJobRows) {
    await fs.promises.rm(buildJob.source_archive_path, { force: true }).catch(() => {})
    if (buildJob.environment_file_path) {
      await fs.promises.rm(buildJob.environment_file_path, { force: true }).catch(() => {})
    }
    await fs.promises.rm(path.join(DOCKER_BUILD_EXTRACT_ROOT, String(buildJob.id)), {
      recursive: true,
      force: true,
    }).catch(() => {})
  }

  await pool.execute('DELETE FROM docker_build_jobs WHERE project_id = ?', [projectId])
}

export async function cleanupProjectDockerResources(pool, projectId) {
  await removeContainersByLabel(`${DOCKER_LABEL_PREFIX}.projectId`, String(projectId))
  await removeNetworksByLabel(`${DOCKER_LABEL_PREFIX}.projectId`, String(projectId))

  const imageRows = await listDockerImagesByProject(pool, projectId)
  for (const imageRecord of imageRows) {
    await deleteDockerBundleImageRecord(pool, imageRecord)
  }

  await cleanupProjectDockerBuildJobs(pool, projectId)
  await cleanupProjectUploadDirectory(projectId)
}

export function attachAdminDockerRoutes(router, pool, options = {}) {
  const authenticateJWT = typeof options.authenticateJWT === 'function' ? options.authenticateJWT : null
  const requireAdmin = typeof options.requireAdmin === 'function' ? options.requireAdmin : null
  const handleApiError = typeof options.handleApiError === 'function' ? options.handleApiError : null
  const createAuditLog = typeof options.createAuditLog === 'function' ? options.createAuditLog : null

  if (!authenticateJWT || !requireAdmin || !handleApiError) {
    throw new Error('attachAdminDockerRoutes requires authenticateJWT, requireAdmin, and handleApiError')
  }

  router.get('/services/overview', authenticateJWT, requireAdmin, async (_req, res) => {
    try {
      res.json(await buildAdminDockerOverview(pool))
    } catch (error) {
      handleApiError(res, error, '서비스 관제 정보를 불러오지 못했습니다.')
    }
  })

  router.get('/services/deployments/:deploymentId/logs', authenticateJWT, requireAdmin, async (req, res) => {
    const deploymentId = Number.parseInt(String(req.params.deploymentId), 10)
    if (!Number.isFinite(deploymentId) || deploymentId <= 0) {
      res.status(400).json({ error: 'Invalid deployment id.' })
      return
    }

    try {
      const deploymentRecord = await getDockerDeploymentRecord(pool, deploymentId)
      if (!deploymentRecord) {
        res.status(404).json({ error: 'Deployment not found.' })
        return
      }

      const tail = Math.min(parseOptionalPositiveInt(req.query.tail) ?? DEFAULT_LOG_TAIL, 1000)
      const logs = await listDockerBundleDeploymentLogs(deploymentRecord, tail)
      res.json({ deploymentId, logs })
    } catch (error) {
      handleApiError(res, error, '배포 로그를 불러오지 못했습니다.')
    }
  })

  router.post('/services/deployments/:deploymentId/:action', authenticateJWT, requireAdmin, async (req, res) => {
    const deploymentId = Number.parseInt(String(req.params.deploymentId), 10)
    const action = String(req.params.action ?? '').trim().toLowerCase()

    if (!Number.isFinite(deploymentId) || deploymentId <= 0) {
      res.status(400).json({ error: 'Invalid deployment id.' })
      return
    }

    if (!['start', 'stop', 'restart'].includes(action)) {
      res.status(400).json({ error: 'Unsupported deployment action.' })
      return
    }

    try {
      const deploymentRecord = await getDockerDeploymentRecord(pool, deploymentId)
      if (!deploymentRecord) {
        res.status(404).json({ error: 'Deployment not found.' })
        return
      }

      const nextDeployment = await applyDockerBundleDeploymentAction(pool, deploymentRecord, action)
      if (createAuditLog) {
        await createAuditLog(pool, 'DOCKER_DEPLOYMENT_ACTION', {
          deploymentId,
          action,
          adminUserId: req.user.userId,
        })
      }

      res.json({
        deployment: {
          ...toDockerDeploymentDto(nextDeployment, nextDeployment.uploader_name, nextDeployment.uploader_name),
          canManage: true,
        },
      })
    } catch (error) {
      handleApiError(res, error, '배포 상태를 변경하지 못했습니다.')
    }
  })

  router.delete('/services/images/:imageId', authenticateJWT, requireAdmin, async (req, res) => {
    const imageId = Number.parseInt(String(req.params.imageId), 10)
    if (!Number.isFinite(imageId) || imageId <= 0) {
      res.status(400).json({ error: 'Invalid image id.' })
      return
    }

    try {
      const imageRecord = await getDockerImageRecord(pool, imageId)
      if (!imageRecord) {
        res.status(404).json({ error: 'Image not found.' })
        return
      }

      await deleteDockerBundleImageRecord(pool, imageRecord)
      if (createAuditLog) {
        await createAuditLog(pool, 'DOCKER_IMAGE_DELETED', {
          imageId,
          projectId: imageRecord.project_id,
          adminUserId: req.user.userId,
        })
      }

      res.json({ removedImageId: imageId })
    } catch (error) {
      handleApiError(res, error, '도커 이미지를 삭제하지 못했습니다.')
    }
  })
}

export function setupDockerRoutes(app, pool, options = {}) {
  const handleApiError = typeof options.handleApiError === 'function' ? options.handleApiError : null
  const getProjectById = typeof options.getProjectById === 'function' ? options.getProjectById : null
  const readProjectActorName =
    typeof options.readProjectActorName === 'function' ? options.readProjectActorName : defaultReadActorName
  const authorizeProjectWrite =
    typeof options.authorizeProjectWrite === 'function' ? options.authorizeProjectWrite : null

  if (!handleApiError || !getProjectById) {
    throw new Error('도커 라우트에는 handleApiError 와 getProjectById 헬퍼가 필요합니다.')
  }

  const dockerUploadMiddleware = fileUpload({
    createParentPath: true,
    abortOnLimit: true,
    limits: { fileSize: DOCKER_UPLOAD_LIMIT_BYTES },
    useTempFiles: true,
    tempFileDir: DOCKER_TEMP_DIR,
  })

  const router = express.Router({ mergeParams: true })

  router.use(async (req, res, next) => {
    const projectId = Number.parseInt(String(req.params.id), 10)
    if (!Number.isFinite(projectId) || projectId <= 0) {
      res.status(400).json({ error: '프로젝트 ID가 올바르지 않습니다.', requestId: req.requestId })
      return
    }

    try {
      const project = await getProjectById(pool, projectId)
      if (!project) {
        res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.', requestId: req.requestId })
        return
      }

      req.projectId = projectId
      req.project = project
      req.actorName = readProjectActorName(req)
      req.projectWriteAccess = authorizeProjectWrite ? Boolean(authorizeProjectWrite(req, project)) : false
      next()
    } catch (error) {
      handleApiError(res, error, '도커 프로젝트 정보를 준비하지 못했습니다.')
    }
  })

  router.get('/', async (req, res) => {
    try {
      const summary = await buildProjectDockerSummary(
        pool,
        req.projectId,
        req.actorName,
        req.project.author,
        req.projectWriteAccess,
      )
      res.json(summary)
    } catch (error) {
      handleApiError(res, error, '도커 프로젝트 요약을 불러오지 못했습니다.')
    }
  })

  router.post('/source-builds', dockerUploadMiddleware, async (req, res) => {
    const actorName = toNullableString(req.actorName, 120)
    if (!req.projectWriteAccess) {
      res.status(403).json({ error: 'Only authorized project editors can start Docker source builds.', requestId: req.requestId })
      return
    }
    if (!actorName) {
      res.status(400).json({ error: 'Uploader name is required for Docker source builds.', requestId: req.requestId })
      return
    }

    let buildJobId = null
    const pendingArtifactPaths = []

    try {
      await assertDockerEngineAvailable()

      if (!req.files || !req.files.sourceBundle) {
        throw new Error('validation:A source bundle tar file is required.')
      }

      const sourceBundle = getUploadedFile(req.files.sourceBundle)
      const environmentFile = getUploadedFile(req.files.environmentFile)
      const sourceFileName = sanitizeFileName(sourceBundle.name)

      if (!isSupportedDockerSourceBundleFileName(sourceFileName)) {
        throw new Error('validation:Source bundles must use .tar, .tar.gz, or .tgz.')
      }

      if (environmentFile && !isEnvironmentConfigFileName(environmentFile.name)) {
        throw new Error('validation:Only .env-style files may be uploaded as runtime environment files.')
      }

      const dockerfilePath = String(req.body?.dockerfilePath ?? 'Dockerfile').trim().replace(/\\/g, '/') || 'Dockerfile'
      const contextPath = String(req.body?.contextPath ?? '.').trim().replace(/\\/g, '/') || '.'
      if (path.isAbsolute(dockerfilePath) || path.isAbsolute(contextPath)) {
        throw new Error('validation:dockerfilePath and contextPath must be relative to the uploaded bundle.')
      }

      const imageName = toNullableString(req.body?.imageName, 255)
      const imageTag = toNullableString(req.body?.imageTag, 120)
      const preferredHostPort = parseOptionalPositiveInt(req.body?.preferredHostPort)
      const requestedContainerPortInput = toNullableString(req.body?.containerPort, 32)
      const requestedContainerPort = normalizeDockerContainerPortSpec(requestedContainerPortInput)
      if (requestedContainerPortInput && !requestedContainerPort) {
        throw new Error('validation:containerPort must use PORT or PORT/protocol format.')
      }

      const runtimeEnvironmentEntries = parseEnvironmentEntries(req.body?.environment)
      const runtimeEnvironmentJson =
        runtimeEnvironmentEntries.length > 0 ? JSON.stringify(Object.fromEntries(runtimeEnvironmentEntries)) : null

      const projectUploadDir = path.join(
        DOCKER_UPLOADS_ROOT,
        String(req.projectId),
        sanitizePathSegment(actorName, 'user'),
      )
      await fs.promises.mkdir(projectUploadDir, { recursive: true })

      const sourceArchivePath = path.join(projectUploadDir, `${Date.now()}-source-${sourceFileName}`)
      pendingArtifactPaths.push(sourceArchivePath)
      await sourceBundle.mv(sourceArchivePath)

      let environmentFileName = null
      let environmentFilePath = null
      if (environmentFile) {
        environmentFileName = sanitizeFileName(environmentFile.name)
        environmentFilePath = path.join(projectUploadDir, `${Date.now()}-env-${environmentFileName}`)
        pendingArtifactPaths.push(environmentFilePath)
        await environmentFile.mv(environmentFilePath)
      }

      buildJobId = await insertDockerBuildJobRecord(pool, {
        projectId: req.projectId,
        uploaderName: actorName,
        sourceFileName,
        sourceArchivePath,
        dockerfilePath,
        contextPath,
        imageName,
        imageTag,
        requestedContainerPort,
        preferredHostPort,
        environmentFileName,
        environmentFilePath,
        runtimeEnvironment: runtimeEnvironmentJson,
        status: 'queued',
      })

      scheduleDockerBuildJobs(pool)

      const [buildJobRecord, summary] = await Promise.all([
        getDockerBuildJobRecord(pool, buildJobId),
        buildProjectDockerSummary(pool, req.projectId, actorName, req.project.author, req.projectWriteAccess),
      ])

      res.status(202).json({
        buildJob: toDockerBuildJobDto(buildJobRecord, actorName, req.project.author, req.projectWriteAccess),
        ...summary,
      })
    } catch (error) {
      if (!buildJobId && pendingArtifactPaths.length > 0) {
        await Promise.all(
          pendingArtifactPaths.map(async (filePath) => {
            try {
              await fs.promises.rm(filePath, { force: true })
            } catch {
              // Ignore cleanup failures for partially uploaded artifacts.
            }
          }),
        )
      }

      handleApiError(res, error, 'Docker source build upload failed.')
    }
  })

  router.post('/images', dockerUploadMiddleware, async (req, res) => {
    const actorName = toNullableString(req.actorName, 120)
    if (!req.projectWriteAccess) {
      res.status(403).json({ error: 'Only authorized project editors can upload Docker images.', requestId: req.requestId })
      return
    }
    if (!actorName) {
      res.status(400).json({ error: '도커 업로드에는 사용자 이름이 필요합니다.', requestId: req.requestId })
      return
    }

    let imageId = null
    const pendingArtifactPaths = []

    try {
      await assertDockerEngineAvailable()

      if (!req.files || !req.files.tarFile) {
        throw new Error('validation:도커 이미지 tar 파일이 필요합니다.')
      }

      const tarFile = getUploadedFile(req.files.tarFile)
      const environmentFile = getUploadedFile(req.files.environmentFile)
      const composeFile = getUploadedFile(req.files.composeFile)
      const fileName = sanitizeFileName(tarFile.name)
      if (!isSupportedDockerArchiveFileName(fileName)) {
        throw new Error('validation:.tar, .tar.gz, .tgz 형식의 도커 이미지 아카이브만 지원합니다.')
      }

      if (environmentFile && !isEnvironmentConfigFileName(environmentFile.name)) {
        throw new Error('validation:.env ?뺤떇???섍꼍 ?ㅼ젙 ?뚯씪留??낅줈?쒗븷 ???덉뒿?덈떎.')
      }

      if (composeFile && !isComposeConfigFileName(composeFile.name)) {
        throw new Error('validation:docker-compose.yml ?먮뒗 .yaml/.yml ?뺤떇???뚯씪留??낅줈?쒗븷 ???덉뒿?덈떎.')
      }

      const preferredHostPort = parseOptionalPositiveInt(req.body?.preferredHostPort)
      const inlineEnvironmentEntries = parseEnvironmentEntries(req.body?.environment)
      const projectUploadDir = path.join(
        DOCKER_UPLOADS_ROOT,
        String(req.projectId),
        sanitizePathSegment(actorName, 'user'),
      )
      await fs.promises.mkdir(projectUploadDir, { recursive: true })

      const uploadPath = path.join(projectUploadDir, `${Date.now()}-${fileName}`)
      pendingArtifactPaths.push(uploadPath)
      await tarFile.mv(uploadPath)

      let environmentFileName = null
      let environmentFilePath = null
      let composeFileName = null
      let composeFilePath = null
      let composeServices = []
      let uploadedEnvironmentEntries = []

      if (environmentFile) {
        environmentFileName = sanitizeFileName(environmentFile.name)
        environmentFilePath = path.join(projectUploadDir, `${Date.now()}-env-${environmentFileName}`)
        pendingArtifactPaths.push(environmentFilePath)
        await environmentFile.mv(environmentFilePath)
        uploadedEnvironmentEntries = parseEnvironmentEntries(await fs.promises.readFile(environmentFilePath, 'utf8'))
      }

      if (composeFile) {
        composeFileName = sanitizeFileName(composeFile.name)
        composeFilePath = path.join(projectUploadDir, `${Date.now()}-compose-${composeFileName}`)
        pendingArtifactPaths.push(composeFilePath)
        await composeFile.mv(composeFilePath)
        composeServices = parseComposeServiceNames(await fs.promises.readFile(composeFilePath, 'utf8'))
      }

      const environmentEntries = mergeEnvironmentEntryGroups(uploadedEnvironmentEntries, inlineEnvironmentEntries)

      const manifestInfo = await parseDockerArchiveMetadata(uploadPath)
      const initialTagInfo = parseRepoTag(manifestInfo.repoTags[0] ?? fileName.replace(/\.tar(?:\.gz)?$/i, ''))

      try {
        imageId = await insertDockerImageRecord(pool, {
          projectId: req.projectId,
          uploaderName: actorName,
          originalFileName: fileName,
          tarPath: uploadPath,
          imageName: initialTagInfo.imageName ?? fileName,
          imageTag: initialTagInfo.imageTag,
          imageReference: manifestInfo.repoTags[0] ?? null,
          imageId: null,
          sizeBytes: Number(tarFile.size ?? 0),
          layers: manifestInfo.layerCount,
          architecture: null,
          exposedPorts: [],
          environmentFileName,
          environmentFilePath,
          composeFileName,
          composeFilePath,
          composeServices,
          loadStatus: 'uploaded',
          loadOutput: null,
          loadError: null,
        })

        const loadOutput = await loadDockerImageArchive(uploadPath)
        const loadInfo = parseDockerLoadOutput(loadOutput)
        const bundleInfo = await inspectDockerBundleIdentifiers([
          ...loadInfo.loadedReferences,
          ...manifestInfo.repoTags,
          ...loadInfo.loadedImageIds,
        ])

        if (!bundleInfo.primaryImage) {
          throw new Error('validation:도커 이미지를 로드했지만 검사 대상 이미지를 식별하지 못했습니다.')
        }

        const inspectInfo = bundleInfo.primaryImage
        await updateDockerImageRecord(pool, imageId, {
          image_name: inspectInfo.imageName,
          image_tag: inspectInfo.imageTag,
          image_reference: inspectInfo.imageReference,
          image_id: inspectInfo.imageId,
          size_bytes: inspectInfo.sizeBytes,
          architecture: inspectInfo.architecture,
          exposed_ports: JSON.stringify(inspectInfo.exposedPorts),
          load_status: 'loaded',
          load_output: loadOutput,
          load_error: null,
        })
      } catch (dockerError) {
        if (imageId) {
          await updateDockerImageRecord(pool, imageId, {
            load_status: 'load_failed',
            load_error: toNullableString(String(dockerError?.stderr || dockerError?.message || '도커 이미지 로드에 실패했습니다.'), 2000),
          })
        }
        throw dockerError
      }

      const imageRecord = await getDockerImageRecord(pool, imageId)
      const deploymentRecord = imageRecord?.compose_file_path
        ? await runDockerComposeDeployment(pool, imageRecord, actorName, preferredHostPort, environmentEntries)
        : await runDockerBundleDeployment(
            pool,
            imageRecord,
            actorName,
            preferredHostPort,
            environmentEntries,
          )
      const summary = await buildProjectDockerSummary(pool, req.projectId, actorName, req.project.author, req.projectWriteAccess)

      res.status(201).json({
        image: toDockerImageDto(await getDockerImageRecord(pool, imageId), actorName, req.project.author, req.projectWriteAccess),
        deployment: deploymentRecord ? toDockerDeploymentDto(deploymentRecord, actorName, req.project.author, req.projectWriteAccess) : null,
        ...summary,
      })
    } catch (error) {
      if (!imageId && pendingArtifactPaths.length > 0) {
        await Promise.all(
          pendingArtifactPaths.map(async (filePath) => {
            try {
              await fs.promises.rm(filePath, { force: true })
            } catch {
              // Ignore cleanup failures for partially uploaded artifacts.
            }
          }),
        )
      }
      handleApiError(res, error, '도커 이미지 업로드 및 배포에 실패했습니다.')
    }
  })

  router.get('/build-jobs/:buildJobId/logs', async (req, res) => {
    const buildJobId = Number.parseInt(String(req.params.buildJobId), 10)
    if (!Number.isFinite(buildJobId) || buildJobId <= 0) {
      res.status(400).json({ error: 'Invalid build job id.', requestId: req.requestId })
      return
    }

    try {
      const buildJobRecord = await getDockerBuildJobRecord(pool, buildJobId)
      if (!buildJobRecord || Number(buildJobRecord.project_id) !== req.projectId) {
        res.status(404).json({ error: 'Build job not found.', requestId: req.requestId })
        return
      }

      if (!req.projectWriteAccess) {
        res.status(403).json({ error: 'Only authorized project editors can read build logs.', requestId: req.requestId })
        return
      }

      res.json({
        buildJobId,
        logs: buildJobRecord.build_output ?? '',
      })
    } catch (error) {
      handleApiError(res, error, 'Failed to load Docker build logs.')
    }
  })

  router.get('/deployments/:deploymentId/logs', async (req, res) => {
    const deploymentId = Number.parseInt(String(req.params.deploymentId), 10)
    if (!Number.isFinite(deploymentId) || deploymentId <= 0) {
      res.status(400).json({ error: '배포 ID가 올바르지 않습니다.', requestId: req.requestId })
      return
    }

    try {
      await assertDockerEngineAvailable()

      const deploymentRecord = await getDockerDeploymentRecord(pool, deploymentId)
      if (!deploymentRecord || Number(deploymentRecord.project_id) !== req.projectId) {
        res.status(404).json({ error: '배포 정보를 찾을 수 없습니다.', requestId: req.requestId })
        return
      }

      if (!req.projectWriteAccess) {
        res.status(403).json({ error: '승인된 프로젝트 편집자만 배포 로그를 볼 수 있습니다.', requestId: req.requestId })
        return
      }

      const tail = Math.min(parseOptionalPositiveInt(req.query.tail) ?? DEFAULT_LOG_TAIL, 1000)
      const logs = await listDockerBundleDeploymentLogs(deploymentRecord, tail)

      res.json({
        deploymentId,
        containerId: deploymentRecord.container_id,
        logs,
      })
    } catch (error) {
      handleApiError(res, error, '도커 배포 로그를 불러오지 못했습니다.')
    }
  })

  router.post('/deployments/:deploymentId/:action', async (req, res) => {
    const deploymentId = Number.parseInt(String(req.params.deploymentId), 10)
    const action = String(req.params.action ?? '').trim().toLowerCase()

    if (!Number.isFinite(deploymentId) || deploymentId <= 0) {
      res.status(400).json({ error: '배포 ID가 올바르지 않습니다.', requestId: req.requestId })
      return
    }

    if (!['start', 'stop', 'restart'].includes(action)) {
      res.status(400).json({ error: '지원하지 않는 도커 배포 작업입니다.', requestId: req.requestId })
      return
    }

    try {
      await assertDockerEngineAvailable()

      const deploymentRecord = await getDockerDeploymentRecord(pool, deploymentId)
      if (!deploymentRecord || Number(deploymentRecord.project_id) !== req.projectId) {
        res.status(404).json({ error: '배포 정보를 찾을 수 없습니다.', requestId: req.requestId })
        return
      }

      if (!req.projectWriteAccess) {
        res.status(403).json({ error: '승인된 프로젝트 편집자만 이 배포를 관리할 수 있습니다.', requestId: req.requestId })
        return
      }

      let nextDeployment
      if (action === 'start') {
        nextDeployment = await applyDockerBundleDeploymentAction(pool, deploymentRecord, 'start')
      } else if (action === 'stop') {
        nextDeployment = await applyDockerBundleDeploymentAction(pool, deploymentRecord, 'stop')
      } else {
        nextDeployment = await applyDockerBundleDeploymentAction(pool, deploymentRecord, 'restart')
      }

      const summary = await buildProjectDockerSummary(pool, req.projectId, req.actorName, req.project.author, req.projectWriteAccess)
      res.json({
        deployment: toDockerDeploymentDto(nextDeployment, req.actorName, req.project.author, req.projectWriteAccess),
        ...summary,
      })
    } catch (error) {
      handleApiError(res, error, '도커 배포 상태를 변경하지 못했습니다.')
    }
  })

  router.delete('/images/:imageId', async (req, res) => {
    const imageId = Number.parseInt(String(req.params.imageId), 10)
    if (!Number.isFinite(imageId) || imageId <= 0) {
      res.status(400).json({ error: '이미지 ID가 올바르지 않습니다.', requestId: req.requestId })
      return
    }

    try {
      await assertDockerEngineAvailable()

      const imageRecord = await getDockerImageRecord(pool, imageId)
      if (!imageRecord || Number(imageRecord.project_id) !== req.projectId) {
        res.status(404).json({ error: '도커 이미지를 찾을 수 없습니다.', requestId: req.requestId })
        return
      }

      if (!req.projectWriteAccess) {
        res.status(403).json({ error: '승인된 프로젝트 편집자만 이 도커 이미지를 삭제할 수 있습니다.', requestId: req.requestId })
        return
      }

      await deleteDockerBundleImageRecord(pool, imageRecord)
      const summary = await buildProjectDockerSummary(pool, req.projectId, req.actorName, req.project.author, req.projectWriteAccess)

      res.json({
        removedImageId: imageId,
        ...summary,
      })
    } catch (error) {
      handleApiError(res, error, '도커 이미지를 삭제하지 못했습니다.')
    }
  })

  app.use('/api/v1/projects/:id/docker', router)
}
