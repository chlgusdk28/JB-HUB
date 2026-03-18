import fs from 'node:fs'
import path from 'node:path'
import { createGzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { isWindowsUncWorkingDir, spawnInWorkingDir } from './spawn-in-working-dir.mjs'

const HELP_TEXT = `
Build a frontend/backend Docker bundle for JB-Hub upload.

Usage:
  node scripts/build-docker-bundle.mjs --name smartseat --context C:\\path\\to\\repo \\
    --frontend-dockerfile Dockerfile.frontend \\
    --backend-dockerfile Dockerfile.backend

  npm run docker:bundle -- --name smartseat --frontend-context ./frontend --backend-context ./backend

Required:
  --frontend-context <path>   Frontend build context path
  --backend-context <path>    Backend build context path

Shared shortcuts:
  --context <path>            Use the same context path for frontend and backend
  --name <name>               Base name for image tags and output file (default: app)
  --platform <value>          Docker build platform (default: linux/amd64)
  --output <file>             Bundle file path (default: <name>-docker-images-YYYYMMDD.tar.gz)

Optional frontend flags:
  --frontend-dockerfile <path>
  --frontend-image <name:tag>
  --frontend-build-arg KEY=VALUE
  --frontend-target <stage>

Optional backend flags:
  --backend-dockerfile <path>
  --backend-image <name:tag>
  --backend-build-arg KEY=VALUE
  --backend-target <stage>

Shared build flags:
  --build-arg KEY=VALUE       Applied to both frontend and backend
  --dry-run                   Validate inputs and print commands only
  --help                      Show this help

Examples:
  npm run docker:bundle -- --name smartseat --context C:\\Users\\Hyeona\\Desktop\\smartSeat_deploy\\smartSeat_deploy \\
    --frontend-dockerfile Dockerfile.frontend \\
    --backend-dockerfile Dockerfile.backend

  npm run docker:bundle -- --name demo --frontend-context ./frontend --backend-context ./backend \\
    --frontend-build-arg VITE_API_BASE=/api \\
    --backend-build-arg NODE_ENV=production
`.trim()

function fail(message) {
  process.stderr.write(`[bundle] ${message}\n`)
  process.exit(1)
}

function slugifyName(value) {
  const normalized = String(value || 'app')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || 'app'
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
    name: 'app',
    platform: 'linux/amd64',
    buildArgs: [],
    frontendBuildArgs: [],
    backendBuildArgs: [],
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
      case '--name':
        options.name = takeValue(argv, index, argument)
        index += 1
        break
      case '--context':
        options.context = takeValue(argv, index, argument)
        index += 1
        break
      case '--frontend-context':
        options.frontendContext = takeValue(argv, index, argument)
        index += 1
        break
      case '--backend-context':
        options.backendContext = takeValue(argv, index, argument)
        index += 1
        break
      case '--frontend-dockerfile':
        options.frontendDockerfile = takeValue(argv, index, argument)
        index += 1
        break
      case '--backend-dockerfile':
        options.backendDockerfile = takeValue(argv, index, argument)
        index += 1
        break
      case '--frontend-image':
        options.frontendImage = takeValue(argv, index, argument)
        index += 1
        break
      case '--backend-image':
        options.backendImage = takeValue(argv, index, argument)
        index += 1
        break
      case '--platform':
        options.platform = takeValue(argv, index, argument)
        index += 1
        break
      case '--output':
        options.output = takeValue(argv, index, argument)
        index += 1
        break
      case '--build-arg':
        options.buildArgs.push(takeValue(argv, index, argument))
        index += 1
        break
      case '--frontend-build-arg':
        options.frontendBuildArgs.push(takeValue(argv, index, argument))
        index += 1
        break
      case '--backend-build-arg':
        options.backendBuildArgs.push(takeValue(argv, index, argument))
        index += 1
        break
      case '--frontend-target':
        options.frontendTarget = takeValue(argv, index, argument)
        index += 1
        break
      case '--backend-target':
        options.backendTarget = takeValue(argv, index, argument)
        index += 1
        break
      default:
        fail(`Unknown option: ${argument}`)
    }
  }

  return options
}

function resolvePathFromCwd(inputPath) {
  return path.isAbsolute(inputPath) ? path.normalize(inputPath) : path.resolve(process.cwd(), inputPath)
}

function toCliPath(inputPath) {
  if (!path.isAbsolute(inputPath)) {
    return inputPath
  }

  if (!isWindowsUncWorkingDir()) {
    return inputPath
  }

  const relativePath = path.relative(process.cwd(), inputPath)
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return inputPath
  }

  return relativePath
}

function buildDockerfileArg(contextInput, dockerfileInput) {
  if (dockerfileInput) {
    return path.isAbsolute(dockerfileInput) ? path.normalize(dockerfileInput) : path.join(contextInput, dockerfileInput)
  }

  return path.join(contextInput, 'Dockerfile')
}

function validateBuildArg(serviceName, rawValue) {
  if (!String(rawValue).includes('=')) {
    fail(`${serviceName} build arg must use KEY=VALUE format: ${rawValue}`)
  }
}

