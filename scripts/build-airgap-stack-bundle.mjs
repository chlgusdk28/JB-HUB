import fs from 'node:fs'
import path from 'node:path'
import { createGzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { spawnInWorkingDir } from './spawn-in-working-dir.mjs'

const HELP_TEXT = `
Build an air-gap Docker bundle for the JB-Hub app stack.

Usage:
  node scripts/build-airgap-stack-bundle.mjs
  node scripts/build-airgap-stack-bundle.mjs --name jbhub --platform linux/amd64
  node scripts/build-airgap-stack-bundle.mjs --output-dir ./artifacts/jbhub-airgap

Options:
  --name <name>         Base image name prefix (default: jbhub)
  --platform <value>    Docker build platform (default: linux/amd64)
  --output-dir <path>   Output directory for bundle files
  --image-archive-format <value>
                        Image archive format: tar.gz or tar (default: tar.gz)
  --skip-adminer        Exclude adminer image from the exported image set
  --dry-run             Print commands without executing them
  --help                Show this help
`.trim()

function fail(message) {
  process.stderr.write(`[airgap] ${message}\n`)
  process.exit(1)
}

function isSupportedArchiveFormat(value) {
  return value === 'tar.gz' || value === 'tar'
}

function resolveImageArchiveName(format) {
  return format === 'tar' ? 'images.tar' : 'images.tar.gz'
}

function slugifyName(value) {
  const normalized = String(value || 'jbhub')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || 'jbhub'
}

function toDateStamp(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

function takeValue(args, index, flagName) {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) {
    fail(`Missing value for ${flagName}`)
  }

  return value
}

function parseCliArgs(argv) {
  const options = {
    name: 'jbhub',
    platform: 'linux/amd64',
    imageArchiveFormat: 'tar.gz',
    skipAdminer: false,
    dryRun: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    switch (argument) {
      case '--help':
        options.help = true
        break
      case '--dry-run':
        options.dryRun = true
        break
      case '--skip-adminer':
        options.skipAdminer = true
        break
      case '--name':
        options.name = takeValue(argv, index, argument)
        index += 1
        break
      case '--platform':
        options.platform = takeValue(argv, index, argument)
        index += 1
        break
      case '--output-dir':
        options.outputDir = takeValue(argv, index, argument)
        index += 1
        break
      case '--image-archive-format':
        options.imageArchiveFormat = takeValue(argv, index, argument)
        index += 1
        break
      default:
        fail(`Unknown option: ${argument}`)
    }
  }

  if (!isSupportedArchiveFormat(options.imageArchiveFormat)) {
    fail(`Unsupported image archive format: ${options.imageArchiveFormat}`)
  }

  return options
}

function printCommand(command, args) {
  process.stdout.write(`[airgap] ${command} ${args.join(' ')}\n`)
}

async function runCommand(command, args, { dryRun = false } = {}) {
  printCommand(command, args)

  if (dryRun) {
    return
  }

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

function buildBuildxArgs(imageTag, dockerfilePath, platform) {
  return ['buildx', 'build', '--platform', platform, '-t', imageTag, '-f', dockerfilePath, '--load', '.']
}

async function saveBundleArchive(imageTags, outputPath, dryRun) {
  const dockerSavePath = `${outputPath}.tmp.tar`
  printCommand('docker', ['save', '-o', dockerSavePath, ...imageTags])

  if (dryRun) {
    return
  }

  try {
    await runCommand('docker', ['save', '-o', dockerSavePath, ...imageTags])
    if (outputPath.endsWith('.tar')) {
      await fs.promises.rename(dockerSavePath, outputPath)
      return
    }

    await pipeline(fs.createReadStream(dockerSavePath), createGzip({ level: 9 }), fs.createWriteStream(outputPath))
    await fs.promises.rm(dockerSavePath, { force: true })
  } catch (error) {
    await fs.promises.rm(outputPath, { force: true }).catch(() => {})
    await fs.promises.rm(dockerSavePath, { force: true }).catch(() => {})
    throw error
  }
}

function buildBundleEnvText({ stackName, webImage, apiImage, mysqlImage, adminerImage }) {
  return `NODE_ENV=production
JBHUB_STACK_NAME=${stackName}
JBHUB_WEB_IMAGE=${webImage}
JBHUB_API_IMAGE=${apiImage}
JBHUB_MYSQL_IMAGE=${mysqlImage}
JBHUB_ADMINER_IMAGE=${adminerImage}

JBHUB_WEB_PORT=8080
JBHUB_API_PORT=8787
JBHUB_DB_PORT=3310
JBHUB_ADMINER_PORT=8081

MYSQL_ROOT_PASSWORD=change-this-root-password
MYSQL_DATABASE=jbhub
MYSQL_USER=jbhub
MYSQL_PASSWORD=change-this-app-password

DB_CONN_LIMIT=10
DB_SEED=false
DB_CONNECT_RETRY_ATTEMPTS=40
DB_CONNECT_RETRY_DELAY_MS=2000
APP_PRODUCT_MODE=signup

API_RATE_LIMIT_WINDOW_MS=60000
API_RATE_LIMIT_MAX_REQUESTS=240

API_JWT_HS256_SECRET=change-this-jwt-secret-with-at-least-32-characters
API_JWT_ISSUER=jbhub-api
API_JWT_AUDIENCE=jbhub-client
JWT_ACCESS_TOKEN_EXPIRATION=86400
JWT_REFRESH_TOKEN_EXPIRATION=604800

ADMIN_DEFAULT_USERNAME=jbhub-admin
ADMIN_DEFAULT_PASSWORD=change-this-admin-password
ADMIN_DEFAULT_EMAIL=admin@jbhub.local
ADMIN_SESSION_TIMEOUT_MS=3600000
ADMIN_MAX_LOGIN_ATTEMPTS=5
ADMIN_LOCKOUT_DURATION_MS=900000
AUTH_STATE_CLEANUP_INTERVAL_MS=300000

AUDIT_LOG_ENABLED=true
AUDIT_LOG_RETENTION_DAYS=90
TZ=Asia/Seoul

CORS_ALLOWED_ORIGINS=
`
}

function buildImportGuide({ bundleDirName, imageArchiveName, includeAdminer }) {
  const adminerNote = includeAdminer
    ? `\nOptional Adminer UI:\n  docker compose --env-file .env.bundle -f docker-compose.airgap.yml --profile ops up -d adminer\n`
    : '\nAdminer image was not included in this bundle.\n'

  return `# JB-Hub Air-Gap Bundle

This directory contains everything needed to import the JB-Hub app stack into a closed network Docker host.

## Files

- \`${imageArchiveName}\`: Docker image archive for web, api, mysql${includeAdminer ? ', adminer' : ''}
- \`docker-compose.airgap.yml\`: base compose file
- \`docker-compose.airgap.docker-features.yml\`: optional override for JB-Hub in-app Docker features
- \`docker-compose.airgap.restore.yml\`: optional first-boot DB restore override used with \`mysql_jbhub.sql\`
- \`.env.airgap.example\`: default environment example
- \`.env.bundle\`: environment template with the exact image tags from this build

## Import

1. Load images:
   - \`docker load -i ${imageArchiveName}\`
2. Copy \`.env.bundle\` to \`.env\` and set real passwords/secrets.
3. Start the stack:
   - \`docker compose --env-file .env -f docker-compose.airgap.yml up -d\`
4. If you are also importing a packaged DB snapshot onto a brand-new MySQL volume, place \`mysql_jbhub.sql\` next to the compose files and start with:
   - \`docker compose --env-file .env -f docker-compose.airgap.yml -f docker-compose.airgap.restore.yml up -d\`
5. If you need JB-Hub's internal Docker upload/build/deploy features, add the Docker socket override:
   - \`docker compose --env-file .env -f docker-compose.airgap.yml -f docker-compose.airgap.docker-features.yml up -d\`

${adminerNote}

The restore override only runs on the first startup of an empty MySQL volume.

Default endpoints after startup:

- Web: \`http://<host>:8080\`
- API: \`http://<host>:8787/api/v1/health\`
- MySQL: \`<host>:3310\`
- Adminer: \`http://<host>:8081\` (only when the ops profile is enabled)

Bundle directory: \`${bundleDirName}\`
`
}

const options = parseCliArgs(process.argv.slice(2))

if (options.help) {
  process.stdout.write(`${HELP_TEXT}\n`)
  process.exit(0)
}

const stackName = slugifyName(options.name)
const outputDir = path.resolve(
  process.cwd(),
  options.outputDir ?? path.join('artifacts', `${stackName}-airgap-stack-${toDateStamp()}`),
)
const webImage = `${stackName}-web:airgap`
const apiImage = `${stackName}-api:airgap`
const mysqlImage = 'mysql:8.4'
const adminerImage = 'adminer:4'
const imageTags = options.skipAdminer ? [webImage, apiImage, mysqlImage] : [webImage, apiImage, mysqlImage, adminerImage]
const imageArchivePath = path.join(outputDir, resolveImageArchiveName(options.imageArchiveFormat))

await fs.promises.mkdir(outputDir, { recursive: true })

await runCommand('docker', ['version'], { dryRun: options.dryRun })
await runCommand('docker', ['buildx', 'version'], { dryRun: options.dryRun })
await runCommand('docker', buildBuildxArgs(webImage, 'Dockerfile.web', options.platform), { dryRun: options.dryRun })
await runCommand('docker', buildBuildxArgs(apiImage, 'Dockerfile.api', options.platform), { dryRun: options.dryRun })
await runCommand('docker', ['pull', mysqlImage], { dryRun: options.dryRun })
if (!options.skipAdminer) {
  await runCommand('docker', ['pull', adminerImage], { dryRun: options.dryRun })
}

await saveBundleArchive(imageTags, imageArchivePath, options.dryRun)

if (!options.dryRun) {
  await fs.promises.copyFile(path.join(process.cwd(), 'docker-compose.airgap.yml'), path.join(outputDir, 'docker-compose.airgap.yml'))
  await fs.promises.copyFile(
    path.join(process.cwd(), 'docker-compose.airgap.docker-features.yml'),
    path.join(outputDir, 'docker-compose.airgap.docker-features.yml'),
  )
  await fs.promises.copyFile(
    path.join(process.cwd(), 'docker-compose.airgap.restore.yml'),
    path.join(outputDir, 'docker-compose.airgap.restore.yml'),
  )
  await fs.promises.copyFile(path.join(process.cwd(), '.env.airgap.example'), path.join(outputDir, '.env.airgap.example'))
  await fs.promises.writeFile(
    path.join(outputDir, '.env.bundle'),
    buildBundleEnvText({
      stackName,
      webImage,
      apiImage,
      mysqlImage,
      adminerImage,
    }),
    'utf8',
  )
  await fs.promises.writeFile(
    path.join(outputDir, 'IMPORT.md'),
    buildImportGuide({
      bundleDirName: path.basename(outputDir),
      imageArchiveName: path.basename(imageArchivePath),
      includeAdminer: !options.skipAdminer,
    }),
    'utf8',
  )
}

if (options.dryRun) {
  process.stdout.write('[airgap] Dry run completed.\n')
  process.exit(0)
}

const outputStat = await fs.promises.stat(imageArchivePath)
process.stdout.write(`[airgap] Bundle completed: ${imageArchivePath} (${outputStat.size} bytes)\n`)
process.stdout.write(`[airgap] Compose package written to: ${outputDir}\n`)
