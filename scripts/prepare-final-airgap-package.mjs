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
  --skip-db-dump          Build the package without exporting the current database
  --refresh-bundle        Rebuild the source air-gap bundle before packaging
  --help                  Show this help
`.trim()

const REQUIRED_BUNDLE_FILES = [
  'images.tar.gz',
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

function parseCliArgs(argv) {
  const options = {
    bundleDir: path.join('.runtime', 'airgap-bundle-final'),
    outputDir: 'final',
    packageName: 'jbhub-airgap-package.tar.gz',
    dbContainer: 'jbhub-mysql',
    dbDumpName: 'mysql_jbhub.sql',
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

  if (!options.packageName.endsWith('.tar.gz')) {
    options.packageName = `${options.packageName}.tar.gz`
  }

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

async function directoryContainsRequiredFiles(directoryPath) {
  for (const fileName of REQUIRED_BUNDLE_FILES) {
    if (!(await fileExists(path.join(directoryPath, fileName)))) {
      return false
    }
  }

  return true
}

async function ensureBundleReady(bundleDir, refreshBundle) {
  const hasBundle = await directoryContainsRequiredFiles(bundleDir)
  if (hasBundle && !refreshBundle) {
    return
  }

  await fs.promises.mkdir(bundleDir, { recursive: true })
  await runCommand('node', ['scripts/build-airgap-stack-bundle.mjs', '--output-dir', bundleDir])
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

function buildImportGuide({ archiveName, dbDumpName, includeDbDump }) {
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

- \`images.tar.gz\`: Docker image archive for web, api, mysql, adminer
- \`docker-compose.airgap.yml\`: base stack definition
- \`docker-compose.airgap.docker-features.yml\`: optional Docker socket override
- \`docker-compose.airgap.restore.yml\`: optional first-boot DB restore override
- \`.env.bundle\`: environment template with the exact image tags from this build
${includeDbDump ? `- \`${dbDumpName}\`: SQL dump of the current JB-Hub database\n` : ''}- \`${archiveName}\`: single-file package of this directory

## Import

1. Extract \`${archiveName}\`.
2. Load images:
   - \`docker load -i images.tar.gz\`
3. Copy \`.env.bundle\` to \`.env\` and replace all default passwords and secrets.
${restoreSection}
Default endpoints after startup:

- Web: \`http://<host>:8080\`
- API: \`http://<host>:8787/api/v1/health\`
- MySQL: \`<host>:3310\`
- Adminer: \`http://<host>:8081\` when the ops profile is enabled
`
}

async function copyRequiredFiles(bundleDir, outputDir) {
  for (const fileName of REQUIRED_BUNDLE_FILES) {
    await fs.promises.copyFile(path.join(bundleDir, fileName), path.join(outputDir, fileName))
  }
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

  await ensureBundleReady(bundleDir, options.refreshBundle)

  if (!(await directoryContainsRequiredFiles(bundleDir))) {
    fail(`Bundle directory is incomplete: ${bundleDir}`)
  }

  await fs.promises.rm(outputDir, { recursive: true, force: true })
  await fs.promises.mkdir(outputDir, { recursive: true })

  await copyRequiredFiles(bundleDir, outputDir)

  if (!options.skipDbDump) {
    await exportDatabaseDump({
      containerName: options.dbContainer,
      dumpPath,
    })
  }

  const packageEntries = [...REQUIRED_BUNDLE_FILES]
  if (!options.skipDbDump) {
    packageEntries.push(options.dbDumpName)
  }

  await fs.promises.writeFile(
    path.join(outputDir, 'IMPORT.md'),
    buildImportGuide({
      archiveName: options.packageName,
      dbDumpName: options.dbDumpName,
      includeDbDump: !options.skipDbDump,
    }),
    'utf8',
  )
  packageEntries.push('IMPORT.md')

  await runCommand('tar', ['-czf', options.packageName, ...packageEntries], {
    cwd: outputDir,
  })

  const archiveStat = await fs.promises.stat(archivePath)
  process.stdout.write(`[final-airgap] Final package ready: ${archivePath} (${archiveStat.size} bytes)\n`)
}

await main()
