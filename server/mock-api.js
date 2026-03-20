import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import fileUpload from 'express-fileupload'
import { randomUUID } from 'node:crypto'
import { seedProjects } from './seed-projects.js'
import { createToolsRouter } from './tools-api.js'
import { ensureRuntimeLayout, UPLOAD_TEMP_DIR } from './runtime-paths.js'

const API_PORT = Number.parseInt(process.env.API_PORT || '8787', 10)
const app = express()

ensureRuntimeLayout()

// Middleware
app.use(cors())
app.use(fileUpload({
  createParentPath: true,
  abortOnLimit: true,
  limits: { fileSize: 64 * 1024 * 1024 },
  useTempFiles: true,
  tempFileDir: UPLOAD_TEMP_DIR,
}))
app.use(express.json())

// In-memory data store
let projects = [...seedProjects]
let nextProjectId = projects.length + 1  // Auto-increment ID
let siteContent = {
  heroTitle: 'JB-Hub',
  heroSubtitle: '사내 프로젝트 공유 플랫폼',
  features: [
    { title: '프로젝트 공유', description: '사내 프로젝트를 쉽게 공유하고 협업하세요' },
    { title: '검색 및 발견', description: '관심 있는 프로젝트를 빠르게 찾아보세요' },
    { title: '협업 도구', description: '팀원들과 함께 프로젝트를 관리하세요' },
  ],
}

// Helper functions
function toProjectDto(project, id) {
  return {
    id: id ?? project.id ?? nextProjectId++,
    title: project.title,
    description: project.description,
    author: project.author,
    department: project.department,
    stars: project.stars ?? 0,
    forks: project.forks ?? 0,
    comments: project.comments ?? 0,
    views: project.views ?? 0,
    tags: project.tags ?? [],
    createdAt: project.createdAt ?? '방금 전',
    isNew: project.isNew ?? false,
    trend: project.trend ?? null,
    badge: project.badge ?? null,
    thumbnailUrl: project.thumbnailUrl ?? null,
    demoUrl: project.demoUrl ?? null,
    repoUrl: project.repoUrl ?? null,
    files: project.files ?? [],
  }
}

function normalizeInputProject(input) {
  const title = input.title?.trim() ?? ''
  const description = input.description?.trim() ?? ''
  const author = input.author?.trim() ?? '익명'
  const department = input.department?.trim() ?? '미분류'

  if (!title) {
    throw new Error('title is required')
  }

  return {
    title,
    description,
    author,
    department,
    stars: 0,
    forks: 0,
    comments: 0,
    views: 0,
    tags: Array.isArray(input.tags) ? input.tags : [],
    createdAt: '방금 전',
    isNew: true,
    trend: null,
    badge: null,
    thumbnailUrl: input.thumbnailUrl ?? null,
    demoUrl: input.demoUrl ?? null,
    repoUrl: input.repoUrl ?? null,
    files: input.files ?? [],
  }
}

// Health check
app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok', mode: 'mock' })
})

// Site content
app.get('/api/v1/site-content', (_req, res) => {
  res.json(siteContent)
})

app.use('/api/v1/tools', createToolsRouter())

// Get all projects
app.get('/api/v1/projects', (_req, res) => {
  const dtos = projects.map((p, i) => toProjectDto(p, i + 1))
  res.json({ projects: dtos })
})

// Get project by id
app.get('/api/v1/projects/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10)
  const index = id - 1  // Convert to 0-based index

  if (index >= 0 && index < projects.length) {
    res.json(toProjectDto(projects[index], id))
  } else {
    res.status(404).json({ error: 'Project not found' })
  }
})

// Create project
app.post('/api/v1/projects', (req, res) => {
  try {
    const normalized = normalizeInputProject(req.body ?? {})
    const newId = nextProjectId++
    const newProject = toProjectDto(normalized, newId)
    projects.push(newProject)

    // Generate a mock edit token
    const editToken = randomUUID()

    res.status(201).json({
      project: newProject,
      projectEditToken: editToken
    })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// Update project
app.put('/api/v1/projects/:id', (req, res) => {
  const id = req.params.id
  const index = projects.findIndex((p) => p.id === id)

  if (index === -1) {
    return res.status(404).json({ error: 'Project not found' })
  }

  try {
    const updates = req.body ?? {}
    projects[index] = {
      ...projects[index],
      ...updates,
      id: projects[index].id, // Preserve ID
    }
    res.json(projects[index])
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// Delete project
app.delete('/api/v1/projects/:id', (req, res) => {
  const id = req.params.id
  const index = projects.findIndex((p) => p.id === id)

  if (index === -1) {
    return res.status(404).json({ error: 'Project not found' })
  }

  projects.splice(index, 1)
  res.status(204).send()
})

// Project insights
app.get('/api/v1/projects/insights', (_req, res) => {
  const totalProjects = projects.length
  const totalViews = projects.reduce((sum, p) => sum + (p.views ?? 0), 0)
  const totalStars = projects.reduce((sum, p) => sum + (p.stars ?? 0), 0)
  const departments = [...new Set(projects.map((p) => p.department))]

  res.json({
    totalProjects,
    totalViews,
    totalStars,
    departments: departments.length,
    topDepartments: departments
      .map((dept) => ({
        name: dept,
        count: projects.filter((p) => p.department === dept).length,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  })
})

// Rankings
app.get('/api/v1/rankings', (_req, res) => {
  const byStars = [...projects]
    .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
    .slice(0, 10)
    .map((p, i) => ({ ...p, rank: i + 1 }))

  const byViews = [...projects]
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, 10)
    .map((p, i) => ({ ...p, rank: i + 1 }))

  res.json({ byStars, byViews })
})

// 404 handler
app.all('/api/*splat', (_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' })
})

// Start server
app.listen(API_PORT, () => {
  console.log(`[mock-api] http://127.0.0.1:${API_PORT}`)
  console.log('[mock-api] MySQL 없이 인메모리 모드로 실행 중')
})
