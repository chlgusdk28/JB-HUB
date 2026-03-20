import 'dotenv/config'
import fs from 'node:fs/promises'
import mysql from 'mysql2/promise'
import { BACKUP_ROOT, PROJECT_FILES_ROOT, ensureRuntimeLayout } from '../server/runtime-paths.js'

function readEnvString(key, fallback = '') {
  const value = process.env[key]
  if (typeof value !== 'string') {
    return fallback
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

function readEnvNumber(key, fallback) {
  const raw = readEnvString(key, String(fallback))
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

const DB_HOST = readEnvString('DB_HOST', '127.0.0.1')
const DB_PORT = readEnvNumber('DB_PORT', 3310)
const DB_USER = readEnvString('DB_USER', 'root')
const DB_PASSWORD = readEnvString('DB_PASSWORD', '')
const DB_NAME = readEnvString('DB_NAME', 'jbhub')

const removablePaths = [
  PROJECT_FILES_ROOT,
  BACKUP_ROOT,
]

async function tableExists(pool, tableName) {
  const [rows] = await pool.query(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.tables
      WHERE table_schema = ? AND table_name = ?
    `,
    [DB_NAME, tableName],
  )

  return Number(rows[0]?.count ?? 0) > 0
}

async function main() {
  ensureRuntimeLayout()

  const pool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    connectionLimit: 4,
    waitForConnections: true,
  })

  try {
    const [projectRows] = await pool.query('SELECT id FROM projects ORDER BY id')
    const projectIds = projectRows.map((row) => Number(row.id)).filter((value) => Number.isFinite(value) && value > 0)

    const existingTables = {
      dockerDeployments: await tableExists(pool, 'docker_deployments'),
      dockerImages: await tableExists(pool, 'docker_images'),
      signupApplications: await tableExists(pool, 'signup_applications'),
      auditLogs: await tableExists(pool, 'audit_logs'),
      projects: await tableExists(pool, 'projects'),
      adminUsers: await tableExists(pool, 'admin_users'),
    }

    if (existingTables.dockerDeployments) {
      await pool.query('DELETE FROM docker_deployments')
    }
    if (existingTables.dockerImages) {
      await pool.query('DELETE FROM docker_images')
    }
    if (existingTables.signupApplications) {
      await pool.query('DELETE FROM signup_applications')
    }
    if (existingTables.auditLogs) {
      await pool.query('DELETE FROM audit_logs')
    }
    if (existingTables.projects) {
      await pool.query('DELETE FROM projects')
    }
    if (existingTables.adminUsers) {
      await pool.query('DELETE FROM admin_users')
    }

    for (const targetPath of removablePaths) {
      await fs.rm(targetPath, { recursive: true, force: true })
    }

    console.log(
      JSON.stringify(
        {
          reset: 'ok',
          removedProjects: projectIds.length,
          removedPaths: removablePaths,
        },
        null,
        2,
      ),
    )
  } finally {
    await pool.end()
  }
}

await main()
