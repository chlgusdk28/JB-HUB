import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { getContainerRuntimeConfig } from '../server/container-runtime.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const artifactsDir = path.join(rootDir, 'artifacts')
const bundleDate = (process.env.APPLIANCE_BUNDLE_DATE ?? new Date().toISOString().slice(0, 10)).replace(/-/g, '')
const bundleName = `jbhub-appliance-${bundleDate}`
const bundleRoot = path.join(artifactsDir, bundleName)
const appRoot = path.join(bundleRoot, 'app')
const imagesRoot = path.join(bundleRoot, 'images')
const runtimeRoot = path.join(bundleRoot, 'runtime')
const deploymentRoot = path.join(bundleRoot, 'deployment')
const runtimeConfig = getContainerRuntimeConfig()
const includeNodeModules = process.env.APPLIANCE_INCLUDE_NODE_MODULES === '1'
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const shouldUseShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command)
    const child = shouldUseShell
      ? spawn(
          process.env.ComSpec || 'cmd.exe',
          [
            '/d',
            '/s',
            '/c',
            `${command} ${args.map((entry) => String(entry)).join(' ')}`,
          ],
          {
            cwd: rootDir,
            stdio: 'inherit',
            shell: false,
            ...options,
          },
        )
      : spawn(command, args, {
          cwd: rootDir,
          stdio: 'inherit',
          shell: false,
          ...options,
        })

    child.on('error', reject)
    child.on('close', (code) => {
      if ((code ?? 1) === 0) {
        resolve()
        return
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 1}`))
    })
  })
}

async function ensureCleanDirectory(targetPath) {
  await fs.rm(targetPath, { recursive: true, force: true })
  await fs.mkdir(targetPath, { recursive: true })
}

async function copyIntoBundle(sourceRelativePath, destinationRelativePath) {
  const sourcePath = path.join(rootDir, sourceRelativePath)
  if (!existsSync(sourcePath)) {
    throw new Error(`Required bundle source is missing: ${sourceRelativePath}`)
  }

  const destinationPath = path.join(bundleRoot, destinationRelativePath)
  await fs.mkdir(path.dirname(destinationPath), { recursive: true })
  await fs.cp(sourcePath, destinationPath, { recursive: true, force: true })
}

function getArchiveSuffix(fileName) {
  const normalized = String(fileName ?? '').toLowerCase()
  const knownSuffixes = ['.tar.gz', '.tar.xz', '.tar.bz2', '.tgz', '.zip', '.tar']
  return knownSuffixes.find((suffix) => normalized.endsWith(suffix)) ?? path.extname(fileName)
}

function getCanonicalArchiveFileName(envName, fileName) {
  const suffix = getArchiveSuffix(fileName) || ''
  const names = {
    APPLIANCE_IMAGE_ARCHIVE: `appliance-image-archive${suffix}`,
    APPLIANCE_RUNTIME_ARCHIVE: `appliance-runtime-archive${suffix}`,
    APPLIANCE_NODE_ARCHIVE: `appliance-node-archive${suffix}`,
  }

  return names[envName] ?? fileName
}

async function copyOptionalArchive(envName, destinationDir, copiedArtifacts) {
  const rawPath = String(process.env[envName] ?? '').trim()
  if (!rawPath) {
    return null
  }

  const sourcePath = path.isAbsolute(rawPath) ? rawPath : path.join(rootDir, rawPath)
  if (!existsSync(sourcePath)) {
    throw new Error(`${envName} points to a missing file: ${sourcePath}`)
  }

  await fs.mkdir(destinationDir, { recursive: true })
  const fileName = path.basename(sourcePath)
  const canonicalFileName = getCanonicalArchiveFileName(envName, fileName)
  const destinationPath = path.join(destinationDir, canonicalFileName)
  await fs.cp(sourcePath, destinationPath, { force: true })
  copiedArtifacts.push({
    envName,
    fileName,
    canonicalFileName,
    relativePath: path.relative(bundleRoot, destinationPath).replace(/\\/g, '/'),
  })

  return destinationPath
}

function buildBundleNotes() {
  return `# JB-HUB Appliance Bundle

This bundle is prepared for a single-node offline appliance deployment.

- Runtime app: \`app/server/sqlite-api.js\`
- Static assets: \`app/dist/\`
- Deployment templates: \`deployment/appliance/linux/\`
- Offline payload placeholders: \`images/\` and \`runtime/\`

Suggested rollout:

1. Copy \`app/\` to \`/opt/jbhub/app\`.
2. Keep \`deployment/appliance/linux/\` on the host, for example under \`/opt/jbhub/deployment/appliance/linux\`.
3. Copy \`deployment/appliance/linux/jbhub-appliance.env.example\` to \`/etc/jbhub/jbhub-appliance.env\` and fill in production values.
4. Register \`deployment/appliance/linux/jbhub-appliance.service\` with systemd.
5. Use \`deployment/appliance/linux/install-appliance.sh\` for first-time installation, or \`upgrade-appliance.sh\` for in-place updates.
6. If you want shell-based air-gapped builds, wire the wrapper scripts in \`deployment/appliance/linux/airgap-*.sh\`.
7. Optional archives copied into \`runtime/\` and \`images/\` use canonical names such as \`appliance-node-archive.*\`.
8. The installer copies \`runtime/\` and \`images/\` into the install root and auto-extracts \`appliance-node-archive.*\` when present.

Reference docs:

- \`app/docs/AIRGAP_EXECUTOR_MODES.md\`
- \`app/docs/APPLIANCE_ARCHITECTURE.md\`
`
}

await ensureCleanDirectory(bundleRoot)
await fs.mkdir(appRoot, { recursive: true })
await fs.mkdir(imagesRoot, { recursive: true })
await fs.mkdir(runtimeRoot, { recursive: true })
await fs.mkdir(deploymentRoot, { recursive: true })

await runCommand(npmCommand, ['run', 'build'])

await copyIntoBundle('dist', 'app/dist')
await copyIntoBundle('server', 'app/server')
await copyIntoBundle('package.json', 'app/package.json')
await copyIntoBundle('package-lock.json', 'app/package-lock.json')
await copyIntoBundle('.env.production.example', 'app/.env.production.example')
await copyIntoBundle('docs', 'app/docs')
await copyIntoBundle('deployment', 'deployment')

if (includeNodeModules) {
  await copyIntoBundle('node_modules', 'app/node_modules')
}

const copiedArtifacts = []
await copyOptionalArchive('APPLIANCE_IMAGE_ARCHIVE', imagesRoot, copiedArtifacts)
await copyOptionalArchive('APPLIANCE_RUNTIME_ARCHIVE', runtimeRoot, copiedArtifacts)
await copyOptionalArchive('APPLIANCE_NODE_ARCHIVE', runtimeRoot, copiedArtifacts)

const manifest = {
  bundleName,
  createdAt: new Date().toISOString(),
  mode: 'sqlite-single-node-appliance',
  appEntry: 'app/server/sqlite-api.js',
  serveStaticDist: true,
  includesNodeModules: includeNodeModules,
  runtime: {
    kind: runtimeConfig.kind,
    binary: runtimeConfig.binary,
    composeCommand: runtimeConfig.composeCommand,
    label: runtimeConfig.label,
  },
  deployment: {
    envExamplePath: 'deployment/appliance/linux/jbhub-appliance.env.example',
    serviceTemplatePath: 'deployment/appliance/linux/jbhub-appliance.service',
    installScriptPath: 'deployment/appliance/linux/install-appliance.sh',
    upgradeScriptPath: 'deployment/appliance/linux/upgrade-appliance.sh',
    shellWrappersPath: 'deployment/appliance/linux',
  },
  offlineArtifacts: copiedArtifacts,
}

await fs.writeFile(path.join(bundleRoot, 'appliance-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
await fs.writeFile(path.join(bundleRoot, 'README.md'), buildBundleNotes(), 'utf8')

console.log(`[appliance-bundle] bundle: ${bundleRoot}`)
console.log(`[appliance-bundle] runtime: ${runtimeConfig.label} (${runtimeConfig.binary})`)
console.log(`[appliance-bundle] nodeModulesIncluded: ${includeNodeModules ? 'yes' : 'no'}`)
