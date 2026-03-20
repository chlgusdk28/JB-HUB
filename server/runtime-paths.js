import fs from 'node:fs'
import path from 'node:path'

export const RUNTIME_ROOT = path.join(process.cwd(), '.runtime')
export const STORAGE_ROOT = path.join(RUNTIME_ROOT, 'storage')
export const DATA_ROOT = path.join(STORAGE_ROOT, 'data')
export const PROJECT_FILES_ROOT = path.join(STORAGE_ROOT, 'project-files')
export const UPLOAD_TEMP_DIR = path.join(STORAGE_ROOT, 'upload-temp')
export const BACKUP_ROOT = path.join(STORAGE_ROOT, 'backup')
export const DOCKER_ROOT = path.join(STORAGE_ROOT, 'docker')
export const DOCKER_CONTEXTS_ROOT = path.join(DOCKER_ROOT, 'contexts')
export const DOCKER_LOGS_ROOT = path.join(DOCKER_ROOT, 'logs')
export const DOCKER_ARTIFACTS_ROOT = path.join(DOCKER_ROOT, 'artifacts')
export const SQLITE_DB_PATH = path.join(DATA_ROOT, 'jbhub.db')
export const RUNTIME_SEEDS_ROOT = path.join(process.cwd(), 'server', 'runtime-seeds')
export const PROJECT_FILE_SEEDS_ROOT = path.join(RUNTIME_SEEDS_ROOT, 'project-files')

const LEGACY_PATH_MAPPINGS = [
  [path.join(process.cwd(), 'data'), DATA_ROOT],
  [path.join(process.cwd(), 'project-files'), PROJECT_FILES_ROOT],
  [path.join(process.cwd(), 'upload-temp'), UPLOAD_TEMP_DIR],
  [path.join(process.cwd(), 'backup'), BACKUP_ROOT],
]

function pathExists(targetPath) {
  try {
    fs.accessSync(targetPath, fs.constants.F_OK)
    return true
  } catch {
    return false
  }
}

function directoryHasEntries(targetPath) {
  try {
    return fs.readdirSync(targetPath).length > 0
  } catch {
    return false
  }
}

function migrateLegacyPath(legacyPath, nextPath) {
  if (!pathExists(legacyPath)) {
    return
  }

  if (pathExists(nextPath) && directoryHasEntries(nextPath)) {
    return
  }

  fs.mkdirSync(path.dirname(nextPath), { recursive: true })

  try {
    fs.renameSync(legacyPath, nextPath)
  } catch {
    fs.cpSync(legacyPath, nextPath, { recursive: true, force: true })
    try {
      fs.rmSync(legacyPath, { recursive: true, force: true })
    } catch {
      // A running dev server can still hold the old path open.
    }
  }
}

function copyMissingSeedTree(sourceRoot, targetRoot) {
  if (!pathExists(sourceRoot)) {
    return
  }

  const entries = fs.readdirSync(sourceRoot, { withFileTypes: true })
  fs.mkdirSync(targetRoot, { recursive: true })

  for (const entry of entries) {
    const sourcePath = path.join(sourceRoot, entry.name)
    const targetPath = path.join(targetRoot, entry.name)

    if (entry.isDirectory()) {
      copyMissingSeedTree(sourcePath, targetPath)
      continue
    }

    if (!pathExists(targetPath)) {
      fs.copyFileSync(sourcePath, targetPath)
    }
  }
}

export function ensureRuntimeLayout() {
  fs.mkdirSync(STORAGE_ROOT, { recursive: true })

  for (const [legacyPath, nextPath] of LEGACY_PATH_MAPPINGS) {
    migrateLegacyPath(legacyPath, nextPath)
  }

  fs.mkdirSync(DATA_ROOT, { recursive: true })
  fs.mkdirSync(PROJECT_FILES_ROOT, { recursive: true })
  fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true })
  fs.mkdirSync(BACKUP_ROOT, { recursive: true })
  fs.mkdirSync(DOCKER_CONTEXTS_ROOT, { recursive: true })
  fs.mkdirSync(DOCKER_LOGS_ROOT, { recursive: true })
  fs.mkdirSync(DOCKER_ARTIFACTS_ROOT, { recursive: true })

  // Keep tracked sample files out of the repo root while preserving local demos.
  copyMissingSeedTree(PROJECT_FILE_SEEDS_ROOT, PROJECT_FILES_ROOT)
}
