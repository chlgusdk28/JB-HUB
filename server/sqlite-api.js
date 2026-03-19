import 'dotenv/config'
import Database from 'better-sqlite3'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import express from 'express'
import cors from 'cors'
import compression from 'compression'
import fileUpload from 'express-fileupload'
import helmet from 'helmet'
import { createToolsRouter } from './tools-api.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(process.cwd(), 'data', 'jbhub.db')

// 데이터 디렉토리 생성
mkdirSync(join(process.cwd(), 'data'), { recursive: true })
mkdirSync(join(process.cwd(), 'project-files'), { recursive: true })
mkdirSync(join(process.cwd(), 'docker-uploads'), { recursive: true })
mkdirSync(join(process.cwd(), 'docker-temp'), { recursive: true })
mkdirSync(join(process.cwd(), 'upload-temp'), { recursive: true })

// 환경 변수
const API_PORT = Number(process.env.API_PORT) || 8787
const JWT_SECRET = process.env.API_JWT_HS256_SECRET || 'change-this-secret-min-32-chars-long'
const ADMIN_USERNAME = process.env.ADMIN_DEFAULT_USERNAME || 'admin'
const ADMIN_PASSWORD = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123'
const CORS_ORIGINS = process.env.CORS_ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://127.0.0.1:3000']

// Express 앱
const app = express()
app.use(compression())
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}))
app.use(cors({
  origin: CORS_ORIGINS,
  credentials: true
}))
app.use(fileUpload({
  createParentPath: true,
  abortOnLimit: true,
  limits: { fileSize: 64 * 1024 * 1024 },
  useTempFiles: true,
  tempFileDir: join(process.cwd(), 'upload-temp'),
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// 데이터베이스 초기화
let db

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

  const projects = rows.map(p => ({
    ...p,
    tags: p.tags ? JSON.parse(p.tags) : [],
    is_new: Boolean(p.is_new)
  }))

  res.json({ projects })
})

// 프로젝트 상세
app.get('/api/v1/projects/:id', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id)
  if (!project) {
    return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' })
  }

  // 조회수 증가
  db.prepare('UPDATE projects SET views = views + 1 WHERE id = ?').run(req.params.id)

  res.json({
    ...project,
    tags: project.tags ? JSON.parse(project.tags) : [],
    is_new: Boolean(project.is_new)
  })
})

// 프로젝트 생성
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
    project: {
      ...project,
      tags: JSON.parse(project.tags),
      is_new: Boolean(project.is_new)
    }
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
  res.json({
    ...project,
    tags: JSON.parse(project.tags),
    is_new: Boolean(project.is_new)
  })
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
    byStars: byStars.map(p => ({ ...p, tags: JSON.parse(p.tags || '[]'), is_new: Boolean(p.is_new) })),
    byViews: byViews.map(p => ({ ...p, tags: JSON.parse(p.tags || '[]'), is_new: Boolean(p.is_new) }))
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
app.get('/api/v1/projects/:id/docker', (req, res) => {
  const images = db.prepare('SELECT id, image_name, image_tag, status, created_at FROM docker_build_jobs WHERE project_id = ? ORDER BY id DESC LIMIT 10').get(req.params.id)
  res.json({ images: images || [] })
})

// 서버 시작
initDatabase()

app.listen(API_PORT, () => {
  console.log(`[sqlite-api] http://127.0.0.1:${API_PORT}`)
  console.log(`[sqlite-api] DB: ${DB_PATH}`)
  console.log(`[sqlite-api] Admin: ${ADMIN_USERNAME}`)
})

// 종료 시 정리
process.on('SIGINT', () => {
  db?.close()
  console.log('[sqlite-api] 데이터베이스 연결 종료')
  process.exit(0)
})
