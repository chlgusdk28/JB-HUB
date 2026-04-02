import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const TEST_PORT = Number.parseInt(process.env.AIRGAP_SHELL_TEST_PORT ?? '8896', 10)
const API_ROOT = `http://127.0.0.1:${TEST_PORT}/api/v1`
const START_TIMEOUT_MS = 20_000

function spawnSqliteApi() {
  const buildExecutor = JSON.stringify([
    'node',
    '-e',
    [
      "const image = process.argv[1] || '';",
      "const dockerfile = process.argv[2] || '';",
      "const fs = require('node:fs');",
      "const text = fs.readFileSync(dockerfile, 'utf8');",
      "console.log('executor build for', image);",
      "if (/harbor:\\s*fail/i.test(text)) { console.error('configured executor failure'); process.exit(7); }",
      "const crypto = require('node:crypto');",
      "console.log('sha256:' + crypto.createHash('sha256').update(image).digest('hex'));",
    ].join(' '),
    '{destination}',
    '{dockerfile}',
  ])

  const scanExecutor = JSON.stringify([
    'node',
    '-e',
    [
      "const image = process.argv[1] || '';",
      "console.log('scanner image', image);",
      "if (image.includes('blocked')) { console.log('CRITICAL: 0 HIGH: 2 MEDIUM: 0 LOW: 0'); process.exit(1); }",
      "console.log('CRITICAL: 0 HIGH: 0 MEDIUM: 1 LOW: 2');",
    ].join(' '),
    '{destination}',
  ])

  const child = spawn(process.execPath, ['server/sqlite-api.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      API_PORT: String(TEST_PORT),
      CORS_ALLOWED_ORIGINS: 'http://127.0.0.1:5173',
      AIRGAP_BUILD_EXECUTOR_MODE: 'shell',
      AIRGAP_BUILD_EXECUTOR_COMMAND: buildExecutor,
      AIRGAP_SCAN_MODE: 'shell',
      AIRGAP_SCAN_COMMAND: scanExecutor,
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

async function createBuildRequest(metadata, dockerfileContent, currentUserName = 'shell-executor-user') {
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

async function waitForTerminal(buildId, acceptedStatuses) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const detail = await requestJson(`/builds/${buildId}`)
    assert.equal(detail.response.status, 200, 'build detail should return 200 while polling')
    const status = detail.payload.build?.status
    if (acceptedStatuses.includes(status)) {
      return detail.payload
    }
    await delay(300)
  }

  throw new Error(`Build ${buildId} did not reach one of statuses: ${acceptedStatuses.join(', ')}`)
}

async function run() {
  const { child, getLogs } = spawnSqliteApi()
  let exited = false
  child.on('exit', () => {
    exited = true
  })

  try {
    await waitForApiReady()

    const workerPayload = await requestJson('/system/workers')
    assert.equal(workerPayload.response.status, 200, 'worker status should return 200')
    assert.equal(workerPayload.payload.workers?.[0]?.executorMode, 'shell', 'worker should expose shell executor mode')

    const successBuild = await createBuildRequest(
      {
        projectId: 1,
        imageName: 'registry.internal.bank.co.kr/team-alpha/shell-success',
        tag: 'test-success',
        platform: 'linux/amd64',
        description: 'shell executor success build',
      },
      'FROM registry.internal.bank.co.kr/base/nginx:1.27\nEXPOSE 8080\nUSER 101\n',
    )
    assert.equal(successBuild.response.status, 202, 'shell success build request should return 202')

    const completed = await waitForTerminal(successBuild.payload.build.id, ['COMPLETED'])
    assert.equal(completed.build.status, 'COMPLETED', 'shell executor success build should complete')
    assert.ok(completed.build.imageDigest, 'shell executor should record image digest')

    const blockedBuild = await createBuildRequest(
      {
        projectId: 1,
        imageName: 'registry.internal.bank.co.kr/team-alpha/shell-blocked',
        tag: 'test-blocked',
        platform: 'linux/amd64',
        description: 'shell executor blocked build',
      },
      'FROM registry.internal.bank.co.kr/base/nginx:1.27\nEXPOSE 8080\nUSER 101\n',
    )
    assert.equal(blockedBuild.response.status, 202, 'shell blocked build request should return 202')

    const blocked = await waitForTerminal(blockedBuild.payload.build.id, ['PUSH_BLOCKED'])
    assert.equal(blocked.build.status, 'PUSH_BLOCKED', 'shell executor should block when scanner exits non-zero')
    assert.ok(blocked.scanResult?.highCount >= 2, 'shell executor should parse scan counts from output')

    const failedBuild = await createBuildRequest(
      {
        projectId: 1,
        imageName: 'registry.internal.bank.co.kr/team-alpha/shell-failed',
        tag: 'test-failed',
        platform: 'linux/amd64',
        description: 'shell executor build failure',
      },
      'FROM registry.internal.bank.co.kr/base/nginx:1.27\n# harbor: fail\nEXPOSE 8080\nUSER 101\n',
    )
    assert.equal(failedBuild.response.status, 202, 'shell failing build request should return 202')

    const failed = await waitForTerminal(failedBuild.payload.build.id, ['FAILED'])
    assert.equal(failed.build.status, 'FAILED', 'shell executor should fail when configured build command exits non-zero')

    console.log('Air-gapped shell executor tests passed.')
    console.log(`Validated shell executor endpoints on ${API_ROOT}`)
  } catch (error) {
    console.error('Air-gapped shell executor tests failed.')
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
