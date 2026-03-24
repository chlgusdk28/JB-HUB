import 'dotenv/config'
import Database from 'better-sqlite3'
import fs, { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path, { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import express from 'express'
import cors from 'cors'
import compression from 'compression'
import fileUpload from 'express-fileupload'
import helmet from 'helmet'
import { attachProjectContainerRoutes } from './project-containers.js'
import { createToolsRouter } from './tools-api.js'
import { ensureRuntimeLayout, PROJECT_FILES_ROOT, SQLITE_DB_PATH, UPLOAD_TEMP_DIR } from './runtime-paths.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = SQLITE_DB_PATH

// 데이터 디렉토리 생성
ensureRuntimeLayout()

// 환경 변수
const API_PORT = Number(process.env.API_PORT) || 8787
const JWT_SECRET = process.env.API_JWT_HS256_SECRET || 'change-this-secret-min-32-chars-long'
const ADMIN_USERNAME = process.env.ADMIN_DEFAULT_USERNAME || 'admin'
const ADMIN_PASSWORD = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123'
const CORS_ORIGINS = new Set(
  (process.env.CORS_ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://127.0.0.1:3000'])
    .map((value) => String(value).trim())
    .filter(Boolean),
)
const MAX_UPLOAD_FILE_SIZE_BYTES = 512 * 1024 * 1024
const MAX_TEXT_PREVIEW_BYTES = 256 * 1024
const MAX_PROJECT_README_CHAR_COUNT = 200000
const SERVE_STATIC_DIST = process.env.SERVE_STATIC_DIST === '1'
const DIST_DIR = join(process.cwd(), 'dist')
const DIST_INDEX_PATH = join(DIST_DIR, 'index.html')
const FILE_UPLOAD_LIMIT_ERROR = {
  error: 'Uploaded file is too large. The maximum size is 512MB per file.',
}
const TEXT_FILE_EXTENSIONS = new Set([
  '.c',
  '.cc',
  '.cpp',
  '.css',
  '.csv',
  '.go',
  '.h',
  '.hpp',
  '.html',
  '.java',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.py',
  '.rb',
  '.rs',
  '.sh',
  '.sql',
  '.svg',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
])
const TEXT_FILE_NAMES = new Set([
  '.env',
  '.env.example',
  '.gitignore',
  '.npmrc',
  '.prettierrc',
  'dockerfile',
  'license',
  'makefile',
  'readme',
  'readme.md',
])
const RESTRICTED_PROJECT_PATH_SEGMENTS = new Set([
  '.aws',
  '.git',
  '.hg',
  '.kube',
  '.ssh',
  '.svn',
])
const RESTRICTED_PROJECT_FILE_PATTERNS = [
  /^\.env(?:\..+)?$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)$/i,
  /^(authorized_keys|known_hosts)$/i,
  /\.(key|pem|p12|pfx|jks|kdbx)$/i,
]
const ALLOWED_PROJECT_HIDDEN_FILES = new Set([
  '.dockerignore',
  '.env.example',
  '.gitignore',
])

function isPrivateIpv4Host(hostname) {
  if (/^10\./.test(hostname)) {
    return true
  }

  if (/^192\.168\./.test(hostname)) {
    return true
  }

  const match = hostname.match(/^172\.(\d{1,3})\./)
  if (!match) {
    return false
  }

  const secondOctet = Number.parseInt(match[1], 10)
  return Number.isFinite(secondOctet) && secondOctet >= 16 && secondOctet <= 31
}

function isLocalDevelopmentOrigin(origin) {
  if (typeof origin !== 'string' || !origin.trim()) {
    return false
  }

  try {
    const parsed = new URL(origin)
    const hostname = parsed.hostname.trim().toLowerCase()
    return (
      parsed.protocol === 'http:' &&
      (hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname === '[::1]' ||
        hostname.endsWith('.local') ||
        isPrivateIpv4Host(hostname))
    )
  } catch {
    return false
  }
}

// Express 앱
const app = express()
app.use(compression())
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}))
app.use(cors({
  origin(origin, callback) {
    if (!origin || CORS_ORIGINS.has(origin) || isLocalDevelopmentOrigin(origin)) {
      callback(null, true)
      return
    }

    callback(new Error('CORS origin is not allowed.'))
  },
  credentials: true
}))
app.use(fileUpload({
  createParentPath: true,
  abortOnLimit: true,
  responseOnLimit: JSON.stringify(FILE_UPLOAD_LIMIT_ERROR),
  limitHandler: (_req, res) => {
    if (!res.headersSent) {
      res.status(413).json(FILE_UPLOAD_LIMIT_ERROR)
    }
  },
  limits: { fileSize: MAX_UPLOAD_FILE_SIZE_BYTES },
  useTempFiles: true,
  tempFileDir: UPLOAD_TEMP_DIR,
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// 데이터베이스 초기화
let db

function parseTags(rawTags) {
  if (Array.isArray(rawTags)) {
    return rawTags.filter((value) => typeof value === 'string')
  }

  if (typeof rawTags !== 'string' || rawTags.trim().length === 0) {
    return []
  }

  try {
    const parsed = JSON.parse(rawTags)
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string') : []
  } catch {
    return []
  }
}

function toProjectDto(project) {
  return {
    ...project,
    tags: parseTags(project?.tags),
    is_new: Boolean(project?.is_new),
  }
}

function generateProjectEditToken(project) {
  return jwt.sign(
    {
      type: 'project-edit',
      projectId: Number(project?.id),
      author: project?.author,
    },
    JWT_SECRET,
    {
      expiresIn: '30d',
    },
  )
}

function readSingleHeader(headerValue) {
  if (Array.isArray(headerValue)) {
    return String(headerValue[0] ?? '')
  }

  return typeof headerValue === 'string' ? headerValue : ''
}

function sanitizeString(input, maxLength = 120, allowSpecialChars = false) {
  if (typeof input !== 'string') {
    return ''
  }

  let sanitized = input.trim()
  sanitized = sanitized.replace(/<script[^>]*>.*?<\/script>/gi, '')
  sanitized = sanitized.replace(/<[^>]*>/g, '')
  sanitized = sanitized.slice(0, maxLength)
  sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')

  if (!allowSpecialChars) {
    sanitized = sanitized.replace(/[^\p{L}\p{N}\s\-_.@]/gu, '')
  }

  return sanitized
}

function buildAttachmentContentDisposition(fileName) {
  const safeName = String(fileName ?? 'download').replace(/[\\/]/g, '_')
  const asciiFallback = safeName.replace(/[^\x20-\x7E]/g, '_')
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(safeName)}`
}

function sanitizeProjectPathSegment(segment, fallback = 'item') {
  const normalized = String(segment ?? '').trim()
  if (!normalized || normalized === '.' || normalized === '..') {
    return fallback
  }

  const sanitized = normalized.replace(/[<>:"|?*\u0000-\u001f]/g, '_')
  return sanitized.length > 0 ? sanitized : fallback
}

function readProjectActorName(req) {
  return sanitizeString(readSingleHeader(req.headers['x-jb-user-name']), 120)
}

function readProjectEditToken(req) {
  return readSingleHeader(req.headers['x-jb-project-edit-token']).trim()
}

function normalizeProjectActorName(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function hasValidProjectEditToken(project, editToken) {
  if (!project || typeof editToken !== 'string' || !editToken.trim()) {
    return false
  }

  try {
    const decoded = jwt.verify(editToken, JWT_SECRET)
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

function hasProjectWriteAccess(req, project) {
  if (hasValidProjectEditToken(project, readProjectEditToken(req))) {
    return true
  }

  const normalizedActor = normalizeProjectActorName(readProjectActorName(req))
  const normalizedAuthor = normalizeProjectActorName(project?.author)
  return normalizedActor.length > 0 && normalizedAuthor.length > 0 && normalizedActor === normalizedAuthor
}

function normalizeProjectRelativePath(inputPath, fallbackName = 'file') {
  const rawPath = typeof inputPath === 'string' && inputPath.trim() ? inputPath : fallbackName
  const segments = rawPath
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)

  if (segments.length === 0) {
    return sanitizeProjectPathSegment(fallbackName, 'file')
  }

  return segments
    .map((segment, index) =>
      sanitizeProjectPathSegment(segment, index === segments.length - 1 ? fallbackName : 'folder'),
    )
    .join('/')
}

function isRestrictedProjectFilePath(relativePath) {
  const normalizedPath = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalizedPath) {
    return false
  }

  const segments = normalizedPath.split('/').filter(Boolean)
  if (segments.length === 0) {
    return false
  }

  if (segments.some((segment) => RESTRICTED_PROJECT_PATH_SEGMENTS.has(segment.toLowerCase()))) {
    return true
  }

  const fileName = segments[segments.length - 1].toLowerCase()
  if (ALLOWED_PROJECT_HIDDEN_FILES.has(fileName)) {
    return false
  }

  return RESTRICTED_PROJECT_FILE_PATTERNS.some((pattern) => pattern.test(fileName))
}

function resolveProjectFileTarget(projectId, inputPath, fallbackName = 'file') {
  const projectDir = path.join(PROJECT_FILES_ROOT, String(projectId))
  const relativePath = normalizeProjectRelativePath(inputPath, fallbackName)
  const absolutePath = path.resolve(projectDir, relativePath)
  const relativeToProjectDir = path.relative(projectDir, absolutePath)

  if (relativeToProjectDir.startsWith('..') || path.isAbsolute(relativeToProjectDir)) {
    throw new Error('validation:Invalid file path.')
  }

  return {
    projectDir,
    absolutePath,
    relativePath: relativeToProjectDir.split(path.sep).join('/'),
  }
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

function isKnownTextFile(filePath) {
  const baseName = path.basename(filePath).toLowerCase()
  const extension = path.extname(baseName)
  return TEXT_FILE_NAMES.has(baseName) || TEXT_FILE_EXTENSIONS.has(extension)
}

function isProjectReadmeFileName(fileName) {
  return /^readme(?:\.[^.]+)?$/i.test(String(fileName ?? '').trim())
}

function rankProjectReadmeFileName(fileName) {
  const normalized = String(fileName ?? '').trim().toLowerCase()
  if (normalized === 'readme.md') {
    return 0
  }
  if (normalized === 'readme') {
    return 1
  }
  return 2
}

async function resolveProjectReadmeTarget(projectId) {
  const defaultTarget = resolveProjectFileTarget(projectId, 'README.md', 'README.md')

  try {
    const dirents = await fs.promises.readdir(defaultTarget.projectDir, { withFileTypes: true })
    const readmeEntry = dirents
      .filter((dirent) => dirent.isFile() && isProjectReadmeFileName(dirent.name))
      .sort((left, right) => {
        const rankDifference = rankProjectReadmeFileName(left.name) - rankProjectReadmeFileName(right.name)
        if (rankDifference !== 0) {
          return rankDifference
        }

        return left.name.localeCompare(right.name, 'en', { numeric: true, sensitivity: 'base' })
      })
      .at(0)

    if (!readmeEntry) {
      return defaultTarget
    }

    return resolveProjectFileTarget(projectId, readmeEntry.name, readmeEntry.name)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return defaultTarget
    }

    throw error
  }
}

async function listProjectFiles(projectDir, currentDir = projectDir) {
  let dirents
  try {
    dirents = await fs.promises.readdir(currentDir, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return []
    }
    throw error
  }

  const nodes = await Promise.all(
    dirents.map(async (dirent) => {
      const absolutePath = path.join(currentDir, dirent.name)
      const stats = await fs.promises.stat(absolutePath)
      const relativePath = path.relative(projectDir, absolutePath).split(path.sep).join('/')

      if (isRestrictedProjectFilePath(relativePath)) {
        return null
      }

      if (dirent.isDirectory()) {
        return {
          name: dirent.name,
          path: relativePath,
          type: 'folder',
          updatedAt: stats.mtime.toISOString(),
          children: await listProjectFiles(projectDir, absolutePath),
        }
      }

      return {
        name: dirent.name,
        path: relativePath,
        type: 'file',
        size: stats.size,
        updatedAt: stats.mtime.toISOString(),
      }
    }),
  )

  return nodes.filter(Boolean).sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === 'folder' ? -1 : 1
    }

    return left.name.localeCompare(right.name, 'ko-KR', { numeric: true, sensitivity: 'base' })
  })
}

async function readProjectFilePreview(absolutePath, stats) {
  const baseName = path.basename(absolutePath).toLowerCase()
  const extension = path.extname(baseName)
  const shouldInspectContents = isKnownTextFile(absolutePath) || extension.length === 0

  if (!shouldInspectContents) {
    return { isText: false, truncated: false, content: null }
  }

  const bytesToRead = Math.min(stats.size, MAX_TEXT_PREVIEW_BYTES)
  const handle = await fs.promises.open(absolutePath, 'r')

  try {
    const buffer = Buffer.alloc(bytesToRead)
    const { bytesRead } = await handle.read(buffer, 0, bytesToRead, 0)
    const previewBuffer = buffer.subarray(0, bytesRead)

    if (!isKnownTextFile(absolutePath) && previewBuffer.includes(0)) {
      return { isText: false, truncated: false, content: null }
    }

    return {
      isText: true,
      truncated: stats.size > MAX_TEXT_PREVIEW_BYTES,
      content: previewBuffer.toString('utf8'),
    }
  } finally {
    await handle.close()
  }
}

async function projectDirectoryHasFiles(projectDir) {
  let dirents
  try {
    dirents = await fs.promises.readdir(projectDir, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false
    }
    throw error
  }

  for (const dirent of dirents) {
    const absolutePath = path.join(projectDir, dirent.name)
    if (dirent.isFile()) {
      return true
    }

    if (dirent.isDirectory() && (await projectDirectoryHasFiles(absolutePath))) {
      return true
    }
  }

  return false
}

function buildDefaultProjectReadme(project) {
  const title = sanitizeString(String(project?.title ?? ''), 200, true) || 'Untitled Project'
  const description = sanitizeString(String(project?.description ?? ''), 20000, true) || 'Project overview will be added here.'
  const author = sanitizeString(String(project?.author ?? ''), 120, true) || 'Unknown'
  const department = sanitizeString(String(project?.department ?? ''), 120, true) || 'Unknown'
  const tags = Array.isArray(project?.tags) ? project.tags.map((tag) => sanitizeString(String(tag), 80, true)).filter(Boolean) : []
  const tagSection = tags.length > 0 ? tags.map((tag) => `- ${tag}`).join('\n') : '- general'

  return `# ${title}

## Overview
${description}

## Ownership
- Author: ${author}
- Department: ${department}

## Tags
${tagSection}
`
}

function sanitizeProjectReadmeContent(input, fallbackContent) {
  const rawValue = typeof input === 'string' ? input : ''
  const normalized = rawValue
    .replace(/\r\n/g, '\n')
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
    .slice(0, MAX_PROJECT_README_CHAR_COUNT)
    .trim()

  if (!normalized) {
    return fallbackContent
  }

  return normalized
}

async function readProjectReadmeDocument(project) {
  const target = await resolveProjectReadmeTarget(project?.id)

  try {
    const stats = await fs.promises.stat(target.absolutePath)
    if (!stats.isFile()) {
      throw new Error('validation:README is only available for files.')
    }

    const content = await fs.promises.readFile(target.absolutePath, 'utf8')
    return {
      name: path.basename(target.absolutePath),
      path: target.relativePath,
      content,
      size: stats.size,
      updatedAt: stats.mtime.toISOString(),
      exists: true,
      isGenerated: false,
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error
    }

    const content = buildDefaultProjectReadme(project)
    return {
      name: 'README.md',
      path: 'README.md',
      content,
      size: Buffer.byteLength(content, 'utf8'),
      updatedAt: null,
      exists: false,
      isGenerated: true,
    }
  }
}

function sendProjectApiError(res, error, fallbackMessage) {
  if (error?.message?.startsWith?.('validation:')) {
    res.status(400).json({ error: error.message.slice('validation:'.length) })
    return
  }

  console.error('[sqlite-api]', fallbackMessage, error)
  res.status(500).json({ error: fallbackMessage })
}

function initDatabase() {
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // 테이블 생성
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      department TEXT,
      role TEXT DEFAULT 'viewer',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      author TEXT NOT NULL,
      department TEXT,
      stars INTEGER DEFAULT 0,
      forks INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      views INTEGER DEFAULT 0,
      tags TEXT,
      created_at_label TEXT,
      is_new INTEGER DEFAULT 0,
      trend TEXT,
      badge TEXT,
      thumbnail_url TEXT,
      demo_url TEXT,
      repo_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS site_content (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      actor_id INTEGER,
      target_user_id INTEGER,
      detail_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (actor_id) REFERENCES users(id),
      FOREIGN KEY (target_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS docker_build_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      uploader_name TEXT NOT NULL,
      source_file_name TEXT,
      source_archive_path TEXT,
      dockerfile_path TEXT,
      context_path TEXT,
      image_name TEXT,
      image_tag TEXT,
      requested_container_port INTEGER,
      preferred_host_port INTEGER,
      status TEXT DEFAULT 'queued',
      error_message TEXT,
      image_reference TEXT,
      exposed_ports TEXT,
      container_port INTEGER,
      image_record_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      started_at DATETIME,
      finished_at DATETIME,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS docker_deployments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      image_record_id INTEGER NOT NULL,
      deployment_id TEXT NOT NULL,
      uploader_name TEXT NOT NULL,
      container_name TEXT,
      container_port INTEGER,
      host_port INTEGER,
      network_name TEXT,
      status TEXT DEFAULT 'running',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );
  `)

  // 관리자 계정 생성
  const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get(ADMIN_USERNAME)
  if (!adminExists) {
    const hashedPassword = bcrypt.hashSync(ADMIN_PASSWORD, 10)
    db.prepare(`
      INSERT INTO users (username, password, name, email, department, role)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(ADMIN_USERNAME, hashedPassword, 'JB-Hub Admin', 'admin@jbhub.local', 'IT', 'admin')
    console.log('[sqlite] Admin 계정 생성됨')
  }

  // 기본 사이트 콘텐츠
  const siteContent = db.prepare('SELECT COUNT(*) as count FROM site_content').get()
  if (siteContent.count === 0) {
    const defaults = [
      ['heroTitle', 'JB-Hub'],
      ['heroSubtitle', '사내 프로젝트 공유 플랫폼'],
      ['features', JSON.stringify([
        { title: '프로젝트 공유', description: '사내 프로젝트를 쉽게 공유하고 협업하세요' },
        { title: '검색 및 발견', description: '관심 있는 프로젝트를 빠르게 찾아보세요' },
        { title: '협업 도구', description: '팀원들과 함께 프로젝트를 관리하세요' }
      ])]
    ]
    const insertContent = db.prepare('INSERT INTO site_content (key, value) VALUES (?, ?)')
    defaults.forEach(([key, value]) => insertContent.run(key, value))
  }

  console.log('[sqlite] 데이터베이스 초기화 완료:', DB_PATH)
}

// 인증 미들웨어
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: '인증이 필요합니다.' })
  }

  const token = authHeader.substring(7)
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch (err) {
    res.status(401).json({ error: '유효하지 않은 토큰입니다.' })
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: '관리자 권한이 필요합니다.' })
  }
  next()
}

// 관리자 세션
const adminSessions = new Map()

// API 라우트

// 헬스체크
app.get('/api/v1/health', (_req, res) => {
  res.json({
    status: 'healthy',
    version: '1.0.0',
    apiVersion: 'v1',
    mode: 'sqlite',
    timestamp: new Date().toISOString()
  })
})

// 사이트 콘텐츠
app.get('/api/v1/site-content', (_req, res) => {
  const rows = db.prepare('SELECT key, value FROM site_content').all()
  const content = {}
  rows.forEach(row => {
    try {
      content[row.key] = JSON.parse(row.value)
    } catch {
      content[row.key] = row.value
    }
  })
  res.json(content)
})

app.use('/api/v1/tools', createToolsRouter())

// 관리자 로그인
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body
  if (!username || !password) {
    return res.status(400).json({ error: '아이디와 비밀번호를 입력하세요.' })
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username)
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' })
  }

  if (user.role !== 'admin') {
    return res.status(403).json({ error: '관리자 권한이 필요합니다.' })
  }

  const sessionId = Buffer.from(`${user.id}-${Date.now()}-${Math.random()}`).toString('base64')
  adminSessions.set(sessionId, { userId: user.id, createdAt: Date.now() })

  const accessToken = jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h', issuer: 'jbhub-api', audience: 'jbhub-client' }
  )

  res.json({
    user: { id: user.id, username: user.username, name: user.name, role: user.role },
    accessToken,
    sessionId
  })
})

// 관리자 세션 확인
app.get('/api/admin/session', authenticateJWT, (req, res) => {
  const sessionId = req.headers['x-admin-session']
  if (!sessionId || !adminSessions.has(sessionId)) {
    return res.status(401).json({ error: '유효하지 않은 세션입니다.' })
  }

  const user = db.prepare('SELECT id, username, name, email, role FROM users WHERE id = ?').get(req.user.userId)
  if (!user) {
    return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' })
  }

  res.json({ user })
})

// 로그아웃
app.post('/api/admin/logout', authenticateJWT, (req, res) => {
  const sessionId = req.headers['x-admin-session']
  if (sessionId) {
    adminSessions.delete(sessionId)
  }
  res.json({ success: true })
})

// 프로젝트 목록
app.get('/api/v1/projects', (req, res) => {
  const { search, department, minStars, sortBy = 'newest', limit = 50 } = req.query

  let query = 'SELECT * FROM projects WHERE 1=1'
  const params = []

  if (search) {
    query += ' AND (title LIKE ? OR description LIKE ? OR author LIKE ? OR tags LIKE ?)'
    const term = `%${search}%`
    params.push(term, term, term, term)
  }

  if (department && department !== 'all') {
    query += ' AND department = ?'
    params.push(department)
  }

  if (minStars) {
    query += ' AND stars >= ?'
    params.push(Number(minStars))
  }

  // 정렬
  const orderByMap = {
    newest: 'created_at DESC',
    stars: 'stars DESC',
    views: 'views DESC',
    comments: 'comments DESC'
  }
  query += ` ORDER BY ${orderByMap[sortBy] || orderByMap.newest}`

  query += ' LIMIT ?'
  params.push(Math.min(Number(limit), 200))

  const rows = db.prepare(query).all(...params)
  res.json({ projects: rows.map(toProjectDto) })
})

// 프로젝트 상세
app.get('/api/v1/projects/:id', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id)
  if (!project) {
    return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' })
  }

  // 조회수 증가
  db.prepare('UPDATE projects SET views = views + 1 WHERE id = ?').run(req.params.id)

  res.json(toProjectDto(project))
})

app.get('/api/v1/projects/:id/readme', async (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id)
  if (!project) {
    return res.status(404).json({ error: 'Project not found.' })
  }

  try {
    const readme = await readProjectReadmeDocument(toProjectDto(project))
    res.json({ readme })
  } catch (error) {
    sendProjectApiError(res, error, 'Failed to fetch project README.')
  }
})

app.put('/api/v1/projects/:id/readme', async (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id)
  if (!project) {
    return res.status(404).json({ error: 'Project not found.' })
  }

  const projectDto = toProjectDto(project)
  if (!hasProjectWriteAccess(req, projectDto)) {
    return res.status(403).json({ error: 'Only the project author can update the README.' })
  }

  try {
    const currentReadme = await readProjectReadmeDocument(projectDto)
    const target = resolveProjectFileTarget(project.id, currentReadme.path, currentReadme.name)
    const nextContent = sanitizeProjectReadmeContent(req.body?.content, buildDefaultProjectReadme(projectDto))

    await fs.promises.mkdir(target.projectDir, { recursive: true })
    await fs.promises.writeFile(target.absolutePath, nextContent, 'utf8')

    const readme = await readProjectReadmeDocument(projectDto)
    res.json({ readme })
  } catch (error) {
    sendProjectApiError(res, error, 'Failed to save project README.')
  }
})

app.get('/api/v1/projects/:id/files', async (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id)
  if (!project) {
    return res.status(404).json({ error: 'Project not found.' })
  }

  try {
    const files = await listProjectFiles(path.join(PROJECT_FILES_ROOT, String(project.id)))
    res.json({ files })
  } catch (error) {
    sendProjectApiError(res, error, 'Failed to fetch project files.')
  }
})

app.post('/api/v1/projects/:id/files', async (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id)
  if (!project) {
    return res.status(404).json({ error: 'Project not found.' })
  }

  const projectDto = toProjectDto(project)
  if (!hasProjectWriteAccess(req, projectDto)) {
    return res.status(403).json({ error: 'Only the project author can upload files.' })
  }

  if (!req.files || !req.files.files) {
    return res.status(400).json({ error: 'At least one file is required.' })
  }

  try {
    const uploadedFiles = Array.isArray(req.files.files) ? req.files.files : [req.files.files]
    const relativePaths = normalizeUploadedRelativePaths(req.body?.relativePaths)
    const uploaded = []

    for (const [index, uploadedFile] of uploadedFiles.entries()) {
      const fallbackName = sanitizeProjectPathSegment(uploadedFile.name, `upload-${index + 1}`)
      const target = resolveProjectFileTarget(project.id, relativePaths[index] ?? fallbackName, fallbackName)
      if (isRestrictedProjectFilePath(target.relativePath)) {
        throw new Error('validation:Sensitive files and secrets cannot be uploaded to projects.')
      }

      await fs.promises.mkdir(path.dirname(target.absolutePath), { recursive: true })
      await uploadedFile.mv(target.absolutePath)

      const stats = await fs.promises.stat(target.absolutePath)
      uploaded.push({
        name: path.basename(target.absolutePath),
        path: target.relativePath,
        size: stats.size,
        updatedAt: stats.mtime.toISOString(),
      })
    }

    const files = await listProjectFiles(path.join(PROJECT_FILES_ROOT, String(project.id)))
    res.status(201).json({ uploaded, files })
  } catch (error) {
    sendProjectApiError(res, error, 'Failed to upload project files.')
  }
})

app.get('/api/v1/projects/:id/files/content', async (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id)
  if (!project) {
    return res.status(404).json({ error: 'Project not found.' })
  }

  const requestedPath = typeof req.query.path === 'string' ? req.query.path : ''
  if (!requestedPath.trim()) {
    return res.status(400).json({ error: 'File path is required.' })
  }

  try {
    const target = resolveProjectFileTarget(project.id, requestedPath)
    if (isRestrictedProjectFilePath(target.relativePath)) {
      return res.status(403).json({ error: 'Access to this file is restricted.' })
    }

    const stats = await fs.promises.stat(target.absolutePath)
    if (!stats.isFile()) {
      return res.status(400).json({ error: 'Preview is only available for files.' })
    }

    const preview = await readProjectFilePreview(target.absolutePath, stats)
    res.json({
      file: {
        name: path.basename(target.absolutePath),
        path: target.relativePath,
        size: stats.size,
        updatedAt: stats.mtime.toISOString(),
        isText: preview.isText,
        truncated: preview.truncated,
        content: preview.content,
      },
    })
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return res.status(404).json({ error: 'File not found.' })
    }

    sendProjectApiError(res, error, 'Failed to read project file.')
  }
})

app.get('/api/v1/projects/:id/files/download', async (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id)
  if (!project) {
    return res.status(404).json({ error: 'Project not found.' })
  }

  const requestedPath = typeof req.query.path === 'string' ? req.query.path : ''
  if (!requestedPath.trim()) {
    return res.status(400).json({ error: 'File path is required.' })
  }

  try {
    const target = resolveProjectFileTarget(project.id, requestedPath)
    if (isRestrictedProjectFilePath(target.relativePath)) {
      return res.status(403).json({ error: 'Access to this file is restricted.' })
    }

    const stats = await fs.promises.stat(target.absolutePath)
    if (!stats.isFile()) {
      return res.status(400).json({ error: 'Only files can be downloaded.' })
    }

    const downloadName = path.basename(target.absolutePath)
    res.setHeader('Content-Disposition', buildAttachmentContentDisposition(downloadName))
    res.setHeader('Content-Length', String(stats.size))
    res.setHeader('Cache-Control', 'no-store')
    res.type(downloadName)
    res.sendFile(target.absolutePath)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return res.status(404).json({ error: 'File not found.' })
    }

    sendProjectApiError(res, error, 'Failed to download project file.')
  }
})

// 프로젝트 생성
app.post('/api/v1/projects', (req, res, next) => {
  const { title, description, author, department, tags = [] } = req.body ?? {}

  if (!title?.trim()) {
    return next()
  }

  try {
    const safeAuthor = String(author || req.user?.name || ADMIN_USERNAME || 'JB User').trim() || 'JB User'
    const safeDepartment = String(department || req.user?.department || 'General').trim() || 'General'
    const safeTags = Array.isArray(tags) ? tags : []

    const result = db.prepare(`
      INSERT INTO projects (title, description, author, department, tags, created_at_label, is_new, trend, badge)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      title.trim(),
      typeof description === 'string' ? description : '',
      safeAuthor,
      safeDepartment,
      JSON.stringify(safeTags),
      'Just now',
      1,
      'rising',
      'new'
    )

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid)
    return res.status(201).json({
      project: toProjectDto(project),
      projectEditToken: generateProjectEditToken(project),
    })
  } catch (error) {
    return next(error)
  }
})

