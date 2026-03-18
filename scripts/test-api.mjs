import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const TEST_PORT = Number.parseInt(process.env.API_TEST_PORT ?? '8899', 10)
const API_ROOT = `http://127.0.0.1:${TEST_PORT}/api`
const SERVER_START_TIMEOUT_MS = 45_000

function spawnApiServer() {
  const child = spawn('node', ['server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      API_PORT: String(TEST_PORT),
      DB_NAME: process.env.DB_NAME ?? `jbhub_test_${TEST_PORT}`,
      CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS ?? 'http://127.0.0.1:5173',
      API_JWT_HS256_SECRET: process.env.API_JWT_HS256_SECRET ?? 'test-api-jwt-secret-change-me-1234567890',
      ADMIN_DEFAULT_USERNAME: process.env.ADMIN_DEFAULT_USERNAME ?? 'jbhub-admin',
      ADMIN_DEFAULT_PASSWORD: process.env.ADMIN_DEFAULT_PASSWORD ?? 'test-admin-password-1234567890',
      DB_CONNECT_RETRY_ATTEMPTS: process.env.DB_CONNECT_RETRY_ATTEMPTS ?? '20',
      DB_CONNECT_RETRY_DELAY_MS: process.env.DB_CONNECT_RETRY_DELAY_MS ?? '1000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let logs = ''
  child.stdout.on('data', (chunk) => {
    logs += chunk.toString()
  })
  child.stderr.on('data', (chunk) => {
    logs += chunk.toString()
  })

  return { child, getLogs: () => logs }
}

async function waitForApiReady(rootUrl, timeoutMs) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${rootUrl}/health`)
      if (response.ok) {
        return
      }
    } catch {
      // keep polling
    }
    await delay(500)
  }
  throw new Error(`API did not become ready within ${timeoutMs}ms`)
}

async function requestJson(path, init) {
  const response = await fetch(`${API_ROOT}${path}`, init)
  const text = await response.text()
  let payload = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = { raw: text }
  }
  return { response, payload }
}

async function requestAdminJson(port, path, init) {
  const response = await fetch(`http://127.0.0.1:${port}/api/admin${path}`, init)
  const text = await response.text()
  let payload = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = { raw: text }
  }
  return { response, payload }
}

async function run() {
  const { child, getLogs } = spawnApiServer()
  let exited = false
  child.on('exit', () => {
    exited = true
  })

  try {
    await waitForApiReady(API_ROOT, SERVER_START_TIMEOUT_MS)

    const { response: healthRes, payload: health } = await requestJson('/health')
    assert.equal(healthRes.status, 200, 'health should return 200')
    assert.ok(health.status === 'healthy' || health.ok === true, 'health status should indicate healthy')

    const adminLogin = await requestAdminJson(TEST_PORT, '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: process.env.ADMIN_DEFAULT_USERNAME ?? 'jbhub-admin',
        password: process.env.ADMIN_DEFAULT_PASSWORD ?? 'test-admin-password-1234567890',
      }),
    })
    assert.equal(adminLogin.response.status, 200, 'admin login should return 200')
    assert.ok(adminLogin.payload.accessToken, 'admin login should return access token')
    assert.ok(adminLogin.payload.sessionId, 'admin login should return session id')

    const adminToken = adminLogin.payload.accessToken
    const adminSessionId = adminLogin.payload.sessionId

    const meWithoutSession = await requestAdminJson(TEST_PORT, '/me', {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    assert.equal(meWithoutSession.response.status, 401, '/api/admin/me should require x-admin-session')

    const meWithSession = await requestAdminJson(TEST_PORT, '/me', {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-admin-session': adminSessionId,
      },
    })
    assert.equal(meWithSession.response.status, 200, '/api/admin/me with session should return 200')

    const statsWithoutSession = await requestAdminJson(TEST_PORT, '/stats', {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    assert.equal(statsWithoutSession.response.status, 401, '/api/admin/stats should require x-admin-session')

    const statsWithSession = await requestAdminJson(TEST_PORT, '/stats', {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-admin-session': adminSessionId,
      },
    })
    assert.equal(statsWithSession.response.status, 200, '/api/admin/stats with session should return 200')

    const { response: listRes, payload: listPayload } = await requestJson('/projects?sortBy=stars&limit=5')
    assert.equal(listRes.status, 200, 'projects list should return 200')
    assert.ok(Array.isArray(listPayload.projects), 'projects payload should be an array')
    assert.ok(listPayload.projects.length <= 5, 'limit query should be respected')

    const invalidCreate = await requestJson('/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: 'missing title',
        author: 'api-test',
        department: 'IT Digital',
        tags: ['test'],
      }),
    })
    assert.equal(invalidCreate.response.status, 400, 'invalid create should return 400')

    const createPayload = {
      title: `API Test Project ${Date.now()}`,
      description: 'Created by integration test',
      author: 'api-test',
      department: 'IT Digital',
      tags: ['integration', 'test'],
      stars: 7,
      forks: 1,
      comments: 0,
      views: 21,
      createdAt: 'just now',
      isNew: true,
      trend: 'rising',
      badge: 'test',
    }
    const created = await requestJson('/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createPayload),
    })
    assert.equal(created.response.status, 201, 'valid create should return 201')
    assert.ok(created.payload.project?.id, 'created project should contain id')

    const createdId = created.payload.project.id
    const fetched = await requestJson(`/projects/${createdId}`)
    assert.equal(fetched.response.status, 200, 'fetch by id should return 200')
    assert.equal(fetched.payload.project?.id, createdId, 'fetched project id should match created id')

    const searched = await requestJson(`/projects?search=${encodeURIComponent(createPayload.title)}`)
    assert.equal(searched.response.status, 200, 'search should return 200')
    assert.ok(
      searched.payload.projects.some((project) => project.id === createdId),
      'search should contain created project',
    )

    const insights = await requestJson('/projects/insights')
    assert.equal(insights.response.status, 200, 'insights should return 200')
    assert.ok(insights.payload.insights?.summary?.totalProjects >= 1, 'insights summary should exist')
    assert.ok(Array.isArray(insights.payload.insights?.projectRanking), 'insights ranking should be array')

    const rankings = await requestJson('/rankings')
    assert.equal(rankings.response.status, 200, 'rankings should return 200')
    assert.ok(Array.isArray(rankings.payload.rankings?.projects), 'rankings.projects should be array')
    assert.ok(Array.isArray(rankings.payload.rankings?.contributors), 'rankings.contributors should be array')
    assert.ok(Array.isArray(rankings.payload.rankings?.departments), 'rankings.departments should be array')

    const notFound = await requestJson('/not-found')
    assert.equal(notFound.response.status, 404, 'unknown endpoint should return 404')

    console.log('API integration tests passed.')
    console.log(`Validated endpoints on ${API_ROOT}`)
  } catch (error) {
    console.error('API integration tests failed.')
    console.error(error)
    console.error('--- API logs ---')
    console.error(getLogs())
    process.exitCode = 1
  } finally {
    if (!exited) {
      child.kill('SIGTERM')
      await delay(800)
      if (!exited) {
        child.kill('SIGKILL')
      }
    }
  }
}

await run()
