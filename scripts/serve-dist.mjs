import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const distDir = path.join(rootDir, 'dist')
const host = process.env.WEB_HOST ?? '0.0.0.0'
const port = Number(process.env.WEB_PORT ?? '5173')

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
}

function getContentType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}

function resolvePathname(urlPath) {
  const pathname = decodeURIComponent(new URL(urlPath, 'http://localhost').pathname)
  if (pathname === '/') {
    return 'index.html'
  }
  return pathname.replace(/^\/+/, '')
}

async function readResponseFile(urlPath) {
  const relativePath = resolvePathname(urlPath)
  const requestedPath = path.resolve(distDir, relativePath)

  if (!requestedPath.startsWith(distDir)) {
    return {
      statusCode: 403,
      body: Buffer.from('Forbidden'),
      contentType: 'text/plain; charset=utf-8',
    }
  }

  try {
    const stats = await fs.stat(requestedPath)
    if (stats.isFile()) {
      return {
        statusCode: 200,
        body: await fs.readFile(requestedPath),
        contentType: getContentType(requestedPath),
      }
    }
  } catch {
    // Fall through to SPA fallback.
  }

  const indexPath = path.join(distDir, 'index.html')
  return {
    statusCode: 200,
    body: await fs.readFile(indexPath),
    contentType: 'text/html; charset=utf-8',
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const response = await readResponseFile(req.url ?? '/')
    res.writeHead(response.statusCode, {
      'Cache-Control': response.contentType.startsWith('text/html') ? 'no-cache' : 'public, max-age=300',
      'Content-Type': response.contentType,
    })
    res.end(response.body)
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(error instanceof Error ? error.message : 'Internal Server Error')
  }
})

server.listen(port, host, () => {
  console.log(`[web] http://127.0.0.1:${port}`)
})

