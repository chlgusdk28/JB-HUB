import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const artifactsDir = path.join(rootDir, 'artifacts')
const composeSourcePath = path.join(rootDir, 'docker-compose.finance.yml')
const composeArtifactPath = path.join(artifactsDir, 'jbhub-finance-compose.yml')
const dateStamp = (process.env.FINANCE_BUNDLE_DATE ?? new Date().toISOString().slice(0, 10)).replace(/-/g, '')
const imageReference = 'jbhub-finance:finance-runtime'
const imageArchivePath = path.join(artifactsDir, `jbhub-finance-runtime-${dateStamp}.tar`)

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
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

await fs.mkdir(artifactsDir, { recursive: true })
await fs.copyFile(composeSourcePath, composeArtifactPath)

await runCommand('docker', ['build', '-f', 'Dockerfile.finance', '-t', imageReference, '.'])
await runCommand('docker', ['save', '-o', imageArchivePath, imageReference])

const archiveStats = await fs.stat(imageArchivePath)

console.log(`[finance-bundle] image: ${imageReference}`)
console.log(`[finance-bundle] tar: ${imageArchivePath}`)
console.log(`[finance-bundle] compose: ${composeArtifactPath}`)
console.log(`[finance-bundle] sizeBytes: ${archiveStats.size}`)