function createServiceConfig(serviceName, options) {
  const contextInput =
    serviceName === 'frontend'
      ? options.frontendContext ?? options.context
      : options.backendContext ?? options.context

  if (!contextInput) {
    fail(`Missing --${serviceName}-context or shared --context`)
  }

  const dockerfileInput = serviceName === 'frontend' ? options.frontendDockerfile : options.backendDockerfile
  const dockerfileArg = buildDockerfileArg(contextInput, dockerfileInput)
  const contextPath = resolvePathFromCwd(contextInput)
  const dockerfilePath = resolvePathFromCwd(dockerfileArg)
  const contextCliArg = path.isAbsolute(contextInput) ? toCliPath(contextPath) : contextInput
  const dockerfileCliArg = path.isAbsolute(dockerfileArg) ? toCliPath(dockerfilePath) : dockerfileArg
  const buildArgs = [
    ...options.buildArgs,
    ...(serviceName === 'frontend' ? options.frontendBuildArgs : options.backendBuildArgs),
  ]

  for (const buildArg of buildArgs) {
    validateBuildArg(serviceName, buildArg)
  }

  const imageTag =
    serviceName === 'frontend'
      ? options.frontendImage ?? `${slugifyName(options.name)}-frontend:latest`
      : options.backendImage ?? `${slugifyName(options.name)}-backend:latest`

  return {
    serviceName,
    contextInput,
    contextPath,
    dockerfileArg,
    dockerfilePath,
    contextCliArg,
    dockerfileCliArg,
    imageTag,
    target: serviceName === 'frontend' ? options.frontendTarget : options.backendTarget,
    buildArgs,
  }
}

function ensureExistingPath(filePath, description) {
  if (!fs.existsSync(filePath)) {
    fail(`${description} not found: ${filePath}`)
  }
}

function printCommand(command, args) {
  process.stdout.write(`[bundle] ${command} ${args.join(' ')}\n`)
}

async function runCommand(command, args, { dryRun = false, capture = false } = {}) {
  printCommand(command, args)

  if (dryRun) {
    return { stdout: '', stderr: '' }
  }

  const child = spawnInWorkingDir(command, args, {
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  })

  if (!capture) {
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

    return { stdout: '', stderr: '' }
  }

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

      reject(new Error(stderr.trim() || stdout.trim() || `${command} exited with code ${code ?? 1}`))
    })
  })

  return { stdout, stderr }
}

function buildBuildxArgs(serviceConfig, platform) {
  const args = [
    'buildx',
    'build',
    '--platform',
    platform,
    '-t',
    serviceConfig.imageTag,
    '-f',
    serviceConfig.dockerfileCliArg,
  ]

  if (serviceConfig.target) {
    args.push('--target', serviceConfig.target)
  }

  for (const buildArg of serviceConfig.buildArgs) {
    args.push('--build-arg', buildArg)
  }

  args.push('--load', serviceConfig.contextCliArg)

  return args
}

async function saveBundleArchive(imageTags, outputPath, dryRun) {
  const isGzipOutput = outputPath.toLowerCase().endsWith('.gz')
  const dockerSavePath = isGzipOutput ? `${outputPath}.tmp.tar` : outputPath
  const dockerSaveCliPath = toCliPath(dockerSavePath)
  printCommand('docker', ['save', '-o', dockerSaveCliPath, ...imageTags])

  if (dryRun) {
    return
  }

  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true })

  try {
    await runCommand('docker', ['save', '-o', dockerSaveCliPath, ...imageTags])

    if (isGzipOutput) {
      await pipeline(fs.createReadStream(dockerSavePath), createGzip({ level: 9 }), fs.createWriteStream(outputPath))
      await fs.promises.rm(dockerSavePath, { force: true })
    }
  } catch (error) {
    await fs.promises.rm(outputPath, { force: true }).catch(() => {})
    if (isGzipOutput) {
      await fs.promises.rm(dockerSavePath, { force: true }).catch(() => {})
    }
    throw error
  }
}

const options = parseCliArgs(process.argv.slice(2))

if (options.help) {
  process.stdout.write(`${HELP_TEXT}\n`)
  process.exit(0)
}

const frontend = createServiceConfig('frontend', options)
const backend = createServiceConfig('backend', options)
const outputFile = options.output ?? `${slugifyName(options.name)}-docker-images-${toDateStamp()}.tar.gz`
const outputPath = resolvePathFromCwd(outputFile)

ensureExistingPath(frontend.contextPath, 'Frontend context')
ensureExistingPath(backend.contextPath, 'Backend context')
ensureExistingPath(frontend.dockerfilePath, 'Frontend Dockerfile')
ensureExistingPath(backend.dockerfilePath, 'Backend Dockerfile')

if (frontend.imageTag === backend.imageTag) {
  fail('Frontend and backend image tags must be different')
}

await runCommand('docker', ['version'], { dryRun: options.dryRun })
await runCommand('docker', ['buildx', 'version'], { dryRun: options.dryRun, capture: !options.dryRun })

process.stdout.write(`[bundle] Frontend image: ${frontend.imageTag}\n`)
process.stdout.write(`[bundle] Backend image: ${backend.imageTag}\n`)
process.stdout.write(`[bundle] Output: ${outputPath}\n`)

await runCommand('docker', buildBuildxArgs(frontend, options.platform), { dryRun: options.dryRun })
await runCommand('docker', buildBuildxArgs(backend, options.platform), { dryRun: options.dryRun })
await saveBundleArchive([frontend.imageTag, backend.imageTag], outputPath, options.dryRun)

if (options.dryRun) {
  process.stdout.write('[bundle] Dry run completed.\n')
  process.exit(0)
}

const outputStat = await fs.promises.stat(outputPath)
process.stdout.write(`[bundle] Bundle completed: ${outputPath} (${outputStat.size} bytes)\n`)
process.stdout.write('[bundle] Upload the generated tar/tar.gz file in the project Docker tab.\n')
