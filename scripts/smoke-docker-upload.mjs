import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { spawnInWorkingDir } from './spawn-in-working-dir.mjs'

const ROOT_DIR = process.cwd()
const TEMP_ROOT = path.join(ROOT_DIR, '.runtime', 'docker-upload-smoke')
const API_PORT = Number.parseInt(process.env.DOCKER_SMOKE_API_PORT ?? '8898', 10)
const API_ROOT = `http://127.0.0.1:${API_PORT}/api/v1`
const PROJECT_AUTHOR = 'docker-smoke'
const START_TIMEOUT_MS = 60_000
const DEPLOYMENT_TIMEOUT_MS = 60_000
const KEEP_ARTIFACTS = process.env.DOCKER_SMOKE_KEEP_ARTIFACTS === '1'

function createCommandError(command, args, code, stdout, stderr) {
  const output = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n')
  return new Error(output || `${command} ${args.join(' ')} exited with code ${code ?? 1}`)
}

async function runCommand(command, args, options = {}) {
  const child = spawnInWorkingDir(command, args, {
    cwd: options.cwd ?? ROOT_DIR,
    env: options.env ?? process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stdout = ''
  let stderr = ''
  child.stdout?.setEncoding('utf8')
  child.stderr?.setEncoding('utf8')
  child.stdout?.on('data', (chunk) => {
    stdout += chunk
  })
  child.stderr?.on('data', (chunk) => {
    stderr += chunk
  })

  const code = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (exitCode) => resolve(exitCode ?? 0))
  })

  if (code !== 0) {
    throw createCommandError(command, args, code, stdout, stderr)
  }

  return { stdout, stderr }
}

async function writeFixtureFiles(bundleName) {
  const frontendContext = path.join(TEMP_ROOT, 'frontend')
  const backendContext = path.join(TEMP_ROOT, 'backend')
  const outputArchive = path.join(TEMP_ROOT, `${bundleName}.tar.gz`)
  const environmentFile = path.join(TEMP_ROOT, '.env')
  const composeFile = path.join(TEMP_ROOT, 'docker-compose.yml')

  await fs.rm(TEMP_ROOT, { recursive: true, force: true })
  await fs.mkdir(frontendContext, { recursive: true })
  await fs.mkdir(backendContext, { recursive: true })

  const frontendDockerfile = `FROM busybox:1.36
COPY serve.sh /serve.sh
RUN chmod +x /serve.sh
EXPOSE 80
CMD ["/serve.sh"]
`

  const backendDockerfile = `FROM busybox:1.36
COPY serve.sh /serve.sh
RUN chmod +x /serve.sh
EXPOSE 3001
CMD ["/serve.sh"]
`

  await Promise.all([
    fs.writeFile(path.join(frontendContext, 'Dockerfile'), frontendDockerfile, 'utf8'),
    fs.writeFile(
      path.join(frontendContext, 'serve.sh'),
      `#!/bin/sh
set -eu

: "\${MESSAGE:?MESSAGE is required}"
mkdir -p /www
printf '<!doctype html><html><body><h1>%s</h1></body></html>\\n' "$MESSAGE" > /www/index.html
exec httpd -f -p 80 -h /www
`,
      'utf8',
    ),
    fs.writeFile(path.join(backendContext, 'Dockerfile'), backendDockerfile, 'utf8'),
    fs.writeFile(
      path.join(backendContext, 'serve.sh'),
      `#!/bin/sh
set -eu

mkdir -p /www
printf '<!doctype html><html><body><h1>%s</h1></body></html>\\n' "\${MESSAGE:-docker upload smoke backend via compose}" > /www/index.html
exec httpd -f -p 3001 -h /www
`,
      'utf8',
    ),
    fs.writeFile(environmentFile, 'SMOKE_ENV=active\nINLINE_EXPECTED=1\n', 'utf8'),
    fs.writeFile(
      composeFile,
      `services:
  frontend:
    image: ${bundleName}-frontend:latest
    depends_on:
      backend:
        condition: service_started
    environment:
      MESSAGE: docker upload smoke frontend via compose
  backend:
    image: ${bundleName}-backend:latest
    environment:
      MESSAGE: docker upload smoke backend via compose
`,
      'utf8',
    ),
  ])

  return {
    frontendContext,
    backendContext,
    outputArchive,
    environmentFile,
    composeFile,
    frontendContextArg: path.relative(ROOT_DIR, frontendContext),
    backendContextArg: path.relative(ROOT_DIR, backendContext),
    outputArchiveArg: path.relative(ROOT_DIR, outputArchive),
  }
}

