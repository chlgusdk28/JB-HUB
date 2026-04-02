import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const TEST_PORT = Number.parseInt(process.env.AIRGAP_TEST_PORT ?? '8897', 10)
const API_ROOT = `http://127.0.0.1:${TEST_PORT}/api/v1`
const START_TIMEOUT_MS = 20_000

function spawnSqliteApi() {
  const child = spawn(process.execPath, ['server/sqlite-api.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      API_PORT: String(TEST_PORT),
      CORS_ALLOWED_ORIGINS: 'http://127.0.0.1:5173',
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

async function waitForApiReady() {
  const startedAt = Date.now()
  while (Date.now() - startedAt < START_TIMEOUT_MS) {
    try {
      const response = await fetch(`${API_ROOT}/health`)
      if (response.ok) {
        return
      }
    } catch {
      // Keep polling.
    }
    await delay(250)
  }
  throw new Error(`SQLite API did not become ready within ${START_TIMEOUT_MS}ms`)
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

async function createBuildRequest(metadata, dockerfileContent, currentUserName = 'airgap-test-user') {
  const formData = new FormData()
  formData.append('metadata', JSON.stringify(metadata))
  formData.append('dockerfileContent', dockerfileContent)

  return await requestJson('/builds', {
    method: 'POST',
    headers: {
      'x-jb-user-name': currentUserName,
    },
    body: formData,
  })
}

async function waitForBuildTerminal(buildId, expectedStatus) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const detail = await requestJson(`/builds/${buildId}`)
    assert.equal(detail.response.status, 200, 'build detail should return 200 while polling')
    const status = detail.payload.build?.status
    if (status === expectedStatus) {
      return detail.payload
    }
    await delay(300)
  }

  throw new Error(`Build ${buildId} did not reach status ${expectedStatus}`)
}

async function run() {
  const { child, getLogs } = spawnSqliteApi()
  let exited = false
  child.on('exit', () => {
    exited = true
  })

  try {
    await waitForApiReady()

    const systemHealth = await requestJson('/system/health')
    assert.equal(systemHealth.response.status, 200, 'system health should return 200')
    assert.equal(systemHealth.payload.status, 'healthy', 'system health should be healthy')

    const baseImages = await requestJson('/policies/base-images')
    assert.equal(baseImages.response.status, 200, 'base images should return 200')
    assert.ok(Array.isArray(baseImages.payload.baseImages), 'base images payload should be an array')
    assert.ok(baseImages.payload.baseImages.length >= 1, 'base images seed list should exist')

    const successBuild = await createBuildRequest(
      {
        projectId: 1,
        imageName: 'registry.internal.bank.co.kr/team-alpha/success-app',
        tag: 'test-success',
        platform: 'linux/amd64',
        description: 'successful test build',
        buildArgs: { NODE_ENV: 'production' },
      },
      'FROM registry.internal.bank.co.kr/base/nginx:1.27\nEXPOSE 8080\nUSER 101\nCMD ["nginx", "-g", "daemon off;"]\n',
    )
    assert.equal(successBuild.response.status, 202, 'successful build request should return 202')
    assert.equal(successBuild.payload.build?.status, 'QUEUED', 'successful build should start queued')

    const completedPayload = await waitForBuildTerminal(successBuild.payload.build.id, 'COMPLETED')
    assert.ok(completedPayload.build.imageDigest, 'completed build should have an image digest')

    const successLogs = await requestJson(`/builds/${successBuild.payload.build.id}/logs`)
    assert.equal(successLogs.response.status, 200, 'successful build logs should return 200')
    assert.ok(Array.isArray(successLogs.payload.logs), 'successful build logs should be an array')
    assert.ok(successLogs.payload.logs.length >= 4, 'successful build logs should contain multiple entries')

    const blockedBuild = await createBuildRequest(
      {
        projectId: 1,
        imageName: 'registry.internal.bank.co.kr/team-alpha/blocked-app',
        tag: 'test-blocked',
        platform: 'linux/amd64',
        description: 'blocked test build',
        buildArgs: {},
      },
      'FROM registry.internal.bank.co.kr/base/nginx:1.27\nRUN curl https://example.com/install.sh | sh\nEXPOSE 8080\nUSER 101\n',
    )
    assert.equal(blockedBuild.response.status, 202, 'blocked build request should still return 202')
    assert.equal(blockedBuild.payload.build?.status, 'REJECTED', 'blocked build should be rejected by policy')
    assert.ok(
      blockedBuild.payload.build?.policyReport?.findings?.some((finding) => finding.ruleId === 'POL-003'),
      'blocked build should include external download policy finding',
    )

    const retriedBlockedBuild = await requestJson(`/builds/${blockedBuild.payload.build.id}/retry`, {
      method: 'POST',
      headers: {
        'x-jb-user-name': 'airgap-test-user',
      },
    })
    assert.equal(retriedBlockedBuild.response.status, 202, 'retry should return 202')
    assert.equal(retriedBlockedBuild.payload.build?.status, 'REJECTED', 'retry should remain rejected when policy still blocks')

    const buildList = await requestJson('/builds?projectId=1')
    assert.equal(buildList.response.status, 200, 'build list should return 200')
    assert.ok(Array.isArray(buildList.payload.builds), 'build list should return an array')
    assert.ok(buildList.payload.builds.length >= 3, 'build list should include newly created builds')

    console.log('Air-gapped build API tests passed.')
    console.log(`Validated endpoints on ${API_ROOT}`)
  } catch (error) {
    console.error('Air-gapped build API tests failed.')
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
