import fs from 'node:fs'
import path from 'node:path'
import { spawnInWorkingDir } from './spawn-in-working-dir.mjs'

const HELP_TEXT = `
Prepare the final closed-network import package for JB-Hub.

Usage:
  node scripts/prepare-final-airgap-package.mjs
  node scripts/prepare-final-airgap-package.mjs --refresh-bundle
  node scripts/prepare-final-airgap-package.mjs --bundle-dir .runtime/airgap-bundle-test --output-dir ./final

Options:
  --bundle-dir <path>     Source air-gap bundle directory
  --output-dir <path>     Output directory for the final import set (default: ./final)
  --package-name <name>   Final archive name (default: jbhub-airgap-package.tar.gz)
  --db-container <name>   Running MySQL container to dump (default: jbhub-mysql)
  --db-dump-name <name>   SQL dump filename in the package (default: mysql_jbhub.sql)
  --image-archive-format <value>
                         Image archive format: tar.gz or tar (default: tar.gz)
  --package-format <value>
                         Final package format: tar.gz or tar (default: tar.gz)
  --minimal               Package only the image archive and a single docker-compose.yml
  --skip-db-dump          Build the package without exporting the current database
  --refresh-bundle        Rebuild the source air-gap bundle before packaging
  --help                  Show this help
`.trim()

const STATIC_REQUIRED_BUNDLE_FILES = [
  'docker-compose.airgap.yml',
  'docker-compose.airgap.docker-features.yml',
  'docker-compose.airgap.restore.yml',
  '.env.bundle',
]

function fail(message) {
  process.stderr.write(`[final-airgap] ${message}\n`)
  process.exit(1)
}

function takeValue(args, index, flagName) {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) {
    fail(`Missing value for ${flagName}`)
  }

  return value
}

function isSupportedArchiveFormat(value) {
  return value === 'tar.gz' || value === 'tar'
}

function resolveImageArchiveName(format) {
  return format === 'tar' ? 'images.tar' : 'images.tar.gz'
}

function normalizePackageName(name, format) {
  const normalized = String(name || '').trim() || (format === 'tar' ? 'jbhub-airgap-package.tar' : 'jbhub-airgap-package.tar.gz')

  if (format === 'tar') {
    return normalized.endsWith('.tar') ? normalized : `${normalized.replace(/\.tar\.gz$/u, '').replace(/\.gz$/u, '')}.tar`
  }

  return normalized.endsWith('.tar.gz') ? normalized : `${normalized.replace(/\.tar$/u, '')}.tar.gz`
}

function getRequiredBundleFiles(imageArchiveFormat) {
  return [resolveImageArchiveName(imageArchiveFormat), ...STATIC_REQUIRED_BUNDLE_FILES]
}

function parseCliArgs(argv) {
  const options = {
    bundleDir: path.join('.runtime', 'airgap-bundle-final'),
    outputDir: 'final',
    packageName: 'jbhub-airgap-package.tar.gz',
    dbContainer: 'jbhub-mysql',
    dbDumpName: 'mysql_jbhub.sql',
    imageArchiveFormat: 'tar.gz',
    packageFormat: 'tar.gz',
    minimal: false,
    skipDbDump: false,
    refreshBundle: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    switch (argument) {
      case '--help':
        options.help = true
        break
      case '--bundle-dir':
        options.bundleDir = takeValue(argv, index, argument)
        index += 1
        break
      case '--output-dir':
        options.outputDir = takeValue(argv, index, argument)
        index += 1
        break
      case '--package-name':
        options.packageName = takeValue(argv, index, argument)
        index += 1
        break
      case '--db-container':
        options.dbContainer = takeValue(argv, index, argument)
        index += 1
        break
      case '--db-dump-name':
        options.dbDumpName = takeValue(argv, index, argument)
        index += 1
        break
      case '--image-archive-format':
        options.imageArchiveFormat = takeValue(argv, index, argument)
        index += 1
        break
      case '--package-format':
        options.packageFormat = takeValue(argv, index, argument)
        index += 1
        break
      case '--minimal':
        options.minimal = true
        break
      case '--skip-db-dump':
        options.skipDbDump = true
        break
      case '--refresh-bundle':
        options.refreshBundle = true
        break
      default:
        fail(`Unknown option: ${argument}`)
    }
  }

  if (!isSupportedArchiveFormat(options.imageArchiveFormat)) {
    fail(`Unsupported image archive format: ${options.imageArchiveFormat}`)
  }

  if (!isSupportedArchiveFormat(options.packageFormat)) {
    fail(`Unsupported package format: ${options.packageFormat}`)
  }

  if (options.minimal && !options.skipDbDump) {
    fail('`--minimal` requires `--skip-db-dump` because the restore override is omitted in minimal mode.')
  }

  options.packageName = normalizePackageName(options.packageName, options.packageFormat)

  return options
}

