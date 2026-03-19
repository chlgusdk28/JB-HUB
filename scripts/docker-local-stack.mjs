import fs from 'node:fs'
import path from 'node:path'
import { spawnInWorkingDir } from './spawn-in-working-dir.mjs'

const HELP_TEXT = `
Simple local Docker flow for JB-Hub.

Usage:
  node scripts/docker-local-stack.mjs <version>
  node scripts/docker-local-stack.mjs <version> --ops
  node scripts/docker-local-stack.mjs <version> --docker
  node scripts/docker-local-stack.mjs down [--volumes]
  node scripts/docker-local-stack.mjs logs
  node scripts/docker-local-stack.mjs ps

Examples:
  node scripts/docker-local-stack.mjs 1.0.0
  node scripts/docker-local-stack.mjs 1.0.0 --ops
  node scripts/docker-local-stack.mjs down --volumes
`.trim()

const RUNTIME_ENV_FILE = path.join(process.cwd(), '.runtime', 'docker-local-stack.env')
const STACK_NAME = 'jbhub-local'

function fail(message) {
  process.stderr.write(`[docker-local] ${message}\n`)
  process.exit(1)
}

function isValidTag(value) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(String(value ?? ''))
}

function buildEnvText(version) {
  return `NODE_ENV=production
JBHUB_STACK_NAME=${STACK_NAME}
JBHUB_WEB_IMAGE=jbhub-web:${version}
JBHUB_API_IMAGE=jbhub-api:${version}
JBHUB_MYSQL_IMAGE=mysql:8.4
JBHUB_ADMINER_IMAGE=adminer:4

JBHUB_WEB_PORT=8080
JBHUB_API_PORT=8788
JBHUB_DB_PORT=3311
JBHUB_ADMINER_PORT=8082

MYSQL_ROOT_PASSWORD=jbhub-local-root-password
MYSQL_DATABASE=jbhub
MYSQL_USER=jbhub
MYSQL_PASSWORD=jbhub-local-app-password

DB_CONN_LIMIT=10
DB_SEED=false
DB_CONNECT_RETRY_ATTEMPTS=40
DB_CONNECT_RETRY_DELAY_MS=2000
APP_PRODUCT_MODE=signup

API_RATE_LIMIT_WINDOW_MS=60000
API_RATE_LIMIT_MAX_REQUESTS=240

API_JWT_HS256_SECRET=jbhub-local-docker-jwt-secret-2026-dev-only
API_JWT_ISSUER=jbhub-api
API_JWT_AUDIENCE=jbhub-client
JWT_ACCESS_TOKEN_EXPIRATION=86400
JWT_REFRESH_TOKEN_EXPIRATION=604800

ADMIN_DEFAULT_USERNAME=jbhub-admin
ADMIN_DEFAULT_PASSWORD=jbhub-local-admin-password
ADMIN_DEFAULT_EMAIL=admin@jbhub.local
ADMIN_SESSION_TIMEOUT_MS=3600000
ADMIN_MAX_LOGIN_ATTEMPTS=5
ADMIN_LOCKOUT_DURATION_MS=900000
AUTH_STATE_CLEANUP_INTERVAL_MS=300000

AUDIT_LOG_ENABLED=true
AUDIT_LOG_RETENTION_DAYS=90
TZ=Asia/Seoul
CORS_ALLOWED_ORIGINS=http://127.0.0.1:8080,http://localhost:8080
`
}

async function runCommand(command, args) {
  process.stdout.write(`[docker-local] ${command} ${args.join(' ')}\n`)

  const child = spawnInWorkingDir(command, args, {
    stdio: 'inherit',
  })

  await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (code) => {
      if ((code ?? 0) === 0) {
        resolve()
        return
      }

      reject(new Error(`${command} exited with code ${code ?? 1}`))
    })
  })
}

async function ensureRuntimeEnv(version = 'latest') {
  await fs.promises.mkdir(path.dirname(RUNTIME_ENV_FILE), { recursive: true })
  await fs.promises.writeFile(RUNTIME_ENV_FILE, buildEnvText(version), 'utf8')
}

function buildComposeArgs(flags) {
  const args = ['compose', '-p', STACK_NAME, '--env-file', RUNTIME_ENV_FILE, '-f', 'docker-compose.airgap.yml']

  if (flags.has('--docker')) {
    args.push('-f', 'docker-compose.airgap.docker-features.yml')
  }

  if (flags.has('--ops')) {
    args.push('--profile', 'ops')
  }

  return args
}

const rawArgs = process.argv.slice(2)

if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
  process.stdout.write(`${HELP_TEXT}\n`)
  process.exit(0)
}

if (rawArgs.length === 0) {
  fail(`Version is required.\n\n${HELP_TEXT}`)
}

const flags = new Set(rawArgs.filter((arg) => arg.startsWith('--')))
const positionals = rawArgs.filter((arg) => !arg.startsWith('--'))
const commandCandidate = positionals[0]
const command = ['down', 'logs', 'ps'].includes(commandCandidate) ? commandCandidate : 'up'
const version = command === 'up' ? positionals[0] : positionals[1] ?? 'latest'

if (command === 'up' && !isValidTag(version)) {
  fail('Version must be a simple Docker tag such as 1.0.0, v1, or 2026.03.19.')
}

await ensureRuntimeEnv(version)

if (command === 'down') {
  const args = buildComposeArgs(flags)
  args.push('down')
  if (flags.has('--volumes')) {
    args.push('-v')
  }
  await runCommand('docker', args)
  process.exit(0)
}

if (command === 'logs') {
  const args = buildComposeArgs(flags)
  args.push('logs', '-f')
  await runCommand('docker', args)
  process.exit(0)
}

if (command === 'ps') {
  const args = buildComposeArgs(flags)
  args.push('ps')
  await runCommand('docker', args)
  process.exit(0)
}

await runCommand('docker', ['build', '-t', `jbhub-web:${version}`, '-f', 'Dockerfile.web', '.'])
await runCommand('docker', ['build', '-t', `jbhub-api:${version}`, '-f', 'Dockerfile.api', '.'])

const upArgs = buildComposeArgs(flags)
upArgs.push('up', '-d')
await runCommand('docker', upArgs)

process.stdout.write(
  [
    `[docker-local] Stack is ready with version ${version}.`,
    '[docker-local] Web: http://127.0.0.1:8080',
    '[docker-local] API: http://127.0.0.1:8788/api/v1/health',
    '[docker-local] Web proxy API: http://127.0.0.1:8080/api/v1/health',
    flags.has('--ops') ? '[docker-local] Adminer: http://127.0.0.1:8082' : '[docker-local] Add --ops if you want Adminer on :8082',
  ].join('\n') + '\n',
)