app.post('/api/v1/projects', authenticateJWT, (req, res) => {
  const { title, description, author, department, tags = [], ...rest } = req.body

  if (!title?.trim()) {
    return res.status(400).json({ error: '프로젝트 제목은 필수입니다.' })
  }

  const result = db.prepare(`
    INSERT INTO projects (title, description, author, department, tags, created_at_label, is_new)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    title.trim(),
    description || '',
    author || req.user.name,
    department || req.user.department || '미분류',
    JSON.stringify(tags),
    '방금 전',
    1
  )

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid)
  res.status(201).json({
    project: toProjectDto(project),
    projectEditToken: generateProjectEditToken(project),
  })
})

// 프로젝트 수정
app.put('/api/v1/projects/:id', authenticateJWT, (req, res) => {
  const exists = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id)
  if (!exists) {
    return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' })
  }

  const { title, description, department, tags, ...rest } = req.body
  const tagsJson = Array.isArray(tags) ? JSON.stringify(tags) : tags

  db.prepare(`
    UPDATE projects
    SET title = ?, description = ?, department = ?, tags = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(title, description, department, tagsJson, req.params.id)

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id)
  res.json(toProjectDto(project))
})

// 프로젝트 삭제
app.delete('/api/v1/projects/:id', authenticateJWT, (req, res) => {
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id)
  if (result.changes === 0) {
    return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' })
  }
  res.status(204).send()
})