function printCommand(command, args) {
  process.stdout.write(`[final-airgap] ${command} ${args.join(' ')}\n`)
}

async function runCommand(command, args, { cwd = process.cwd(), stdoutFilePath = null } = {}) {
  printCommand(command, args)

  const child = spawnInWorkingDir(command, args, {
    cwd,
    stdio: ['ignore', stdoutFilePath ? 'pipe' : 'inherit', 'inherit'],
  })

  const stdoutStream = stdoutFilePath ? fs.createWriteStream(stdoutFilePath) : null

  if (stdoutStream && child.stdout) {
    child.stdout.pipe(stdoutStream)
  }

  await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (code) => {
      if (stdoutStream) {
        stdoutStream.end()
      }

      if ((code ?? 0) === 0) {
        resolve()
        return
      }

      reject(new Error(`${command} exited with code ${code ?? 1}`))
    })
  })
}

async function readCommand(command, args, { cwd = process.cwd() } = {}) {
  printCommand(command, args)

  const child = spawnInWorkingDir(command, args, {
    cwd,
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

  await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (code) => {
      if ((code ?? 0) === 0) {
        resolve()
        return
      }

      reject(new Error(stderr.trim() || `${command} exited with code ${code ?? 1}`))
    })
  })

  return stdout
}

async function fileExists(filePath) {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function directoryContainsRequiredFiles(directoryPath, imageArchiveFormat) {
  for (const fileName of getRequiredBundleFiles(imageArchiveFormat)) {
    if (!(await fileExists(path.join(directoryPath, fileName)))) {
      return false
    }
  }

  return true
}

async function ensureBundleReady(bundleDir, refreshBundle, imageArchiveFormat) {
  const hasBundle = await directoryContainsRequiredFiles(bundleDir, imageArchiveFormat)
  if (hasBundle && !refreshBundle) {
    return
  }

  await fs.promises.mkdir(bundleDir, { recursive: true })
  const buildArgs = [
    'scripts/build-airgap-stack-bundle.mjs',
    '--output-dir',
    bundleDir,
    '--image-archive-format',
    imageArchiveFormat,
  ]

  if (refreshBundle?.skipAdminer) {
    buildArgs.push('--skip-adminer')
  }

  await runCommand('node', buildArgs)
}

function parseEnvLines(text) {
  const result = new Map()
  const lines = text.split(/\r?\n/u)

  for (const line of lines) {
    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    result.set(line.slice(0, separatorIndex), line.slice(separatorIndex + 1))
  }

  return result
}

async function loadBundleEnvMap(bundleDir) {
  const envText = await fs.promises.readFile(path.join(bundleDir, '.env.bundle'), 'utf8')
  return parseEnvLines(envText)
}

async function inspectMySqlContainer(containerName) {
  const inspectJson = await readCommand('docker', ['inspect', containerName])

  let inspectData = []

  try {
    inspectData = JSON.parse(inspectJson)
  } catch (error) {
    fail(`Failed to parse docker inspect output for ${containerName}: ${error instanceof Error ? error.message : String(error)}`)
  }

  const envValues = inspectData[0]?.Config?.Env
  if (!Array.isArray(envValues)) {
    fail(`Container ${containerName} does not expose Config.Env`)
  }

  const envMap = parseEnvLines(envValues.join('\n'))
  const rootPassword = envMap.get('MYSQL_ROOT_PASSWORD')
  const databaseName = envMap.get('MYSQL_DATABASE') || 'jbhub'

  if (!rootPassword) {
    fail(`Container ${containerName} does not expose MYSQL_ROOT_PASSWORD`)
  }

  return {
    rootPassword,
    databaseName,
  }
}

async function exportDatabaseDump({ containerName, dumpPath }) {
  const { rootPassword, databaseName } = await inspectMySqlContainer(containerName)

  await runCommand(
    'docker',
    [
      'exec',
      containerName,
      'mysqldump',
      '-uroot',
      `-p${rootPassword}`,
      '--single-transaction',
      '--quick',
      '--routines',
      '--triggers',
      '--set-gtid-purged=OFF',
      databaseName,
    ],
    {
      stdoutFilePath: dumpPath,
    },
  )
}

function buildImportGuide({ archiveName, dbDumpName, includeDbDump, imageArchiveName }) {
  const restoreSection = includeDbDump
    ? `4. To bootstrap the current DB snapshot on the first startup of a new MySQL volume:
   - \`docker compose --env-file .env -f docker-compose.airgap.yml -f docker-compose.airgap.restore.yml up -d\`
5. If you also need JB-Hub's in-app Docker upload/build/deploy features:
   - \`docker compose --env-file .env -f docker-compose.airgap.yml -f docker-compose.airgap.restore.yml -f docker-compose.airgap.docker-features.yml up -d\`

Restore notes:

- The restore override reads \`${dbDumpName}\` through \`docker-entrypoint-initdb.d\`, so it only runs when the MySQL data volume is empty.
- If you need to rerun the restore on the same host, stop the stack and remove the MySQL volume first:
  - \`docker compose --env-file .env -f docker-compose.airgap.yml down -v\`
`
    : `4. If you need JB-Hub's in-app Docker upload/build/deploy features:
   - \`docker compose --env-file .env -f docker-compose.airgap.yml -f docker-compose.airgap.docker-features.yml up -d\`
`

  return `# JB-Hub Closed-Network Import Package

This directory is the final handoff set for an offline Docker host.

## Files

- \`${imageArchiveName}\`: Docker image archive for web, api, mysql, adminer
- \`docker-compose.airgap.yml\`: base stack definition
- \`docker-compose.airgap.docker-features.yml\`: optional Docker socket override
- \`docker-compose.airgap.restore.yml\`: optional first-boot DB restore override
- \`.env.bundle\`: environment template with the exact image tags from this build
${includeDbDump ? `- \`${dbDumpName}\`: SQL dump of the current JB-Hub database\n` : ''}- \`${archiveName}\`: single-file package of this directory

## Import

1. Extract \`${archiveName}\`.
2. Load images:
   - \`docker load -i ${imageArchiveName}\`
3. Copy \`.env.bundle\` to \`.env\` and replace all default passwords and secrets.
${restoreSection}
Default endpoints after startup:

- Web: \`http://<host>:8080\`
- API: \`http://<host>:8787/api/v1/health\`
- MySQL: \`<host>:3310\`
- Adminer: \`http://<host>:8081\` when the ops profile is enabled
`
}