function startApiServer() {
  const child = spawnInWorkingDir(process.execPath, ['server/index.js'], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      API_PORT: String(API_PORT),
      APP_PRODUCT_MODE: 'hub',
      DB_NAME: process.env.DOCKER_SMOKE_DB_NAME ?? `jbhub_docker_smoke_${Date.now()}`,
      DB_CONNECT_RETRY_ATTEMPTS: process.env.DB_CONNECT_RETRY_ATTEMPTS ?? '40',
      DB_CONNECT_RETRY_DELAY_MS: process.env.DB_CONNECT_RETRY_DELAY_MS ?? '1000',
      CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS ?? 'http://127.0.0.1:5173,http://localhost:5173',
      API_JWT_HS256_SECRET:
        process.env.API_JWT_HS256_SECRET ?? 'docker-smoke-jwt-secret-change-me-12345678901234567890',
      ADMIN_DEFAULT_USERNAME: process.env.ADMIN_DEFAULT_USERNAME ?? 'jbhub-admin',
      ADMIN_DEFAULT_PASSWORD: process.env.ADMIN_DEFAULT_PASSWORD ?? 'docker-smoke-admin-password-1234567890',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let logs = ''
  let exited = false

  child.stdout?.setEncoding('utf8')
  child.stderr?.setEncoding('utf8')
  child.stdout?.on('data', (chunk) => {
    logs += chunk
  })
  child.stderr?.on('data', (chunk) => {
    logs += chunk
  })
  child.on('exit', () => {
    exited = true
  })

  return {
    getLogs() {
      return logs
    },
    isExited() {
      return exited
    },
    async stop() {
      if (exited) {
        return
      }

      if (process.platform === 'win32' && child.pid) {
        try {
          await runCommand('taskkill', ['/T', '/F', '/PID', String(child.pid)])
        } catch {
          child.kill('SIGTERM')
        }
      } else {
        child.kill('SIGTERM')
      }

      await delay(1000)

      if (!exited) {
        child.kill('SIGKILL')
        await delay(500)
      }
    },
  }
}

async function waitForApiReady(apiServer) {
  const deadline = Date.now() + START_TIMEOUT_MS

  while (Date.now() < deadline) {
    if (apiServer.isExited()) {
      throw new Error(`API server exited before becoming ready.\n${apiServer.getLogs()}`)
    }

    try {
      const response = await fetch(`${API_ROOT}/health`)
      if (response.ok) {
        return
      }
    } catch {
      // Keep polling until timeout.
    }

    await delay(500)
  }

  throw new Error(`API server did not become ready within ${START_TIMEOUT_MS}ms.\n${apiServer.getLogs()}`)
}

async function parseResponseJson(response) {
  const text = await response.text()
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return { raw: text }
  }
}

