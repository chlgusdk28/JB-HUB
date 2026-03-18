import { isWindowsUncWorkingDir, runInWorkingDir } from './spawn-in-working-dir.mjs'

const viteArgs = ['node_modules/vite/bin/vite.js', ...process.argv.slice(2)]
const env = { ...process.env }
const isWatchMode = viteArgs.every((arg) => !['build', 'preview'].includes(arg))

if (isWindowsUncWorkingDir() && isWatchMode) {
  env.CHOKIDAR_USEPOLLING ??= '1'
  env.CHOKIDAR_INTERVAL ??= '300'
  env.WATCHPACK_POLLING ??= 'true'
}

const exitCode = await runInWorkingDir(process.execPath, viteArgs, {
  stdio: 'inherit',
  env,
})

process.exit(Number(exitCode))
