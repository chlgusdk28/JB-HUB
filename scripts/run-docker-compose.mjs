import { spawnSync } from 'node:child_process'
import { spawnInWorkingDir } from './spawn-in-working-dir.mjs'

function hasCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'ignore',
  })

  return !result.error && result.status === 0
}

function resolveComposeCommand() {
  if (hasCommand('docker', ['compose', 'version'])) {
    return { command: 'docker', argsPrefix: ['compose'] }
  }

  if (hasCommand('docker-compose', ['--version'])) {
    return { command: 'docker-compose', argsPrefix: [] }
  }

  throw new Error('Neither `docker compose` nor `docker-compose` is available in this environment.')
}

const { command, argsPrefix } = resolveComposeCommand()
const child = spawnInWorkingDir(command, [...argsPrefix, ...process.argv.slice(2)], {
  stdio: 'inherit',
})

child.on('error', (error) => {
  console.error(`[docker] failed to start compose command: ${error.message}`)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})
