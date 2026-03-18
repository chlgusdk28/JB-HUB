import fs from 'node:fs'
import path from 'node:path'
import { spawnInWorkingDir, isWindowsUncWorkingDir } from './spawn-in-working-dir.mjs'

function relayStream(stream, prefix, target) {
  let buffered = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    buffered += chunk
    const lines = buffered.split(/\r?\n/)
    buffered = lines.pop() ?? ''
    for (const line of lines) {
      target.write(`[${prefix}] ${line}\n`)
    }
  })
  stream.on('end', () => {
    if (buffered) {
      target.write(`[${prefix}] ${buffered}\n`)
    }
  })
}

const children = new Map()
let shuttingDown = false

function stopChildren(signal = 'SIGTERM') {
  for (const child of children.values()) {
    if (!child.killed) {
      child.kill(signal)
    }
  }
}

function startProcess(name, args) {
  const child = spawnInWorkingDir(process.execPath, args, {
    stdio: ['inherit', 'pipe', 'pipe'],
  })

  relayStream(child.stdout, name, process.stdout)
  relayStream(child.stderr, name, process.stderr)
  children.set(name, child)

  child.on('exit', (code, signal) => {
    children.delete(name)
    if (shuttingDown) {
      return
    }

    shuttingDown = true
    stopChildren()

    const description = signal ? `${name} exited via ${signal}` : `${name} exited with code ${code ?? 0}`
    const target = code === 0 ? process.stdout : process.stderr
    target.write(`[dev] ${description}\n`)
    process.exit(code ?? 1)
  })

  return child
}

async function runBlockingProcess(name, args) {
  const child = spawnInWorkingDir(process.execPath, args, {
    stdio: 'inherit',
  })

  await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (code) => {
      if ((code ?? 0) === 0) {
        resolve()
        return
      }
      reject(new Error(`${name} exited with code ${code ?? 1}`))
    })
  })
}

const usePreviewWebServer = process.env.JBHUB_FORCE_PREVIEW === '1' || isWindowsUncWorkingDir()
const distIndexPath = path.join(process.cwd(), 'dist', 'index.html')

if (usePreviewWebServer) {
  process.stdout.write('[dev] Windows UNC working directory detected; web server will use preview mode.\n')
  if (!fs.existsSync(distIndexPath)) {
    process.stdout.write('[dev] dist output missing; running a production build before preview.\n')
    await runBlockingProcess('build', ['scripts/run-vite.mjs', 'build'])
  }
}

startProcess('api', ['scripts/run-api.mjs', '--watch'])
startProcess(
  'web',
  usePreviewWebServer
    ? ['scripts/run-vite.mjs', 'preview', '--host', '127.0.0.1', '--port', '5173', '--strictPort']
    : ['scripts/run-vite.mjs'],
)

process.on('SIGINT', () => {
  if (shuttingDown) return
  shuttingDown = true
  stopChildren('SIGINT')
})

process.on('SIGTERM', () => {
  if (shuttingDown) return
  shuttingDown = true
  stopChildren('SIGTERM')
})
