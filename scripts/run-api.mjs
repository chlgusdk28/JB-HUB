import { isWindowsUncWorkingDir, runInWorkingDir } from './spawn-in-working-dir.mjs'

const wantsWatch = process.argv.includes('--watch')
const nodeArgs = []

if (wantsWatch && !isWindowsUncWorkingDir()) {
  nodeArgs.push('--watch')
} else if (wantsWatch) {
  console.warn('[api] disabled --watch because Node file watching is unstable on Windows UNC paths.')
}

nodeArgs.push('server/index.js')

const exitCode = await runInWorkingDir(process.execPath, nodeArgs, {
  stdio: 'inherit',
})

process.exit(Number(exitCode))