async function createSmokeProject() {
  const response = await fetch(`${API_ROOT}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: `Docker Upload Smoke ${Date.now()}`,
      description: 'Smoke test project used to validate Docker bundle upload and deployment.',
      author: PROJECT_AUTHOR,
      department: 'IT Digital',
      tags: ['docker', 'smoke'],
      stars: 1,
      forks: 0,
      comments: 0,
      views: 0,
      createdAt: 'just now',
      isNew: true,
      trend: 'steady',
      badge: 'smoke',
    }),
  })

  const payload = await parseResponseJson(response)
  assert.equal(response.status, 201, `Failed to create smoke project: ${JSON.stringify(payload)}`)
  assert.ok(payload?.project?.id, 'Smoke project response should include project id')

  return Number(payload.project.id)
}

async function reservePreferredHostPort() {
  while (true) {
    const server = net.createServer()
    server.unref()

    const port = await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.once('listening', () => {
        const address = server.address()
        resolve(typeof address === 'object' && address ? address.port : null)
      })
      server.listen(0, '127.0.0.1')
    })

    await new Promise((resolve) => server.close(resolve))

    if (Number.isFinite(port) && port >= 50000) {
      return port
    }
  }
}

async function uploadBundle(projectId, files) {
  const formData = new FormData()
  const preferredHostPort = await reservePreferredHostPort()
  formData.append('tarFile', new Blob([await fs.readFile(files.outputArchive)]), path.basename(files.outputArchive))
  formData.append('environmentFile', new Blob([await fs.readFile(files.environmentFile)]), path.basename(files.environmentFile))
  formData.append('composeFile', new Blob([await fs.readFile(files.composeFile)]), path.basename(files.composeFile))
  formData.append('environment', 'INLINE_EXPECTED=1\n')
  formData.append('preferredHostPort', String(preferredHostPort))

  const response = await fetch(`${API_ROOT}/projects/${projectId}/docker/images`, {
    method: 'POST',
    headers: {
      'x-jb-user-name': PROJECT_AUTHOR,
    },
    body: formData,
  })

  const payload = await parseResponseJson(response)
  assert.equal(response.status, 201, `Docker bundle upload failed: ${JSON.stringify(payload)}`)

  return payload
}

async function fetchDockerSummary(projectId) {
  const response = await fetch(`${API_ROOT}/projects/${projectId}/docker`, {
    headers: { 'x-jb-user-name': PROJECT_AUTHOR },
  })
  const payload = await parseResponseJson(response)
  assert.equal(response.status, 200, `Failed to fetch Docker summary: ${JSON.stringify(payload)}`)
  return payload
}

async function waitForDeployment(projectId, deploymentId) {
  const deadline = Date.now() + DEPLOYMENT_TIMEOUT_MS
  let lastDeployment = null

  while (Date.now() < deadline) {
    const summary = await fetchDockerSummary(projectId)
    const deployment = Array.isArray(summary?.deployments)
      ? summary.deployments.find((entry) => Number(entry.id) === Number(deploymentId))
      : null

    if (deployment) {
      lastDeployment = deployment
    }

    if (deployment && ['running', 'failed', 'exited', 'removed'].includes(String(deployment.status))) {
      return { summary, deployment }
    }

    await delay(1000)
  }

  const lastStateMessage = lastDeployment ? ` Last state: ${JSON.stringify(lastDeployment)}.` : ''
  throw new Error(`Deployment ${deploymentId} did not reach a stable state within ${DEPLOYMENT_TIMEOUT_MS}ms.${lastStateMessage}`)
}

async function fetchDeploymentLogs(projectId, deploymentId) {
  const response = await fetch(`${API_ROOT}/projects/${projectId}/docker/deployments/${deploymentId}/logs?tail=50`, {
    headers: { 'x-jb-user-name': PROJECT_AUTHOR },
  })
  const payload = await parseResponseJson(response)
  assert.equal(response.status, 200, `Failed to fetch deployment logs: ${JSON.stringify(payload)}`)
  return typeof payload?.logs === 'string' ? payload.logs : ''
}

async function deleteUploadedImage(projectId, imageId) {
  const response = await fetch(`${API_ROOT}/projects/${projectId}/docker/images/${imageId}`, {
    method: 'DELETE',
    headers: { 'x-jb-user-name': PROJECT_AUTHOR },
  })
  const payload = await parseResponseJson(response)
  assert.equal(response.status, 200, `Failed to remove uploaded image: ${JSON.stringify(payload)}`)
}

async function verifyPrimaryEndpoint(endpointUrl) {
  assert.ok(endpointUrl, 'Deployment should expose an endpoint URL')

  const deadline = Date.now() + DEPLOYMENT_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const response = await fetch(endpointUrl)
      if (response.ok) {
        const body = await response.text()
        assert.match(body, /docker upload smoke frontend via compose/i, 'Primary endpoint should serve the compose-managed frontend smoke page')
        return
      }
    } catch {
      // Keep polling until the container responds.
    }

    await delay(1000)
  }

  throw new Error(`Primary deployment endpoint did not respond successfully: ${endpointUrl}`)
}

async function ensureDockerComposeStack() {
  await runCommand('docker', ['version'])
  await runCommand('docker', ['compose', 'up', '-d'])
}

async function buildBundle(bundleName, files) {
  await runCommand(process.execPath, [
    'scripts/build-docker-bundle.mjs',
    '--name',
    bundleName,
    '--frontend-context',
    files.frontendContextArg,
    '--backend-context',
    files.backendContextArg,
    '--output',
    files.outputArchiveArg,
  ])
}

async function main() {
  const bundleName = `docker-smoke-${Date.now()}`
  const fixtureFiles = await writeFixtureFiles(bundleName)
  let apiServer = null
  let projectId = null
  let uploadedImageId = null

  try {
    await ensureDockerComposeStack()
    await buildBundle(bundleName, fixtureFiles)
    apiServer = startApiServer()
    await waitForApiReady(apiServer)

    projectId = await createSmokeProject()
    const uploadResult = await uploadBundle(projectId, fixtureFiles)

    const images = Array.isArray(uploadResult?.images) ? uploadResult.images : []
    const deployments = Array.isArray(uploadResult?.deployments) ? uploadResult.deployments : []
    const uploadedImage = uploadResult?.image ?? images[0] ?? null
    const createdDeployment = uploadResult?.deployment ?? deployments[0] ?? null

    assert.ok(uploadedImage?.id, 'Upload response should include an image record')
    assert.ok(createdDeployment?.id, 'Upload response should include a deployment record')
    assert.equal(uploadedImage.environmentFileName, '.env', 'Environment file name should be stored')
    assert.equal(uploadedImage.composeFileName, 'docker-compose.yml', 'Compose file name should be stored')
    assert.deepEqual(
      uploadedImage.composeServices,
      ['frontend', 'backend'],
      'Compose service names should be parsed from the uploaded compose file',
    )

    uploadedImageId = Number(uploadedImage.id)
    const { deployment } = await waitForDeployment(projectId, createdDeployment.id)
    assert.equal(deployment.status, 'running', `Deployment should be running, got ${deployment.status}`)

    await verifyPrimaryEndpoint(deployment.endpointUrl)
    await fetchDeploymentLogs(projectId, createdDeployment.id)

    console.log('Docker upload smoke test passed.')
    console.log(`Validated bundle upload on ${API_ROOT}/projects/${projectId}/docker/images`)
    console.log(`Deployment endpoint: ${deployment.endpointUrl}`)
  } catch (error) {
    console.error('Docker upload smoke test failed.')
    console.error(error instanceof Error ? error.message : error)
    console.error('--- API logs ---')
    console.error(apiServer?.getLogs() ?? '')
    process.exitCode = 1
  } finally {
    if (projectId && uploadedImageId && (!KEEP_ARTIFACTS || process.exitCode !== 1)) {
      try {
        await deleteUploadedImage(projectId, uploadedImageId)
      } catch (cleanupError) {
        console.error('Failed to clean up uploaded smoke image.')
        console.error(cleanupError instanceof Error ? cleanupError.message : cleanupError)
        process.exitCode = 1
      }
    }

    await apiServer?.stop()

    if (!KEEP_ARTIFACTS) {
      await fs.rm(TEMP_ROOT, { recursive: true, force: true })
    }
  }
}

await main()
