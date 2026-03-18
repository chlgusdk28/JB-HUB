import { spawn } from 'node:child_process'
import path from 'node:path'

export function isWindowsUncWorkingDir(cwd = process.cwd()) {
  return process.platform === 'win32' && cwd.startsWith('\\\\')
}

function quoteForCmd(value) {
  return `"${String(value).replace(/"/g, '""')}"`
}

function formatArgForCmd(value) {
  const stringValue = String(value)
  return /[\s"]/u.test(stringValue) ? quoteForCmd(stringValue) : stringValue
}

function formatCommandForCmd(command) {
  const stringValue = String(command)
  const baseName = path.basename(stringValue).toLowerCase()
  if (baseName === 'node.exe' || baseName === 'node') {
    return 'node'
  }
  if (!/[\\/]/u.test(stringValue) && !/\s/u.test(stringValue)) {
    return stringValue
  }
  return quoteForCmd(stringValue)
}

export function spawnInWorkingDir(command, args = [], options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const env = options.env ?? process.env

  if (!isWindowsUncWorkingDir(cwd)) {
    return spawn(command, args, {
      ...options,
      cwd,
      env,
    })
  }

  const commandName = formatCommandForCmd(command)
  const formattedArgs = args.map(formatArgForCmd).join(' ')
  const commandLine = `pushd ${cwd} && ${commandName}${formattedArgs ? ` ${formattedArgs}` : ''} && popd`
  const cmdStartDir = env.SystemRoot ?? 'C:\\Windows'
  const spawnOptions = {
    ...options,
    cwd: cmdStartDir,
    env,
  }

  return spawn('cmd.exe', ['/c', commandLine], spawnOptions)
}

export async function runInWorkingDir(command, args = [], options = {}) {
  const child = spawnInWorkingDir(command, args, options)
  return await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (code) => {
      resolve(code ?? 0)
    })
  })
}
