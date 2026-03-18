import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const WEB_PORT = Number.parseInt(process.env.WEB_SMOKE_PORT ?? '5174', 10)
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`
const START_TIMEOUT_MS = 30_000

async function waitForWebReady(timeoutMs) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(WEB_URL)
      if (response.ok) {
        const html = await response.text()
        assert.ok(html.includes('<div id="root"></div>'), 'index html should include root mount')
        return
      }
    } catch {
      // keep polling
    }
    await delay(400)
  }
  throw new Error(`Web server did not start within ${timeoutMs}ms`)
}

async function run() {
  const child = spawn(
    process.execPath,
    ['scripts/run-vite.mjs', 'preview', '--host', '127.0.0.1', '--port', String(WEB_PORT), '--strictPort'],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  let logs = ''
  let exited = false
  child.stdout.on('data', (chunk) => {
    logs += chunk.toString()
  })
  child.stderr.on('data', (chunk) => {
    logs += chunk.toString()
  })
  child.on('exit', () => {
    exited = true
  })

  try {
    await waitForWebReady(START_TIMEOUT_MS)
    console.log(`Web smoke test passed at ${WEB_URL}`)
  } catch (error) {
    console.error('Web smoke test failed.')
    console.error(error)
    console.error('--- Web logs ---')
    console.error(logs)
    process.exitCode = 1
  } finally {
    if (!exited) {
      child.kill('SIGTERM')
      await delay(800)
      if (!exited) {
        child.kill('SIGKILL')
      }
    }
  }
}

await run()