// 프로젝트 인사이트
app.get('/api/v1/projects/insights', (_req, res) => {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as totalProjects,
      SUM(views) as totalViews,
      SUM(stars) as totalStars
    FROM projects
  `).get()

  const departments = db.prepare(`
    SELECT department, COUNT(*) as count
    FROM projects
    GROUP BY department
    ORDER BY count DESC
  `).all()

  res.json({
    totalProjects: stats.totalProjects || 0,
    totalViews: stats.totalViews || 0,
    totalStars: stats.totalStars || 0,
    departments: departments.length,
    topDepartments: departments.slice(0, 5)
  })
})

// 랭킹
app.get('/api/v1/rankings', (_req, res) => {
  const byStars = db.prepare('SELECT *, rank() over (order by stars desc) as rank FROM projects ORDER BY stars DESC LIMIT 10').all()
  const byViews = db.prepare('SELECT *, rank() over (order by views desc) as rank FROM projects ORDER BY views DESC LIMIT 10').all()

  res.json({
    byStars: byStars.map(toProjectDto),
    byViews: byViews.map(toProjectDto)
  })
})

// 사용자 목록 (관리자)
app.get('/api/v1/users', authenticateJWT, requireAdmin, (req, res) => {
  const { search, role, isActive, limit = 100 } = req.query

  let query = 'SELECT id, username, name, email, department, role, is_active, created_at FROM users WHERE 1=1'
  const params = []

  if (search) {
    query += ' AND (username LIKE ? OR name LIKE ? OR department LIKE ?)'
    const term = `%${search}%`
    params.push(term, term, term)
  }

  if (role) {
    query += ' AND role = ?'
    params.push(role)
  }

  if (isActive !== undefined) {
    query += ' AND is_active = ?'
    params.push(isActive === 'true' ? 1 : 0)
  }

  query += ' LIMIT ?'
  params.push(Math.min(Number(limit), 500))

  const users = db.prepare(query).all(...params)
  res.json({ users })
})

// 사용자 생성 (관리자)
app.post('/api/v1/users', authenticateJWT, requireAdmin, (req, res) => {
  const { username, password, name, email, department, role = 'viewer' } = req.body

  if (!username || !password || !name) {
    return res.status(400).json({ error: '필수 필드가 누락되었습니다.' })
  }

  const hashedPassword = bcrypt.hashSync(password, 10)
  try {
    const result = db.prepare(`
      INSERT INTO users (username, password, name, email, department, role)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(username, hashedPassword, name, email || null, department || null, role)

    const user = db.prepare('SELECT id, username, name, email, department, role, is_active FROM users WHERE id = ?').get(result.lastInsertRowid)
    res.status(201).json({ user })
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: '이미 존재하는 사용자명입니다.' })
    }
    throw err
  }
})

// Docker 기능 - 기본 응답

// 서버 시작
initDatabase()
const containerRuntime = attachProjectContainerRoutes(app, {
  db,
  jwt,
  jwtSecret: JWT_SECRET,
})

if (SERVE_STATIC_DIST && existsSync(DIST_DIR) && existsSync(DIST_INDEX_PATH)) {
  app.use(express.static(DIST_DIR, { index: false, maxAge: '5m' }))
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(DIST_INDEX_PATH)
  })
}

app.use((error, req, res, _next) => {
  console.error('[sqlite-api]', req.method, req.originalUrl, error)

  res.status(500).json({
    error: 'Internal server error.',
  })
})

app.listen(API_PORT, () => {
  console.log(`[sqlite-api] http://127.0.0.1:${API_PORT}`)
  console.log(`[sqlite-api] DB: ${DB_PATH}`)
  console.log(`[sqlite-api] Admin: ${ADMIN_USERNAME}`)
})

// 종료 시 정리
process.on('SIGINT', () => {
  containerRuntime?.stop?.()
  db?.close()
  console.log('[sqlite-api] 데이터베이스 연결 종료')
  process.exit(0)
})