async function copyRequiredFiles(bundleDir, outputDir, imageArchiveFormat) {
  for (const fileName of getRequiredBundleFiles(imageArchiveFormat)) {
    await fs.promises.copyFile(path.join(bundleDir, fileName), path.join(outputDir, fileName))
  }
}

function buildMinimalComposeText(bundleEnv) {
  const webImage = bundleEnv.get('JBHUB_WEB_IMAGE') || 'jbhub-web:airgap'
  const apiImage = bundleEnv.get('JBHUB_API_IMAGE') || 'jbhub-api:airgap'
  const mysqlImage = bundleEnv.get('JBHUB_MYSQL_IMAGE') || 'mysql:8.4'

  return `services:
  mysql:
    image: ${mysqlImage}
    container_name: jbhub-mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: jbhub-root-password-2026
      MYSQL_DATABASE: jbhub
      MYSQL_USER: jbhub
      MYSQL_PASSWORD: jbhub-app-password-2026
      TZ: Asia/Seoul
    ports:
      - "3310:3306"
    volumes:
      - jbhub_mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD-SHELL", "mysqladmin ping -h 127.0.0.1 -uroot -p$$MYSQL_ROOT_PASSWORD --silent"]
      interval: 5s
      timeout: 3s
      retries: 30

  api:
    image: ${apiImage}
    container_name: jbhub-api
    restart: unless-stopped
    depends_on:
      mysql:
        condition: service_healthy
    environment:
      API_PORT: 8787
      DB_HOST: mysql
      DB_PORT: 3306
      DB_USER: jbhub
      DB_PASSWORD: jbhub-app-password-2026
      DB_NAME: jbhub
      DB_CONN_LIMIT: 10
      DB_SEED: false
      DB_CONNECT_RETRY_ATTEMPTS: 40
      DB_CONNECT_RETRY_DELAY_MS: 2000
      APP_PRODUCT_MODE: signup
      API_RATE_LIMIT_WINDOW_MS: 60000
      API_RATE_LIMIT_MAX_REQUESTS: 240
      API_JWT_HS256_SECRET: jbhub-airgap-jwt-secret-2026-keep-private
      API_JWT_ISSUER: jbhub-api
      API_JWT_AUDIENCE: jbhub-client
      JWT_ACCESS_TOKEN_EXPIRATION: 86400
      JWT_REFRESH_TOKEN_EXPIRATION: 604800
      ADMIN_DEFAULT_USERNAME: jbhub-admin
      ADMIN_DEFAULT_PASSWORD: jbhub-admin-password-2026
      ADMIN_DEFAULT_EMAIL: admin@jbhub.local
      ADMIN_SESSION_TIMEOUT_MS: 3600000
      ADMIN_MAX_LOGIN_ATTEMPTS: 5
      ADMIN_LOCKOUT_DURATION_MS: 900000
      AUTH_STATE_CLEANUP_INTERVAL_MS: 300000
      AUDIT_LOG_ENABLED: true
      AUDIT_LOG_RETENTION_DAYS: 90
      CORS_ALLOWED_ORIGINS:
      TZ: Asia/Seoul
    ports:
      - "8787:8787"
    volumes:
      - jbhub_project_files:/app/project-files
      - jbhub_docker_uploads:/app/docker-uploads
      - jbhub_docker_temp:/app/docker-temp
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:8787/api/v1/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]
      interval: 15s
      timeout: 5s
      retries: 10
      start_period: 20s

  web:
    image: ${webImage}
    container_name: jbhub-web
    restart: unless-stopped
    depends_on:
      api:
        condition: service_healthy
    ports:
      - "8080:8080"
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]
      interval: 15s
      timeout: 5s
      retries: 10
      start_period: 10s

volumes:
  jbhub_mysql_data:
  jbhub_project_files:
  jbhub_docker_uploads:
  jbhub_docker_temp:
`
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2))

  if (options.help) {
    process.stdout.write(`${HELP_TEXT}\n`)
    process.exit(0)
  }

  const bundleDir = path.resolve(process.cwd(), options.bundleDir)
  const outputDir = path.resolve(process.cwd(), options.outputDir)
  const dumpPath = path.join(outputDir, options.dbDumpName)
  const archivePath = path.join(outputDir, options.packageName)
  const imageArchiveName = resolveImageArchiveName(options.imageArchiveFormat)
  const ensureBundleOptions = {
    skipAdminer: options.minimal,
  }

  await ensureBundleReady(bundleDir, options.refreshBundle || ensureBundleOptions.skipAdminer ? ensureBundleOptions : false, options.imageArchiveFormat)

  if (!(await directoryContainsRequiredFiles(bundleDir, options.imageArchiveFormat))) {
    fail(`Bundle directory is incomplete: ${bundleDir}`)
  }

  await fs.promises.rm(outputDir, { recursive: true, force: true })
  await fs.promises.mkdir(outputDir, { recursive: true })

  let packageEntries = []

  if (options.minimal) {
    await fs.promises.copyFile(path.join(bundleDir, imageArchiveName), path.join(outputDir, imageArchiveName))
    const bundleEnv = await loadBundleEnvMap(bundleDir)
    await fs.promises.writeFile(path.join(outputDir, 'docker-compose.yml'), buildMinimalComposeText(bundleEnv), 'utf8')
    packageEntries = [imageArchiveName, 'docker-compose.yml']
  } else {
    await copyRequiredFiles(bundleDir, outputDir, options.imageArchiveFormat)
    packageEntries = [...getRequiredBundleFiles(options.imageArchiveFormat)]
  }

  if (!options.skipDbDump) {
    await exportDatabaseDump({
      containerName: options.dbContainer,
      dumpPath,
    })
    packageEntries.push(options.dbDumpName)
  }

  if (!options.minimal) {
    await fs.promises.writeFile(
      path.join(outputDir, 'IMPORT.md'),
      buildImportGuide({
        archiveName: options.packageName,
        dbDumpName: options.dbDumpName,
        includeDbDump: !options.skipDbDump,
        imageArchiveName,
      }),
      'utf8',
    )
    packageEntries.push('IMPORT.md')
  }

  await runCommand('tar', [options.packageFormat === 'tar' ? '-cf' : '-czf', options.packageName, ...packageEntries], {
    cwd: outputDir,
  })

  const archiveStat = await fs.promises.stat(archivePath)
  process.stdout.write(`[final-airgap] Final package ready: ${archivePath} (${archiveStat.size} bytes)\n`)
}

await main()
