import 'dotenv/config'
import compression from 'compression'
import cors from 'cors'
import express from 'express'
import fileUpload from 'express-fileupload'
import helmet from 'helmet'
import { randomBytes, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import mysql from 'mysql2/promise'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import { seedProjects } from './seed-projects.js'
import { ensureRuntimeLayout, PROJECT_FILES_ROOT, UPLOAD_TEMP_DIR } from './runtime-paths.js'
import {
  attachSignupPlatformAdminRoutes,
  createSignupPlatformPublicRouter,
  ensureSignupPlatformSchema,
} from './signup-platform.js'
import {
  attachAdminSiteContentRoutes,
  createSiteContentPublicRouter,
  ensureSiteContentSchema,
} from './site-content.js'
import { createToolsRouter } from './tools-api.js'

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

function readSingleHeader(value) {
  if (Array.isArray(value)) {
    return value[0] ?? ''
  }
  return typeof value === 'string' ? value : ''
}

const API_PORT = readEnvNumber('API_PORT', 8787)
const DB_HOST = readEnvString('DB_HOST', '127.0.0.1')
const DB_PORT = readEnvNumber('DB_PORT', 3310)
const DB_USER = readEnvString('DB_USER', 'root')
const DB_PASSWORD = readEnvString('DB_PASSWORD', '')
const DB_NAME = readEnvString('DB_NAME', 'jbhub')
const DB_CONN_LIMIT = readEnvNumber('DB_CONN_LIMIT', 10)
const APP_PRODUCT_MODE = readEnvString('APP_PRODUCT_MODE', 'signup').toLowerCase()
const NODE_ENV = readEnvString('NODE_ENV', API_PORT === 8787 ? 'development' : 'production').toLowerCase()
const IS_PRODUCTION_MODE = NODE_ENV === 'production'
const IS_SIGNUP_PLATFORM = APP_PRODUCT_MODE !== 'hub'
const DB_SEED = !IS_SIGNUP_PLATFORM && readEnvString('DB_SEED', IS_PRODUCTION_MODE ? 'false' : 'true').toLowerCase() !== 'false'
const DB_CONNECT_RETRY_ATTEMPTS = readEnvNumber('DB_CONNECT_RETRY_ATTEMPTS', 40)
const DB_CONNECT_RETRY_DELAY_MS = readEnvNumber('DB_CONNECT_RETRY_DELAY_MS', 2000)
const RATE_LIMIT_WINDOW_MS = readEnvNumber('API_RATE_LIMIT_WINDOW_MS', 60_000)
const RATE_LIMIT_MAX_REQUESTS = readEnvNumber('API_RATE_LIMIT_MAX_REQUESTS', 240)
const CORS_ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS
  ? String(process.env.CORS_ALLOWED_ORIGINS).split(',').map((s) => s.trim())
  : undefined

// JWT Configuration
const JWT_SECRET = readEnvString('API_JWT_HS256_SECRET', 'change-this-jwt-secret-with-at-least-32-characters')
const JWT_ISSUER = readEnvString('API_JWT_ISSUER', 'jbhub-api')
const JWT_AUDIENCE = readEnvString('API_JWT_AUDIENCE', 'jbhub-client')
const PROJECT_EDIT_TOKEN_AUDIENCE = `${JWT_AUDIENCE}-project-edit`
const JWT_ACCESS_EXPIRATION = readEnvNumber('JWT_ACCESS_TOKEN_EXPIRATION', 86400) // 24 hours
const JWT_REFRESH_EXPIRATION = readEnvNumber('JWT_REFRESH_TOKEN_EXPIRATION', 604800) // 7 days
const PROJECT_EDIT_TOKEN_EXPIRATION = readEnvNumber('PROJECT_EDIT_TOKEN_EXPIRATION', 15552000) // 180 days

// Admin Configuration
const ADMIN_USERNAME = readEnvString('ADMIN_DEFAULT_USERNAME', 'jbhub-admin')
const ADMIN_PASSWORD = readEnvString('ADMIN_DEFAULT_PASSWORD', 'change-this-admin-password')
const ADMIN_EMAIL = readEnvString('ADMIN_DEFAULT_EMAIL', 'admin@jbhub.local')
const ADMIN_SESSION_TIMEOUT = readEnvNumber('ADMIN_SESSION_TIMEOUT_MS', 3600000) // 1 hour
const ADMIN_MAX_LOGIN_ATTEMPTS = readEnvNumber('ADMIN_MAX_LOGIN_ATTEMPTS', 5)
const ADMIN_LOCKOUT_DURATION = readEnvNumber('ADMIN_LOCKOUT_DURATION_MS', 900000) // 15 minutes
const AUTH_STATE_CLEANUP_INTERVAL_MS = readEnvNumber('AUTH_STATE_CLEANUP_INTERVAL_MS', 300000) // 5 minutes
const MAX_TEXT_PREVIEW_BYTES = 256 * 1024
const MAX_PROJECT_README_CHAR_COUNT = 200000
const MAX_PROJECT_FILE_STORAGE_BYTES = 1024 * 1024 * 1024
const TEXT_FILE_EXTENSIONS = new Set([
  '.c',
  '.cc',
  '.cpp',
  '.css',
  '.csv',
  '.go',
  '.h',
  '.hpp',
  '.html',
  '.java',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.py',
  '.rb',
  '.rs',
  '.sh',
  '.sql',
  '.svg',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
])
const TEXT_FILE_NAMES = new Set([
  '.env',
  '.env.example',
  '.gitignore',
  '.npmrc',
  '.prettierrc',
  'dockerfile',
  'license',
  'makefile',
  'readme',
  'readme.md',
])

// Audit Log Configuration
const AUDIT_LOG_ENABLED = readEnvString('AUDIT_LOG_ENABLED', 'true').toLowerCase() === 'true'
const AUDIT_LOG_RETENTION_DAYS = readEnvNumber('AUDIT_LOG_RETENTION_DAYS', 90)

// In-memory admin sessions (production should use Redis)
const adminSessions = new Map() // sessionId -> { userId, username, role, createdAt, lastActivity }
const loginAttempts = new Map() // IP -> { count, lastAttempt, lockedUntil }

// In-memory refresh tokens (production should use Redis)
const refreshTokens = new Map() // tokenId -> { userId, username, expiresAt }
const ADMIN_ALLOWED_ROLES = new Set(['super_admin', 'admin'])

ensureRuntimeLayout()

function ensureSafeDbName(dbName) {
  if (!/^[A-Za-z0-9_]+$/.test(dbName)) {
    throw new Error('DB_NAME must contain only letters, numbers, and underscore.')
  }
  return dbName
}

const WEAK_DB_PASSWORDS = new Set([
  '',
  'root',
  'password',
  'password123',
  'admin',
  'admin123',
  'changeme',
  'change_this_password',
  'change-this-db-password',
  'jbhub',
])

const WEAK_ADMIN_PASSWORDS = new Set([
  '',
  'admin',
  'admin123',
  'password',
  'password123',
  'changeme',
  '12345678',
  'qwerty123',
  'letmein',
  'change-this-admin-password',
])

const PLACEHOLDER_FRAGMENTS = [
  'change-this',
  'change_me',
  'changeme',
  'replace-with',
  'replace_me',
  'placeholder',
  'example',
  'your-password',
  'your-secret',
]

function normalizeSecurityValue(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function containsPlaceholderFragment(value) {
  const normalized = normalizeSecurityValue(value)
  if (!normalized) {
    return true
  }
  return PLACEHOLDER_FRAGMENTS.some((fragment) => normalized.includes(fragment))
}

function isWeakDbPassword(value) {
  const normalized = normalizeSecurityValue(value)
  return WEAK_DB_PASSWORDS.has(normalized) || normalized.length < 8 || containsPlaceholderFragment(normalized)
}

function isWeakAdminPassword(value) {
  const normalized = normalizeSecurityValue(value)
  return WEAK_ADMIN_PASSWORDS.has(normalized) || normalized.length < 10 || containsPlaceholderFragment(normalized)
}

function isWeakJwtSecret(value) {
  const normalized = normalizeSecurityValue(value)
  return normalized.length < 32 || containsPlaceholderFragment(normalized)
}

// Environment validation
function validateEnvironment() {
  const errors = []
  const warnings = []

  // Check database configuration
  if (!DB_HOST) {
    errors.push('DB_HOST is required')
  }
  if (!DB_USER) {
    errors.push('DB_USER is required')
  }
  if (isWeakDbPassword(DB_PASSWORD)) {
    const message = 'DB_PASSWORD is using a weak or placeholder value. Use a unique password before deployment.'
    if (IS_PRODUCTION_MODE) {
      errors.push(message)
    } else {
      warnings.push(message)
    }
  }

  // Check CORS configuration for production
  if (IS_PRODUCTION_MODE) {
    if (!CORS_ALLOWED_ORIGINS || CORS_ALLOWED_ORIGINS.length === 0) {
      warnings.push('CORS_ALLOWED_ORIGINS is empty. Cross-origin browser access will be denied; this is fine for same-origin deployments.')
    } else if (CORS_ALLOWED_ORIGINS.includes('*')) {
      warnings.push('CORS_ALLOWED_ORIGINS includes "*" which allows all origins. Use specific domains in production!')
    }
  }

  // Security-critical defaults must be overridden in production.
  if (IS_PRODUCTION_MODE) {
    if (isWeakJwtSecret(JWT_SECRET)) {
      errors.push('API_JWT_HS256_SECRET must be at least 32 characters and not use a placeholder value in production')
    }
    if (isWeakAdminPassword(ADMIN_PASSWORD)) {
      errors.push('ADMIN_DEFAULT_PASSWORD must be changed to a strong password in production')
    }
    if (ADMIN_USERNAME === 'admin') {
      warnings.push('ADMIN_DEFAULT_USERNAME is using default value. Consider changing it in production.')
    }
    if (!IS_SIGNUP_PLATFORM && DB_SEED) {
      warnings.push('DB_SEED is enabled in production. Disable demo data seeding after initial setup.')
    }
  }

  // Log validation results
  if (warnings.length > 0) {
    console.warn('[api] ⚠️  Configuration warnings:')
    warnings.forEach((w) => console.warn(`[api]   - ${w}`))
  }

  if (errors.length > 0) {
    console.error('[api] ❌ Configuration errors:')
    errors.forEach((e) => console.error(`[api]   - ${e}`))
    throw new Error('Invalid configuration. Please fix the errors above.')
  }

  console.log('[api] ✅ Configuration validated')
}

function normalizeNumeric(input, fallback = 0) {
  const parsed = Number(input)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return parsed
}

function parseTags(rawTags) {
  if (Array.isArray(rawTags)) {
    return rawTags.filter((value) => typeof value === 'string')
  }

  if (typeof rawTags === 'string') {
    try {
      const parsed = JSON.parse(rawTags)
      if (Array.isArray(parsed)) {
        return parsed.filter((value) => typeof value === 'string')
      }
    } catch {
      return []
    }
  }

  return []
}

// Security: Input sanitization helpers
const ALLOWED_DEPARTMENTS = [
  'IT 디지털', 'IT 지원', 'IT 플랫폼', 'IT 보안', 'AX',
  '경영지원', '인사팀', '재무팀', '마케팅', '영업팀',
  '개발팀', '디자인팀', '기획팀', '운영팀', 'all'
]

const RESTRICTED_PROJECT_PATH_SEGMENTS = new Set([
  '.aws',
  '.git',
  '.hg',
  '.kube',
  '.ssh',
  '.svn',
])

const RESTRICTED_PROJECT_FILE_PATTERNS = [
  /^\.env(?:\..+)?$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)$/i,
  /^(authorized_keys|known_hosts)$/i,
  /\.(key|pem|p12|pfx|jks|kdbx)$/i,
]

const ALLOWED_PROJECT_HIDDEN_FILES = new Set([
  '.dockerignore',
  '.env.example',
  '.gitignore',
])

function sanitizeString(input, maxLength = 120, allowSpecialChars = false) {
  if (typeof input !== 'string') return ''
  let sanitized = input.trim()
  // Remove potential HTML/script tags
  sanitized = sanitized.replace(/<script[^>]*>.*?<\/script>/gi, '')
  sanitized = sanitized.replace(/<[^>]*>/g, '')
  // Limit length
  sanitized = sanitized.slice(0, maxLength)
  // Remove control characters except newlines/tabs
  sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
  if (!allowSpecialChars) {
    // Allow only safe characters for names/departments
    sanitized = sanitized.replace(/[^\p{L}\p{N}\s\-_.@]/gu, '')
  }
  return sanitized
}

function validateDepartment(dept) {
  const normalized = sanitizeString(dept, 120)
  if (!normalized) return 'all'
  // Check against whitelist
  if (ALLOWED_DEPARTMENTS.includes(normalized)) {
    return normalized
  }
  // For new departments, allow only alphanumeric + Korean + spaces + specific chars
  if (/^[\p{L}\p{N}\s\-]+$/u.test(normalized) && normalized.length <= 120) {
    return normalized
  }
  return 'all'
}

function toProjectDto(row) {
  return {
    id: Number(row.id),
    title: row.title,
    description: row.description,
    author: row.author,
    department: row.department,
    stars: Number(row.stars),
    forks: Number(row.forks),
    comments: Number(row.comments),
    views: Number(row.views),
    tags: parseTags(row.tags),
    createdAt: row.created_at_label ?? undefined,
    isNew: row.is_new === 1,
    trend: row.trend ?? undefined,
    badge: row.badge ?? undefined,
  }
}

function normalizeTagValue(value) {
  return String(value).trim().replace(/\s+/g, ' ')
}

function normalizeInputProject(input) {
  // Security: Enhanced input sanitization
  const title = sanitizeString(String(input.title ?? ''), 255)
  const description = sanitizeString(String(input.description ?? ''), 5000, true)
  const author = sanitizeString(String(input.author ?? ''), 120)
  const department = validateDepartment(String(input.department ?? ''))

  const tags = Array.isArray(input.tags)
    ? input.tags
        .map(normalizeTagValue)
        .filter((value) => value.length > 0 && value.length <= 50)
        .slice(0, 20)
    : []

  // Validate each tag for safe content
  const safeTags = tags.filter(tag => /^[\p{L}\p{N}\s\-_.#]+$/u.test(tag))

  const normalized = {
    title,
    description,
    author,
    department,
    stars: Math.max(0, Math.min(999999, Math.floor(normalizeNumeric(input.stars, 0)))),
    forks: Math.max(0, Math.min(999999, Math.floor(normalizeNumeric(input.forks, 0)))),
    comments: Math.max(0, Math.min(999999, Math.floor(normalizeNumeric(input.comments, 0)))),
    views: Math.max(0, Math.min(999999, Math.floor(normalizeNumeric(input.views, 0)))),
    tags: safeTags,
    createdAt: input.createdAt ? String(input.createdAt).slice(0, 64) : '방금 전',
    isNew: input.isNew !== undefined ? Boolean(input.isNew) : true,
    trend: input.trend ? sanitizeString(String(input.trend), 64) : null,
    badge: input.badge ? sanitizeString(String(input.badge), 64) : null,
  }

  if (!normalized.title) {
    throw new Error('validation:title is required')
  }
  if (normalized.title.length < 2) {
    throw new Error('validation:title is too short')
  }
  if (!normalized.description) {
    throw new Error('validation:description is required')
  }
  if (normalized.description.length < 10) {
    throw new Error('validation:description is too short')
  }
  if (!normalized.author) {
    throw new Error('validation:author is required')
  }
  if (normalized.author.length < 2) {
    throw new Error('validation:author is too short')
  }
  if (!normalized.department) {
    throw new Error('validation:department is required')
  }
  if (safeTags.length === 0) {
    throw new Error('validation:at least one valid tag is required')
  }

  return normalized
}

function normalizeProjectQuery(query) {
  // Security: Enhanced query parameter sanitization
  const search = sanitizeString(String(query.search ?? ''), 100, true)
  const department = validateDepartment(String(query.department ?? ''))
  const minStarsRaw = Number.parseInt(String(query.minStars ?? ''), 10)
  const minStars = Number.isFinite(minStarsRaw) && minStarsRaw > 0 ? Math.max(0, Math.min(999999, minStarsRaw)) : 0
  const limitRaw = Number.parseInt(String(query.limit ?? ''), 10)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 0
  const offsetRaw = Number.parseInt(String(query.offset ?? ''), 10)
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0
  const sortByCandidate = typeof query.sortBy === 'string' ? query.sortBy.trim() : 'newest'
  const sortBy = ['newest', 'stars', 'views', 'comments'].includes(sortByCandidate) ? sortByCandidate : 'newest'

  return {
    search,
    department,
    minStars,
    sortBy,
    limit,
    offset,
  }
}

function resolveSortQuery(sortBy) {
  switch (sortBy) {
    case 'stars':
      return 'stars DESC, id DESC'
    case 'views':
      return 'views DESC, id DESC'
    case 'comments':
      return 'comments DESC, id DESC'
    case 'newest':
    default:
      return 'id DESC'
  }
}

// Security: Enhanced rate limiter with blacklist and logging
function createRateLimiter(windowMs, maxRequests) {
  const buckets = new Map()
  const blacklist = new Map() // IP -> { until: timestamp, reason: string }
  const violationCounts = new Map() // IP -> count of violations

  // Periodic cleanup to prevent memory leaks (every 5 minutes)
  const cleanupInterval = setInterval(() => {
    const now = Date.now()
    let cleanedBuckets = 0
    let cleanedBlacklist = 0

    // Clean expired buckets
    for (const [key, value] of buckets.entries()) {
      if (now > value.expiresAt) {
        buckets.delete(key)
        cleanedBuckets++
      }
    }

    // Clean expired blacklist entries
    for (const [key, value] of blacklist.entries()) {
      if (now >= value.until) {
        blacklist.delete(key)
        violationCounts.delete(key)
        cleanedBlacklist++
      }
    }

    if (cleanedBuckets > 0 || cleanedBlacklist > 0) {
      console.log(`[rate-limiter] cleanup: ${cleanedBuckets} buckets, ${cleanedBlacklist} blacklist entries`)
    }
  }, 5 * 60 * 1000) // 5 minutes

  // Store interval for cleanup on server shutdown
  createRateLimiter.cleanupIntervals = createRateLimiter.cleanupIntervals || []
  createRateLimiter.cleanupIntervals.push(cleanupInterval)

  return (req, res, next) => {
    const key = req.ip ?? req.socket.remoteAddress ?? 'unknown'
    const now = Date.now()

    // Check blacklist
    const blacklisted = blacklist.get(key)
    if (blacklisted && now < blacklisted.until) {
      logSecurityEvent('RATE_LIMIT_BLOCKED', {
        ip: maskIpAddress(key),
        reason: blacklisted.reason,
        until: new Date(blacklisted.until).toISOString(),
      })
      return res.status(429).json({
        error: 'Too many violations. Temporarily blocked.',
        retryAfter: Math.ceil((blacklisted.until - now) / 1000),
      })
    }
    // Clean up expired blacklist entries
    if (blacklisted && now >= blacklisted.until) {
      blacklist.delete(key)
      violationCounts.delete(key)
    }

    const existing = buckets.get(key)

    if (!existing || now > existing.expiresAt) {
      buckets.set(key, { count: 1, expiresAt: now + windowMs })
      return next()
    }

    existing.count += 1
    if (existing.count > maxRequests) {
      // Increment violation count
      const violations = (violationCounts.get(key) || 0) + 1
      violationCounts.set(key, violations)

      // Log security event
      logSecurityEvent('RATE_LIMIT_EXCEEDED', {
        ip: maskIpAddress(key),
        count: existing.count,
        violations,
        path: req.originalUrl,
      })

      // Add to blacklist if repeated violations
      if (violations >= 3) {
        const blockDuration = 5 * 60 * 1000 * violations // 5min * violations
        blacklist.set(key, {
          until: now + blockDuration,
          reason: `Repeated rate limit violations (${violations})`,
        })
        logSecurityEvent('IP_BLACKLISTED', {
          ip: maskIpAddress(key),
          violations,
          duration: blockDuration,
        })
      }

      const retryAfterSec = Math.max(1, Math.ceil((existing.expiresAt - now) / 1000))
      res.setHeader('Retry-After', String(retryAfterSec))
      res.status(429).json({
        error: 'Too many requests. Please retry later.',
        retryAfter: retryAfterSec,
      })
      return
    }

    next()
  }
}

// Security: Mask IP address for privacy (GDPR compliance)
function maskIpAddress(ip) {
  if (!ip || ip === 'unknown') return 'unknown'
  if (ip === '::1' || ip === '127.0.0.1') return 'localhost'
  // IPv4: mask last octet (192.168.1.xxx)
  if (ip.includes('.')) {
    const parts = ip.split('.')
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.***`
    }
  }
  // IPv6: mask last 64 bits
  if (ip.includes(':')) {
    const parts = ip.split(':')
    if (parts.length > 4) {
      return parts.slice(0, 4).join(':') + ':***'
    }
  }
  return '***'
}

// Security: Log security events separately
function logSecurityEvent(event, details) {
  const timestamp = new Date().toISOString()
  console.error('[SECURITY]', timestamp, event, JSON.stringify(details))
}

function buildAttachmentContentDisposition(fileName) {
  const safeName = String(fileName ?? 'download').replace(/[\\/]/g, '_')
  const asciiFallback = safeName.replace(/[^\x20-\x7E]/g, '_')
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(safeName)}`
}

// ========================================
// Admin Authentication Functions
// ========================================

// Generate JWT access token
function generateAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: JWT_ACCESS_EXPIRATION,
  })
}

// Generate JWT refresh token
function generateRefreshToken(payload) {
  const tokenId = randomBytes(32).toString('hex')
  const token = jwt.sign({ ...payload, tokenId }, JWT_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: JWT_REFRESH_EXPIRATION,
  })

  // Store refresh token
  refreshTokens.set(tokenId, {
    userId: payload.userId,
    username: payload.username,
    role: payload.role,
    expiresAt: Date.now() + JWT_REFRESH_EXPIRATION * 1000,
  })

  return token
}

function cleanupExpiredAuthState() {
  const now = Date.now()
  let cleanedSessions = 0
  let cleanedRefreshTokens = 0
  let cleanedLoginAttempts = 0

  for (const [sessionId, session] of adminSessions.entries()) {
    if (now - session.lastActivity > ADMIN_SESSION_TIMEOUT) {
      adminSessions.delete(sessionId)
      cleanedSessions += 1
    }
  }

  for (const [tokenId, tokenData] of refreshTokens.entries()) {
    if (tokenData.expiresAt <= now) {
      refreshTokens.delete(tokenId)
      cleanedRefreshTokens += 1
    }
  }

  for (const [ip, attempts] of loginAttempts.entries()) {
    const isExpired = attempts.lockedUntil && now >= attempts.lockedUntil
    const isStale = attempts.lastAttempt && now - attempts.lastAttempt > ADMIN_LOCKOUT_DURATION * 2
    if (isExpired || isStale) {
      loginAttempts.delete(ip)
      cleanedLoginAttempts += 1
    }
  }

  return {
    sessions: cleanedSessions,
    refreshTokens: cleanedRefreshTokens,
    loginAttempts: cleanedLoginAttempts,
  }
}

// Verify JWT token
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    })
  } catch {
    return null
  }
}

// Hash password using bcrypt
async function hashPassword(password) {
  return bcrypt.hash(password, 12)
}

// Compare password using bcrypt
async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash)
}

// Check if IP is locked due to too many login attempts
function isIpLocked(ip) {
  const attempts = loginAttempts.get(ip)
  if (!attempts) return false

  if (attempts.lockedUntil && Date.now() < attempts.lockedUntil) {
    return true
  }

  // Reset if lock period expired
  if (attempts.lockedUntil && Date.now() >= attempts.lockedUntil) {
    loginAttempts.delete(ip)
  }

  return false
}

// Record login attempt
function recordLoginAttempt(ip, success) {
  if (success) {
    loginAttempts.delete(ip)
    return
  }

  const attempts = loginAttempts.get(ip) || { count: 0, lastAttempt: 0, lockedUntil: 0 }
  attempts.count += 1
  attempts.lastAttempt = Date.now()

  if (attempts.count >= ADMIN_MAX_LOGIN_ATTEMPTS) {
    attempts.lockedUntil = Date.now() + ADMIN_LOCKOUT_DURATION
    logSecurityEvent('ADMIN_LOCKOUT', {
      ip: maskIpAddress(ip),
      attempts: attempts.count,
      lockedUntil: new Date(attempts.lockedUntil).toISOString(),
    })
  }

  loginAttempts.set(ip, attempts)
}

// ========================================
// Audit Log Functions
// ========================================

async function createAuditLog(pool, action, details, adminUserId) {
  if (!AUDIT_LOG_ENABLED) return

  try {
    const resolvedAdminUserId = Number.isFinite(Number(adminUserId))
      ? Number(adminUserId)
      : Number.isFinite(Number(details?.adminUserId))
        ? Number(details.adminUserId)
        : null

    await pool.execute(
      `INSERT INTO audit_logs (action, entity_type, entity_id, details, admin_user_id, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        action,
        details.entityType || null,
        details.entityId || null,
        JSON.stringify(details),
        resolvedAdminUserId,
        details.ip || null,
        details.userAgent || null,
      ]
    )
  } catch (error) {
    console.error('[audit-log] Failed to create audit log:', error)
  }
}

async function getAuditLogs(pool, filters = {}) {
  const whereClauses = ['1=1']
  const params = []

  if (filters.action) {
    whereClauses.push('action = ?')
    params.push(filters.action)
  }

  if (filters.adminUserId) {
    whereClauses.push('admin_user_id = ?')
    params.push(filters.adminUserId)
  }

  if (filters.startDate) {
    whereClauses.push('created_at >= ?')
    params.push(filters.startDate)
  }

  if (filters.endDate) {
    whereClauses.push('created_at <= ?')
    params.push(filters.endDate)
  }

  const limit = filters.limit || 100
  const offset = filters.offset || 0

  const sql = `
    SELECT * FROM audit_logs
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `

  params.push(limit, offset)

  const [rows] = await pool.query(sql, params)
  return rows
}

// ========================================
// Admin Middleware
// ========================================

// JWT authentication middleware
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'No token provided',
    })
  }

  const token = authHeader.substring(7)
  const decoded = verifyToken(token)

  if (!decoded) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    })
  }

  req.user = {
    userId: decoded.userId,
    username: decoded.username,
    role: decoded.role,
  }

  next()
}

// Admin role check middleware
function requireAdmin(req, res, next) {
  if (!req.user || !ADMIN_ALLOWED_ROLES.has(req.user.role)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Admin access required',
    })
  }

  const sessionHeader = req.headers['x-admin-session']
  const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'No session provided',
    })
  }

  const session = adminSessions.get(sessionId)
  if (!session) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid session',
    })
  }

  const now = Date.now()
  if (now - session.lastActivity > ADMIN_SESSION_TIMEOUT) {
    adminSessions.delete(sessionId)
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Session expired',
    })
  }

  if (session.userId !== req.user.userId) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Session does not match token owner',
    })
  }

  session.lastActivity = now
  req.adminSession = session
  next()
}

// Session validation middleware
function validateAdminSession(req, res, next) {
  const sessionHeader = req.headers['x-admin-session']
  const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader

  if (!sessionId) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'No session provided',
    })
  }

  const session = adminSessions.get(sessionId)

  if (!session) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid session',
    })
  }

  // Check session timeout
  const now = Date.now()
  if (now - session.lastActivity > ADMIN_SESSION_TIMEOUT) {
    adminSessions.delete(sessionId)
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Session expired',
    })
  }

  // Update last activity
  session.lastActivity = now
  req.adminSession = session

  next()
}

function createRequestLogger() {
  return (req, res, next) => {
    const start = Date.now()
    const requestId = randomUUID()
    req.requestId = requestId
    res.setHeader('x-request-id', requestId)

    // Security: Track suspicious activity
    const originalUrl = req.originalUrl || req.url
    const suspiciousPaths = ['/etc/passwd', '../', '..\\', '%2e%2e', 'shell', 'exec']
    const isSuspicious = suspiciousPaths.some(path =>
      originalUrl.toLowerCase().includes(path.toLowerCase())
    )

    res.on('finish', () => {
      const durationMs = Date.now() - start
      const maskedIp = maskIpAddress(req.ip ?? req.socket.remoteAddress)
      const statusCode = res.statusCode

      const logData = {
        requestId,
        method: req.method,
        path: originalUrl,
        statusCode,
        durationMs,
        ip: maskedIp,
      }

      // Security event logging
      if (isSuspicious) {
        logSecurityEvent('SUSPICIOUS_REQUEST', {
          ...logData,
          userAgent: req.get('user-agent'),
        })
      }

      if (statusCode >= 500) {
        console.error('[api]', JSON.stringify(logData))
      } else if (statusCode >= 400) {
        console.warn('[api]', JSON.stringify(logData))
      } else {
        console.log('[api]', JSON.stringify(logData))
      }
    })

    next()
  }
}

// Security: Sanitize error messages to prevent information leakage
const SANITIZED_ERROR_MESSAGES = {
  'ER_ACCESS_DENIED_ERROR': 'Database authentication failed.',
  'ECONNREFUSED': 'Service temporarily unavailable.',
  'ENOTFOUND': 'Service temporarily unavailable.',
  'DOCKER_ENGINE_UNAVAILABLE': 'Docker engine is unavailable.',
}

function sanitizeErrorForLogging(error) {
  if (!(error instanceof Error)) return String(error)
  // Remove potential sensitive data from error messages
  let message = error.message
  // Remove database passwords, tokens, etc.
  message = message.replace(/password['"]?\s*[:=]\s*['"]?[^'"\s]+/gi, 'password=***')
  message = message.replace(/token['"]?\s*[:=]\s*['"]?[^'"\s]+/gi, 'token=***')
  message = message.replace(/secret['"]?\s*[:=]\s*['"]?[^'"\s]+/gi, 'secret=***')
  message = message.replace(/key['"]?\s*[:=]\s*['"]?[^'"\s]+/gi, 'key=***')
  return message
}

function handleApiError(res, error, fallbackMessage = 'Internal server error.') {
  const requestId = res.getHeader('x-request-id') ?? 'unknown'
  const isDevelopment = !IS_PRODUCTION_MODE

  // Log full error internally (with sensitive data sanitized)
  const sanitizedMessage = sanitizeErrorForLogging(error)
  console.error('[api] request failed:', requestId, {
    message: sanitizedMessage,
    code: error?.code,
    stack: isDevelopment ? error?.stack : undefined,
  })

  // Determine safe client message
  let clientMessage = fallbackMessage
  if (error instanceof Error) {
    if (error.message.startsWith('validation:')) {
      // Validation errors are safe to show
      clientMessage = error.message.replace('validation:', '')
      res.status(400)
    } else if (SANITIZED_ERROR_MESSAGES[error.code]) {
      clientMessage = SANITIZED_ERROR_MESSAGES[error.code]
      res.status(503)
    } else {
      res.status(500)
    }
  } else {
    res.status(500)
  }

  res.json({
    error: clientMessage,
    requestId,
    timestamp: new Date().toISOString(),
  })
}

async function ensureDatabaseExists() {
  const dbName = ensureSafeDbName(DB_NAME)
  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
  })

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    )
  } finally {
    await connection.end()
  }
}

function createPool() {
  return mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: DB_CONN_LIMIT,
    charset: 'utf8mb4',
  })
}

async function sleep(ms) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function sanitizeProjectPathSegment(segment, fallback = 'item') {
  const normalized = String(segment ?? '').trim()
  if (!normalized || normalized === '.' || normalized === '..') {
    return fallback
  }

  const sanitized = normalized.replace(/[<>:"|?*\u0000-\u001f]/g, '_')
  return sanitized.length > 0 ? sanitized : fallback
}

function readProjectActorName(req) {
  return sanitizeString(readSingleHeader(req.headers['x-jb-user-name']), 120)
}

function normalizeProjectActorName(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function readProjectEditToken(req) {
  return readSingleHeader(req.headers['x-jb-project-edit-token']).trim()
}

function generateProjectEditToken(project) {
  return jwt.sign(
    {
      type: 'project-edit',
      projectId: Number(project.id),
      author: project.author,
    },
    JWT_SECRET,
    {
      issuer: JWT_ISSUER,
      audience: PROJECT_EDIT_TOKEN_AUDIENCE,
      expiresIn: PROJECT_EDIT_TOKEN_EXPIRATION,
    },
  )
}

function hasValidProjectEditToken(project, editToken) {
  if (!project || typeof editToken !== 'string' || !editToken.trim()) {
    return false
  }

  try {
    const decoded = jwt.verify(editToken, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: PROJECT_EDIT_TOKEN_AUDIENCE,
    })

    if (!decoded || typeof decoded !== 'object') {
      return false
    }

    return (
      decoded.type === 'project-edit' &&
      Number(decoded.projectId) === Number(project.id) &&
      normalizeProjectActorName(decoded.author) === normalizeProjectActorName(project.author)
    )
  } catch {
    return false
  }
}

function canManageProject(project, actorName, editToken) {
  if (hasValidProjectEditToken(project, editToken)) {
    return true
  }

  const normalizedActor = normalizeProjectActorName(actorName)
  const normalizedAuthor = normalizeProjectActorName(project?.author)
  return !IS_PRODUCTION_MODE && normalizedActor.length > 0 && normalizedAuthor.length > 0 && normalizedActor === normalizedAuthor
}

function hasProjectWriteAccess(req, project) {
  return canManageProject(project, readProjectActorName(req), readProjectEditToken(req))
}

function normalizeProjectRelativePath(inputPath, fallbackName = 'file') {
  const rawPath = typeof inputPath === 'string' && inputPath.trim() ? inputPath : fallbackName
  const segments = rawPath
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)

  if (segments.length === 0) {
    return sanitizeProjectPathSegment(fallbackName, 'file')
  }

  return segments
    .map((segment, index) =>
      sanitizeProjectPathSegment(segment, index === segments.length - 1 ? fallbackName : 'folder'),
    )
    .join('/')
}

function isRestrictedProjectFilePath(relativePath) {
  const normalizedPath = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalizedPath) {
    return false
  }

  const segments = normalizedPath.split('/').filter(Boolean)
  if (segments.length === 0) {
    return false
  }

  if (segments.some((segment) => RESTRICTED_PROJECT_PATH_SEGMENTS.has(segment.toLowerCase()))) {
    return true
  }

  const fileName = segments[segments.length - 1].toLowerCase()
  if (ALLOWED_PROJECT_HIDDEN_FILES.has(fileName)) {
    return false
  }

  return RESTRICTED_PROJECT_FILE_PATTERNS.some((pattern) => pattern.test(fileName))
}

function resolveProjectFileTarget(projectId, inputPath, fallbackName = 'file') {
  const projectDir = path.join(PROJECT_FILES_ROOT, String(projectId))
  const relativePath = normalizeProjectRelativePath(inputPath, fallbackName)
  const absolutePath = path.resolve(projectDir, relativePath)
  const relativeToProjectDir = path.relative(projectDir, absolutePath)

  if (relativeToProjectDir.startsWith('..') || path.isAbsolute(relativeToProjectDir)) {
    throw new Error('validation:Invalid file path.')
  }

  return {
    projectDir,
    absolutePath,
    relativePath: relativeToProjectDir.split(path.sep).join('/'),
  }
}

function normalizeUploadedRelativePaths(rawPaths) {
  if (Array.isArray(rawPaths)) {
    return rawPaths.map((entry) => String(entry))
  }

  if (typeof rawPaths === 'string' && rawPaths.trim()) {
    try {
      const parsed = JSON.parse(rawPaths)
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => String(entry))
      }
    } catch {
      return []
    }
  }

  return []
}

function isKnownTextFile(filePath) {
  const baseName = path.basename(filePath).toLowerCase()
  const extension = path.extname(baseName)
  return TEXT_FILE_NAMES.has(baseName) || TEXT_FILE_EXTENSIONS.has(extension)
}

function isProjectReadmeFileName(fileName) {
  return /^readme(?:\.[^.]+)?$/i.test(String(fileName ?? '').trim())
}

function rankProjectReadmeFileName(fileName) {
  const normalized = String(fileName ?? '').trim().toLowerCase()
  if (normalized === 'readme.md') {
    return 0
  }
  if (normalized === 'readme') {
    return 1
  }
  return 2
}

async function resolveProjectReadmeTarget(projectId) {
  const defaultTarget = resolveProjectFileTarget(projectId, 'README.md', 'README.md')

  try {
    const dirents = await fs.promises.readdir(defaultTarget.projectDir, { withFileTypes: true })
    const readmeEntry = dirents
      .filter((dirent) => dirent.isFile() && isProjectReadmeFileName(dirent.name))
      .sort((left, right) => {
        const rankDifference = rankProjectReadmeFileName(left.name) - rankProjectReadmeFileName(right.name)
        if (rankDifference !== 0) {
          return rankDifference
        }

        return left.name.localeCompare(right.name, 'en', { numeric: true, sensitivity: 'base' })
      })
      .at(0)

    if (!readmeEntry) {
      return defaultTarget
    }

    return resolveProjectFileTarget(projectId, readmeEntry.name, readmeEntry.name)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return defaultTarget
    }

    throw error
  }
}

async function listProjectFiles(projectDir, currentDir = projectDir) {
  let dirents
  try {
    dirents = await fs.promises.readdir(currentDir, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return []
    }
    throw error
  }

  const nodes = await Promise.all(
    dirents.map(async (dirent) => {
      const absolutePath = path.join(currentDir, dirent.name)
      const stats = await fs.promises.stat(absolutePath)
      const relativePath = path.relative(projectDir, absolutePath).split(path.sep).join('/')

      if (isRestrictedProjectFilePath(relativePath)) {
        return null
      }

      if (dirent.isDirectory()) {
        return {
          name: dirent.name,
          path: relativePath,
          type: 'folder',
          updatedAt: stats.mtime.toISOString(),
          children: await listProjectFiles(projectDir, absolutePath),
        }
      }

      return {
        name: dirent.name,
        path: relativePath,
        type: 'file',
        size: stats.size,
        updatedAt: stats.mtime.toISOString(),
      }
    }),
  )

  return nodes.filter(Boolean).sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === 'folder' ? -1 : 1
    }
    return left.name.localeCompare(right.name, 'ko-KR', { numeric: true, sensitivity: 'base' })
  })
}

async function readProjectFilePreview(absolutePath, stats) {
  const baseName = path.basename(absolutePath).toLowerCase()
  const extension = path.extname(baseName)
  const shouldInspectContents = isKnownTextFile(absolutePath) || extension.length === 0

  if (!shouldInspectContents) {
    return { isText: false, truncated: false, content: null }
  }

  const bytesToRead = Math.min(stats.size, MAX_TEXT_PREVIEW_BYTES)
  const handle = await fs.promises.open(absolutePath, 'r')

  try {
    const buffer = Buffer.alloc(bytesToRead)
    const { bytesRead } = await handle.read(buffer, 0, bytesToRead, 0)
    const previewBuffer = buffer.subarray(0, bytesRead)

    if (!isKnownTextFile(absolutePath) && previewBuffer.includes(0)) {
      return { isText: false, truncated: false, content: null }
    }

    return {
      isText: true,
      truncated: stats.size > MAX_TEXT_PREVIEW_BYTES,
      content: previewBuffer.toString('utf8'),
    }
  } finally {
    await handle.close()
  }
}

async function projectDirectoryHasFiles(projectDir) {
  let dirents
  try {
    dirents = await fs.promises.readdir(projectDir, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false
    }
    throw error
  }

  for (const dirent of dirents) {
    const absolutePath = path.join(projectDir, dirent.name)
    if (dirent.isFile()) {
      return true
    }
    if (dirent.isDirectory() && (await projectDirectoryHasFiles(absolutePath))) {
      return true
    }
  }

  return false
}

async function getDirectorySizeBytes(directoryPath) {
  let dirents
  try {
    dirents = await fs.promises.readdir(directoryPath, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return 0
    }
    throw error
  }

  let totalBytes = 0

  for (const dirent of dirents) {
    const absolutePath = path.join(directoryPath, dirent.name)

    if (dirent.isDirectory()) {
      totalBytes += await getDirectorySizeBytes(absolutePath)
      continue
    }

    if (dirent.isFile()) {
      const stats = await fs.promises.stat(absolutePath)
      totalBytes += stats.size
    }
  }

  return totalBytes
}

async function getExistingProjectPathSizeBytes(absolutePath) {
  try {
    const stats = await fs.promises.stat(absolutePath)
    if (stats.isDirectory()) {
      throw new Error('validation:File path conflicts with an existing folder.')
    }

    return stats.isFile() ? stats.size : 0
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return 0
    }

    throw error
  }
}

async function ensureProjectStorageLimit(projectId, plannedWrites) {
  const projectDir = path.join(PROJECT_FILES_ROOT, String(projectId))
  const currentTotalBytes = await getDirectorySizeBytes(projectDir)
  const plannedPathSizes = new Map()
  let totalDeltaBytes = 0

  for (const plannedWrite of plannedWrites) {
    const relativePath = plannedWrite?.target?.relativePath
    if (!relativePath) {
      continue
    }

    const previousSize = plannedPathSizes.has(relativePath)
      ? plannedPathSizes.get(relativePath)
      : await getExistingProjectPathSizeBytes(plannedWrite.target.absolutePath)

    totalDeltaBytes += Number(plannedWrite.sizeBytes ?? 0) - Number(previousSize ?? 0)
    plannedPathSizes.set(relativePath, Number(plannedWrite.sizeBytes ?? 0))
  }

  if (currentTotalBytes + totalDeltaBytes > MAX_PROJECT_FILE_STORAGE_BYTES) {
    throw new Error('validation:Project file storage limit exceeded. Each project can store up to 1GB.')
  }
}

async function removeEmptyProjectDirectories(projectDir, startDirectory) {
  const resolvedProjectDir = path.resolve(projectDir)
  let currentDirectory = path.resolve(startDirectory)

  while (
    currentDirectory.startsWith(resolvedProjectDir) &&
    currentDirectory !== resolvedProjectDir
  ) {
    const entries = await fs.promises.readdir(currentDirectory)
    if (entries.length > 0) {
      break
    }

    await fs.promises.rmdir(currentDirectory)
    currentDirectory = path.dirname(currentDirectory)
  }
}

function buildDefaultProjectReadme(project) {
  const description = sanitizeString(project?.description, 20000) || 'Project overview will be added here.'
  const author = sanitizeString(project?.author, 120) || 'Unknown'
  const department = sanitizeString(project?.department, 120) || 'Unknown'
  const tags = Array.isArray(project?.tags) ? project.tags.map((tag) => sanitizeString(tag, 80)).filter(Boolean) : []
  const tagSection = tags.length > 0 ? tags.map((tag) => `- ${tag}`).join('\n') : '- general'

  return `# ${sanitizeString(project?.title, 200) || 'Untitled Project'}

## Overview
${description}

## Ownership
- Author: ${author}
- Department: ${department}

## Tags
${tagSection}
`
}

function sanitizeProjectReadmeContent(input, fallbackContent) {
  const rawValue = typeof input === 'string' ? input : ''
  const normalized = rawValue
    .replace(/\r\n/g, '\n')
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
    .slice(0, MAX_PROJECT_README_CHAR_COUNT)
    .trim()

  if (!normalized) {
    return fallbackContent
  }

  return normalized
}

async function readProjectReadmeDocument(project) {
  const target = await resolveProjectReadmeTarget(project?.id)

  try {
    const stats = await fs.promises.stat(target.absolutePath)
    if (!stats.isFile()) {
      throw new Error('validation:README is only available for files.')
    }

    const content = await fs.promises.readFile(target.absolutePath, 'utf8')
    return {
      name: path.basename(target.absolutePath),
      path: target.relativePath,
      content,
      size: stats.size,
      updatedAt: stats.mtime.toISOString(),
      exists: true,
      isGenerated: false,
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error
    }

    const content = buildDefaultProjectReadme(project)
    return {
      name: 'README.md',
      path: 'README.md',
      content,
      size: Buffer.byteLength(content, 'utf8'),
      updatedAt: null,
      exists: false,
      isGenerated: true,
    }
  }
}

async function ensureProjectHasDefaultFiles(project) {
  const projectId = Number(project?.id)
  if (!Number.isFinite(projectId) || projectId <= 0) {
    throw new Error('validation:Invalid project id.')
  }

  const projectDir = path.join(PROJECT_FILES_ROOT, String(projectId))
  if (await projectDirectoryHasFiles(projectDir)) {
    return
  }

  const target = resolveProjectFileTarget(projectId, 'README.md', 'README.md')
  await fs.promises.mkdir(target.projectDir, { recursive: true })
  await fs.promises.writeFile(target.absolutePath, buildDefaultProjectReadme(project), 'utf8')
}

async function deleteProjectFiles(projectId) {
  await fs.promises.rm(path.join(PROJECT_FILES_ROOT, String(projectId)), {
    recursive: true,
    force: true,
  })
}

async function deleteProjectById(pool, projectId) {
  const normalizedProjectId = Number(projectId)
  if (!Number.isFinite(normalizedProjectId) || normalizedProjectId <= 0) {
    return 0
  }

  const [result] = await pool.query('DELETE FROM projects WHERE id = ?', [normalizedProjectId])
  const affectedRows = Number(result?.affectedRows ?? 0)

  if (affectedRows > 0) {
    await deleteProjectFiles(normalizedProjectId)
  }

  return affectedRows
}

async function cleanupProjectsWithoutFiles(pool) {
  const [rows] = await pool.query('SELECT id, title, author FROM projects ORDER BY id')
  const deleted = []

  for (const row of rows) {
    const hasFiles = await projectDirectoryHasFiles(path.join(PROJECT_FILES_ROOT, String(row.id)))
    if (hasFiles) {
      continue
    }

    await deleteProjectById(pool, row.id)
    deleted.push({
      id: Number(row.id),
      title: String(row.title ?? ''),
      author: String(row.author ?? ''),
    })
  }

  if (deleted.length > 0) {
    console.warn(
      `[api] deleted ${deleted.length} projects without files: ${deleted.map((project) => `${project.id}:${project.title}`).join(', ')}`,
    )
  }

  return {
    deletedCount: deleted.length,
    deleted,
  }
}

async function createPoolWithRetry() {
  let lastError

  for (let attempt = 1; attempt <= DB_CONNECT_RETRY_ATTEMPTS; attempt += 1) {
    try {
      await ensureDatabaseExists()
      const pool = createPool()
      await pool.query('SELECT 1 AS ok')
      if (attempt > 1) {
        console.log(`[api] connected to mysql after ${attempt} attempts`)
      }
      return pool
    } catch (error) {
      lastError = error
      console.warn(
        `[api] mysql connection attempt ${attempt}/${DB_CONNECT_RETRY_ATTEMPTS} failed. retrying in ${DB_CONNECT_RETRY_DELAY_MS}ms`,
      )
      await sleep(DB_CONNECT_RETRY_DELAY_MS)
    }
  }

  throw lastError
}

async function ensureSchema(pool) {
  // Projects table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      author VARCHAR(120) NOT NULL,
      department VARCHAR(120) NOT NULL,
      stars INT NOT NULL DEFAULT 0,
      forks INT NOT NULL DEFAULT 0,
      comments INT NOT NULL DEFAULT 0,
      views INT NOT NULL DEFAULT 0,
      tags JSON NOT NULL,
      created_at_label VARCHAR(64) NULL,
      is_new TINYINT(1) NOT NULL DEFAULT 0,
      trend VARCHAR(64) NULL,
      badge VARCHAR(64) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_department (department),
      INDEX idx_stars (stars),
      INDEX idx_views (views),
      INDEX idx_created_at (created_at),
      INDEX idx_author (author),
      INDEX idx_is_new (is_new),
      INDEX idx_updated_at (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  // Admin users table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      username VARCHAR(50) NOT NULL UNIQUE,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('super_admin', 'admin', 'moderator') NOT NULL DEFAULT 'admin',
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      last_login_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_username (username),
      INDEX idx_email (email),
      INDEX idx_role (role)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  // Audit logs table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      action VARCHAR(100) NOT NULL,
      entity_type VARCHAR(50) NULL,
      entity_id BIGINT UNSIGNED NULL,
      details JSON NULL,
      admin_user_id INT UNSIGNED NULL,
      ip_address VARCHAR(45) NULL,
      user_agent VARCHAR(500) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_action (action),
      INDEX idx_entity (entity_type, entity_id),
      INDEX idx_admin (admin_user_id),
      INDEX idx_created_at (created_at),
      INDEX idx_created_at_for_cleanup (created_at),
      FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS docker_images (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      project_id BIGINT UNSIGNED NOT NULL,
      uploader_name VARCHAR(120) NOT NULL,
      original_file_name VARCHAR(255) NOT NULL,
      tar_path VARCHAR(500) NOT NULL,
      image_name VARCHAR(255) NOT NULL,
      image_tag VARCHAR(120) NULL,
      image_reference VARCHAR(255) NULL,
      image_id VARCHAR(200) NULL,
      size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
      layers INT UNSIGNED NOT NULL DEFAULT 0,
      architecture VARCHAR(64) NULL,
      exposed_ports JSON NULL,
      environment_file_name VARCHAR(255) NULL,
      environment_file_path VARCHAR(500) NULL,
      compose_file_name VARCHAR(255) NULL,
      compose_file_path VARCHAR(500) NULL,
      compose_services JSON NULL,
      load_status VARCHAR(32) NOT NULL DEFAULT 'uploaded',
      load_output TEXT NULL,
      load_error TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_docker_images_project (project_id),
      INDEX idx_docker_images_uploader (uploader_name),
      INDEX idx_docker_images_reference (image_reference),
      INDEX idx_docker_images_image_id (image_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  for (const migrationSql of [
    'ALTER TABLE docker_images ADD COLUMN environment_file_name VARCHAR(255) NULL AFTER exposed_ports',
    'ALTER TABLE docker_images ADD COLUMN environment_file_path VARCHAR(500) NULL AFTER environment_file_name',
    'ALTER TABLE docker_images ADD COLUMN compose_file_name VARCHAR(255) NULL AFTER environment_file_path',
    'ALTER TABLE docker_images ADD COLUMN compose_file_path VARCHAR(500) NULL AFTER compose_file_name',
    'ALTER TABLE docker_images ADD COLUMN compose_services JSON NULL AFTER compose_file_path',
  ]) {
    try {
      await pool.query(migrationSql)
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME') {
        throw error
      }
    }
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS docker_deployments (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      project_id BIGINT UNSIGNED NOT NULL,
      image_id BIGINT UNSIGNED NOT NULL,
      uploader_name VARCHAR(120) NOT NULL,
      container_name VARCHAR(255) NULL,
      container_id VARCHAR(128) NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'creating',
      host_port INT UNSIGNED NULL,
      container_port VARCHAR(32) NULL,
      endpoint_url VARCHAR(255) NULL,
      run_output TEXT NULL,
      error_message TEXT NULL,
      started_at TIMESTAMP NULL,
      stopped_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_docker_deployments_project (project_id),
      INDEX idx_docker_deployments_image (image_id),
      INDEX idx_docker_deployments_uploader (uploader_name),
      INDEX idx_docker_deployments_status (status),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (image_id) REFERENCES docker_images(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS docker_build_jobs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      project_id BIGINT UNSIGNED NOT NULL,
      uploader_name VARCHAR(120) NOT NULL,
      source_file_name VARCHAR(255) NOT NULL,
      source_archive_path VARCHAR(500) NOT NULL,
      dockerfile_path VARCHAR(255) NOT NULL DEFAULT 'Dockerfile',
      context_path VARCHAR(255) NOT NULL DEFAULT '.',
      image_name VARCHAR(255) NULL,
      image_tag VARCHAR(120) NULL,
      requested_container_port VARCHAR(32) NULL,
      preferred_host_port INT UNSIGNED NULL,
      environment_file_name VARCHAR(255) NULL,
      environment_file_path VARCHAR(500) NULL,
      runtime_environment JSON NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'queued',
      build_output LONGTEXT NULL,
      error_message TEXT NULL,
      image_record_id BIGINT UNSIGNED NULL,
      deployment_id BIGINT UNSIGNED NULL,
      started_at TIMESTAMP NULL,
      finished_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_docker_build_jobs_project (project_id),
      INDEX idx_docker_build_jobs_status (status),
      INDEX idx_docker_build_jobs_image_record (image_record_id),
      INDEX idx_docker_build_jobs_deployment (deployment_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (image_record_id) REFERENCES docker_images(id) ON DELETE SET NULL,
      FOREIGN KEY (deployment_id) REFERENCES docker_deployments(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

// Seed default admin user
async function seedAdminUser(pool) {
  const [rows] = await pool.query('SELECT COUNT(*) AS count FROM admin_users')
  const count = Number(rows[0]?.count ?? 0)

  if (count > 0) {
    return
  }

  const passwordHash = await hashPassword(ADMIN_PASSWORD)
  const defaultAdminEmail = ADMIN_EMAIL

  await pool.execute(
    `INSERT INTO admin_users (username, email, password_hash, role)
     VALUES (?, ?, ?, 'super_admin')`,
    [ADMIN_USERNAME, defaultAdminEmail, passwordHash]
  )

  console.log(`[api] seeded default admin user: ${ADMIN_USERNAME}`)
}

async function seedIfEmpty(pool) {
  const [countRows] = await pool.query('SELECT COUNT(*) AS count FROM projects')
  const existingCount = Number(countRows[0]?.count ?? 0)
  if (existingCount > 0) {
    return
  }

  const insertSql = `
    INSERT INTO projects (
      title,
      description,
      author,
      department,
      stars,
      forks,
      comments,
      views,
      tags,
      created_at_label,
      is_new,
      trend,
      badge
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `

  for (const project of seedProjects) {
    const normalized = normalizeInputProject(project)
    const [result] = await pool.execute(insertSql, [
      normalized.title,
      normalized.description,
      normalized.author,
      normalized.department,
      normalized.stars,
      normalized.forks,
      normalized.comments,
      normalized.views,
      JSON.stringify(normalized.tags),
      normalized.createdAt,
      normalized.isNew ? 1 : 0,
      normalized.trend,
      normalized.badge,
    ])

    await ensureProjectHasDefaultFiles({
      id: Number(result.insertId),
      title: normalized.title,
      description: normalized.description,
      author: normalized.author,
      department: normalized.department,
      tags: normalized.tags,
    })
  }

  console.log(`[api] seeded ${seedProjects.length} projects`)
}

async function getAllProjects(pool, filter = {}) {
  const whereClauses = ['1=1']
  const params = []
  const normalized = normalizeProjectQuery(filter)

  if (normalized.search.length > 0) {
    const likeValue = `%${normalized.search}%`
    whereClauses.push(
      '(title LIKE ? OR description LIKE ? OR author LIKE ? OR department LIKE ? OR JSON_SEARCH(tags, "one", ?) IS NOT NULL)',
    )
    params.push(likeValue, likeValue, likeValue, likeValue, likeValue)
  }

  if (normalized.department.length > 0 && normalized.department !== 'all') {
    whereClauses.push('department = ?')
    params.push(normalized.department)
  }

  if (normalized.minStars > 0) {
    whereClauses.push('stars >= ?')
    params.push(normalized.minStars)
  }

  const sql = `
    SELECT
      id,
      title,
      description,
      author,
      department,
      stars,
      forks,
      comments,
      views,
      tags,
      created_at_label,
      is_new,
      trend,
      badge
    FROM projects
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY ${resolveSortQuery(normalized.sortBy)}
    ${normalized.limit > 0 ? 'LIMIT ? OFFSET ?' : ''}
  `

  if (normalized.limit > 0) {
    params.push(normalized.limit)
    params.push(normalized.offset)
  }

  const [rows] = await pool.query(sql, params)
  return rows.map(toProjectDto)
}

async function getProjectById(pool, projectId) {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        title,
        description,
        author,
        department,
        stars,
        forks,
        comments,
        views,
        tags,
        created_at_label,
        is_new,
        trend,
        badge
      FROM projects
      WHERE id = ?
      LIMIT 1
    `,
    [projectId],
  )

  if (!rows[0]) {
    return null
  }

  return toProjectDto(rows[0])
}

async function insertProject(pool, inputProject) {
  const normalized = normalizeInputProject(inputProject)
  const [result] = await pool.execute(
    `
      INSERT INTO projects (
        title,
        description,
        author,
        department,
        stars,
        forks,
        comments,
        views,
        tags,
        created_at_label,
        is_new,
        trend,
        badge
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      normalized.title,
      normalized.description,
      normalized.author,
      normalized.department,
      normalized.stars,
      normalized.forks,
      normalized.comments,
      normalized.views,
      JSON.stringify(normalized.tags),
      normalized.createdAt,
      normalized.isNew ? 1 : 0,
      normalized.trend,
      normalized.badge,
    ],
  )

  const projectId = Number(result.insertId)

  try {
    await ensureProjectHasDefaultFiles({
      id: projectId,
      title: normalized.title,
      description: normalized.description,
      author: normalized.author,
      department: normalized.department,
      tags: normalized.tags,
    })
  } catch (error) {
    await deleteProjectById(pool, projectId)
    throw error
  }

  return getProjectById(pool, projectId)
}

function buildProjectInsights(projects) {
  const departmentMap = new Map()
  const authorMap = new Map()
  const tagMap = new Map()

  for (const project of projects) {
    const departmentEntry = departmentMap.get(project.department) ?? {
      projects: 0,
      stars: 0,
      views: 0,
      contributors: new Set(),
    }
    departmentEntry.projects += 1
    departmentEntry.stars += project.stars
    departmentEntry.views += project.views
    departmentEntry.contributors.add(project.author)
    departmentMap.set(project.department, departmentEntry)

    const authorEntry = authorMap.get(project.author) ?? { projects: 0, stars: 0, forks: 0, views: 0 }
    authorEntry.projects += 1
    authorEntry.stars += project.stars
    authorEntry.forks += project.forks
    authorEntry.views += project.views
    authorMap.set(project.author, authorEntry)

    for (const tag of project.tags) {
      tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1)
    }
  }

  const topDepartments = Array.from(departmentMap.entries())
    .map(([name, value]) => ({
      name,
      projects: value.projects,
      stars: value.stars,
      views: value.views,
      contributors: value.contributors.size,
    }))
    .sort((a, b) => b.stars * 2 + b.views / 100 - (a.stars * 2 + a.views / 100))
    .slice(0, 12)

  const topContributors = Array.from(authorMap.entries())
    .map(([name, value]) => ({ name, ...value }))
    .sort((a, b) => b.stars * 2 + b.views / 120 - (a.stars * 2 + a.views / 120))
    .slice(0, 12)

  const topTags = Array.from(tagMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 16)

  const projectRanking = [...projects]
    .map((project) => {
      const score =
        project.stars * 3 +
        project.forks * 2 +
        project.comments * 2 +
        project.views / 100 +
        (project.isNew ? 6 : 0) +
        (project.trend === 'rising' ? 8 : 0)
      return {
        id: project.id,
        title: project.title,
        author: project.author,
        department: project.department,
        stars: project.stars,
        forks: project.forks,
        views: project.views,
        score: Math.round(score),
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((entry, index) => ({ ...entry, rank: index + 1 }))

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalProjects: projects.length,
      totalStars: projects.reduce((sum, project) => sum + project.stars, 0),
      totalViews: projects.reduce((sum, project) => sum + project.views, 0),
      totalComments: projects.reduce((sum, project) => sum + project.comments, 0),
      totalForks: projects.reduce((sum, project) => sum + project.forks, 0),
    },
    topDepartments,
    topContributors,
    topTags,
    projectRanking,
  }
}

function createInsightsRouter(pool) {
  const router = express.Router()

  router.get('/projects/insights', async (req, res) => {
    try {
      const projects = await getAllProjects(pool, req.query)
      res.json({ insights: buildProjectInsights(projects) })
    } catch (error) {
      handleApiError(res, error, 'Failed to build project insights.')
    }
  })

  router.get('/rankings', async (req, res) => {
    try {
      const projects = await getAllProjects(pool, req.query)
      const insights = buildProjectInsights(projects)
      res.json({
        rankings: {
          projects: insights.projectRanking,
          contributors: insights.topContributors,
          departments: insights.topDepartments,
        },
      })
    } catch (error) {
      handleApiError(res, error, 'Failed to fetch rankings.')
    }
  })

  return router
}

// ========================================
// Admin API Router
// ========================================

function createAdminRouter(pool) {
  const router = express.Router()

  // Admin login
  router.post('/login', async (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown'

    // Check IP lockout
    if (isIpLocked(ip)) {
      return res.status(429).json({
        error: 'Too many login attempts',
        message: 'Account locked. Try again later.',
        retryAfter: Math.ceil((loginAttempts.get(ip)?.lockedUntil - Date.now()) / 1000),
      })
    }

    const { username, password } = req.body || {}

    if (!username || !password) {
      recordLoginAttempt(ip, false)
      return res.status(400).json({
        error: 'Username and password required',
      })
    }

    try {
      // Find admin user
      const [users] = await pool.query(
        'SELECT id, username, email, password_hash, role, is_active FROM admin_users WHERE username = ?',
        [username]
      )

      const user = users[0]

      if (!user) {
        recordLoginAttempt(ip, false)
        // Create audit log for failed login attempt
        await createAuditLog(pool, 'LOGIN_FAILED', {
          username,
          ip: maskIpAddress(ip),
          reason: 'user_not_found',
        })
        return res.status(401).json({
          error: 'Invalid credentials',
        })
      }

      if (!user.is_active) {
        recordLoginAttempt(ip, false)
        await createAuditLog(pool, 'LOGIN_FAILED', {
          username,
          ip: maskIpAddress(ip),
          reason: 'account_inactive',
          adminUserId: user.id,
        })
        return res.status(403).json({
          error: 'Account is inactive',
        })
      }

      // Verify password
      const passwordValid = await comparePassword(password, user.password_hash)

      if (!passwordValid) {
        recordLoginAttempt(ip, false)
        await createAuditLog(pool, 'LOGIN_FAILED', {
          username,
          ip: maskIpAddress(ip),
          reason: 'invalid_password',
          adminUserId: user.id,
        })
        return res.status(401).json({
          error: 'Invalid credentials',
        })
      }

      // Successful login
      recordLoginAttempt(ip, true)

      // Update last login
      await pool.query('UPDATE admin_users SET last_login_at = NOW() WHERE id = ?', [user.id])

      // Generate tokens
      const accessToken = generateAccessToken({
        userId: user.id,
        username: user.username,
        role: user.role,
      })

      const refreshToken = generateRefreshToken({
        userId: user.id,
        username: user.username,
        role: user.role,
      })

      // Create admin session
      const sessionId = randomUUID()
      adminSessions.set(sessionId, {
        userId: user.id,
        username: user.username,
        role: user.role,
        createdAt: Date.now(),
        lastActivity: Date.now(),
      })

      // Create audit log
      await createAuditLog(pool, 'LOGIN_SUCCESS', {
        username,
        ip: maskIpAddress(ip),
        adminUserId: user.id,
      })

      res.json({
        accessToken,
        refreshToken,
        sessionId,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
        },
      })
    } catch (error) {
      console.error('[admin] login error:', error)
      handleApiError(res, error, 'Login failed')
    }
  })

  // Refresh token
  router.post('/refresh', async (req, res) => {
    const { refreshToken: token } = req.body || {}

    if (!token) {
      return res.status(400).json({
        error: 'Refresh token required',
      })
    }

    try {
      const decoded = verifyToken(token)

      if (!decoded || !decoded.tokenId) {
        return res.status(401).json({
          error: 'Invalid refresh token',
        })
      }

      // Check if refresh token exists
      const storedToken = refreshTokens.get(decoded.tokenId)

      if (!storedToken) {
        return res.status(401).json({
          error: 'Refresh token expired or invalid',
        })
      }

      if (storedToken.expiresAt <= Date.now()) {
        refreshTokens.delete(decoded.tokenId)
        return res.status(401).json({
          error: 'Refresh token expired or invalid',
        })
      }

      if (storedToken.userId !== decoded.userId || storedToken.username !== decoded.username) {
        refreshTokens.delete(decoded.tokenId)
        return res.status(401).json({
          error: 'Refresh token is invalid',
        })
      }

      // Rotate refresh token to reduce replay window.
      refreshTokens.delete(decoded.tokenId)
      const refreshToken = generateRefreshToken({
        userId: storedToken.userId,
        username: storedToken.username,
        role: storedToken.role || decoded.role,
      })

      // Generate new access token
      const accessToken = generateAccessToken({
        userId: storedToken.userId,
        username: storedToken.username,
        role: storedToken.role || decoded.role,
      })

      res.json({ accessToken, refreshToken })
    } catch (error) {
      handleApiError(res, error, 'Token refresh failed')
    }
  })

  // Logout
  router.post('/logout', authenticateJWT, async (req, res) => {
    const sessionHeader = req.headers['x-admin-session']
    const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader
    const refreshToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : null

    if (sessionId) {
      adminSessions.delete(sessionId)
    }

    if (refreshToken) {
      const decoded = verifyToken(refreshToken)
      if (decoded?.tokenId) {
        refreshTokens.delete(decoded.tokenId)
      }
    }

    // Create audit log
    await createAuditLog(pool, 'LOGOUT', {
      username: req.user.username,
      adminUserId: req.user.userId,
    })

    res.json({ message: 'Logged out successfully' })
  })

  // Get current admin user info
  router.get('/me', authenticateJWT, validateAdminSession, async (req, res) => {
    try {
      const [users] = await pool.query(
        'SELECT id, username, email, role, is_active, last_login_at, created_at FROM admin_users WHERE id = ?',
        [req.user.userId]
      )

      const user = users[0]

      if (!user) {
        return res.status(404).json({
          error: 'User not found',
        })
      }

      res.json({ user })
    } catch (error) {
      handleApiError(res, error, 'Failed to fetch user info')
    }
  })

  attachSignupPlatformAdminRoutes(router, pool, {
    authenticateJWT,
    requireAdmin,
    validateAdminSession,
    handleApiError,
    createAuditLog,
  })
  attachAdminSiteContentRoutes(router, pool, {
    authenticateJWT,
    requireAdmin,
    handleApiError,
    createAuditLog,
  })

  // ========================================
  // Protected Admin Routes (require authentication)
  // ========================================

  // Projects management
  router.get('/projects', authenticateJWT, requireAdmin, async (req, res) => {
    try {
      const projects = await getAllProjects(pool, req.query)
      res.json({ projects, meta: { count: projects.length } })
    } catch (error) {
      handleApiError(res, error, 'Failed to fetch projects')
    }
  })

  router.post('/projects', authenticateJWT, requireAdmin, async (req, res) => {
    try {
      const project = await insertProject(pool, req.body ?? {})
      if (!project) {
        res.status(500).json({ error: 'Failed to create project' })
        return
      }

      await createAuditLog(pool, 'PROJECT_CREATED', {
        projectId: project.id,
        projectTitle: project.title,
        adminUserId: req.user.userId,
      })

      res.status(201).json({ project })
    } catch (error) {
      handleApiError(res, error, 'Failed to create project')
    }
  })

  router.delete('/projects/:id', authenticateJWT, requireAdmin, async (req, res) => {
    const projectId = Number.parseInt(String(req.params.id), 10)

    if (!Number.isFinite(projectId) || projectId <= 0) {
      return res.status(400).json({
        error: 'Invalid project ID',
      })
    }

    try {
      // Get project before deletion for audit log
      const [projects] = await pool.query('SELECT * FROM projects WHERE id = ?', [projectId])
      const project = projects[0]

      if (!project) {
        return res.status(404).json({
          error: 'Project not found',
        })
      }

      // Delete project and its file storage
      await deleteProjectById(pool, projectId)

      // Create audit log
      await createAuditLog(pool, 'PROJECT_DELETED', {
        projectId,
        projectTitle: project.title,
        adminUserId: req.user.userId,
      })

      res.json({ message: 'Project deleted successfully' })
    } catch (error) {
      handleApiError(res, error, 'Failed to delete project')
    }
  })

  router.put('/projects/:id', authenticateJWT, requireAdmin, async (req, res) => {
    const projectId = Number.parseInt(String(req.params.id), 10)

    if (!Number.isFinite(projectId) || projectId <= 0) {
      return res.status(400).json({
        error: 'Invalid project ID',
      })
    }

    try {
      const normalized = normalizeInputProject(req.body || {})

      const [result] = await pool.execute(
        `UPDATE projects
         SET title = ?, description = ?, author = ?, department = ?,
             stars = ?, forks = ?, comments = ?, views = ?,
             tags = ?, created_at_label = ?, is_new = ?, trend = ?, badge = ?
         WHERE id = ?`,
        [
          normalized.title,
          normalized.description,
          normalized.author,
          normalized.department,
          normalized.stars,
          normalized.forks,
          normalized.comments,
          normalized.views,
          JSON.stringify(normalized.tags),
          normalized.createdAt,
          normalized.isNew ? 1 : 0,
          normalized.trend,
          normalized.badge,
          projectId,
        ]
      )

      if (result.affectedRows === 0) {
        return res.status(404).json({
          error: 'Project not found',
        })
      }

      const updated = await getProjectById(pool, projectId)

      // Create audit log
      await createAuditLog(pool, 'PROJECT_UPDATED', {
        projectId,
        projectTitle: normalized.title,
        adminUserId: req.user.userId,
      })

      res.json({ project: updated })
    } catch (error) {
      handleApiError(res, error, 'Failed to update project')
    }
  })

  // Audit logs
  router.get('/audit-logs', authenticateJWT, requireAdmin, async (req, res) => {
    try {
      const filters = {
        action: req.query.action,
        adminUserId: req.query.adminUserId ? Number(req.query.adminUserId) : null,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        limit: req.query.limit ? Number(req.query.limit) : 100,
        offset: req.query.offset ? Number(req.query.offset) : 0,
      }

      const logs = await getAuditLogs(pool, filters)

      res.json({ logs, meta: { count: logs.length } })
    } catch (error) {
      handleApiError(res, error, 'Failed to fetch audit logs')
    }
  })

  // Admin users management
  router.get('/users', authenticateJWT, requireAdmin, async (req, res) => {
    try {
      const [users] = await pool.query(
        `SELECT id, username, email, role, is_active, last_login_at, created_at
         FROM admin_users
         ORDER BY created_at DESC`
      )

      // Remove password hash from response
      const safeUsers = users.map(({ password_hash, ...user }) => user)

      res.json({ users: safeUsers })
    } catch (error) {
      handleApiError(res, error, 'Failed to fetch admin users')
    }
  })

  router.post('/users', authenticateJWT, requireAdmin, async (req, res) => {
    const { username, email, password, role = 'admin' } = req.body || {}

    if (!username || !email || !password) {
      return res.status(400).json({
        error: 'Username, email, and password are required',
      })
    }

    if (!['super_admin', 'admin', 'moderator'].includes(role)) {
      return res.status(400).json({
        error: 'Invalid role',
      })
    }

    try {
      const passwordHash = await hashPassword(password)

      const [result] = await pool.execute(
        `INSERT INTO admin_users (username, email, password_hash, role)
         VALUES (?, ?, ?, ?)`,
        [username, email, passwordHash, role]
      )

      // Create audit log
      await createAuditLog(pool, 'ADMIN_USER_CREATED', {
        createdUserId: result.insertId,
        username,
        role,
        adminUserId: req.user.userId,
      })

      res.status(201).json({
        message: 'Admin user created',
        userId: result.insertId,
      })
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          error: 'Username or email already exists',
        })
      }
      handleApiError(res, error, 'Failed to create admin user')
    }
  })

  // Update admin user
  router.patch('/users/:id', authenticateJWT, requireAdmin, async (req, res) => {
    const userId = Number.parseInt(String(req.params.id), 10)

    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({
        error: 'Invalid user ID',
      })
    }

    const { username, email, password, role, is_active } = req.body || {}

    if (!username && !email && !password && !role && is_active === undefined) {
      return res.status(400).json({
        error: 'At least one field must be provided',
      })
    }

    try {
      const updates = []
      const values = []

      if (username) {
        updates.push('username = ?')
        values.push(username)
      }

      if (email) {
        updates.push('email = ?')
        values.push(email)
      }

      if (password) {
        const passwordHash = await hashPassword(password)
        updates.push('password_hash = ?')
        values.push(passwordHash)
      }

      if (role) {
        if (!['super_admin', 'admin', 'moderator'].includes(role)) {
          return res.status(400).json({
            error: 'Invalid role',
          })
        }
        updates.push('role = ?')
        values.push(role)
      }

      if (is_active !== undefined) {
        updates.push('is_active = ?')
        values.push(is_active ? 1 : 0)
      }

      if (updates.length === 0) {
        return res.status(400).json({
          error: 'No valid fields to update',
        })
      }

      values.push(userId)

      const [result] = await pool.query(
        `UPDATE admin_users SET ${updates.join(', ')} WHERE id = ?`,
        values
      )

      if (result.affectedRows === 0) {
        return res.status(404).json({
          error: 'User not found',
        })
      }

      // Create audit log
      await createAuditLog(pool, 'ADMIN_USER_UPDATED', {
        updatedUserId: userId,
        updates: Object.keys(req.body || {}),
        adminUserId: req.user.userId,
      })

      res.json({
        message: 'Admin user updated successfully',
      })
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          error: 'Username or email already exists',
        })
      }
      handleApiError(res, error, 'Failed to update admin user')
    }
  })

  // Delete admin user
  router.delete('/users/:id', authenticateJWT, requireAdmin, async (req, res) => {
    const userId = Number.parseInt(String(req.params.id), 10)

    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({
        error: 'Invalid user ID',
      })
    }

    // Prevent deleting yourself
    if (userId === req.user.userId) {
      return res.status(400).json({
        error: 'Cannot delete your own account',
      })
    }

    try {
      // Get user info before deletion
      const [users] = await pool.query('SELECT username FROM admin_users WHERE id = ?', [userId])
      const user = users[0]

      if (!user) {
        return res.status(404).json({
          error: 'User not found',
        })
      }

      await pool.query('DELETE FROM admin_users WHERE id = ?', [userId])

      // Create audit log
      await createAuditLog(pool, 'ADMIN_USER_DELETED', {
        deletedUserId: userId,
        username: user.username,
        adminUserId: req.user.userId,
      })

      res.json({
        message: 'Admin user deleted successfully',
      })
    } catch (error) {
      handleApiError(res, error, 'Failed to delete admin user')
    }
  })

  // Dashboard stats
  router.get('/stats', authenticateJWT, requireAdmin, async (req, res) => {
    try {
      const [projectCount] = await pool.query('SELECT COUNT(*) AS count FROM projects')
      const [adminCount] = await pool.query('SELECT COUNT(*) AS count FROM admin_users')
      const [auditCount] = await pool.query('SELECT COUNT(*) AS count FROM audit_logs')
      const [dockerImageCount] = await pool.query('SELECT COUNT(*) AS count FROM docker_images')
      const [deploymentCount] = await pool.query('SELECT COUNT(*) AS count FROM docker_deployments')
      const [recentLogs] = await pool.query(
        'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 10'
      )

      res.json({
        stats: {
          totalProjects: projectCount[0]?.count || 0,
          totalAdmins: adminCount[0]?.count || 0,
          totalAuditLogs: auditCount[0]?.count || 0,
          totalDockerImages: dockerImageCount[0]?.count || 0,
          totalDeployments: deploymentCount[0]?.count || 0,
        },
        recentLogs,
      })
    } catch (error) {
      handleApiError(res, error, 'Failed to fetch admin stats')
    }
  })

  // Clean up old audit logs (manual trigger)
  router.post('/cleanup-audit-logs', authenticateJWT, requireAdmin, async (req, res) => {
    try {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - AUDIT_LOG_RETENTION_DAYS)

      const [result] = await pool.query(
        'DELETE FROM audit_logs WHERE created_at < ?',
        [cutoffDate]
      )

      // Create audit log
      await createAuditLog(pool, 'AUDIT_LOG_CLEANUP', {
        deletedCount: result.affectedRows,
        cutoffDate: cutoffDate.toISOString(),
        adminUserId: req.user.userId,
      })

      res.json({
        message: 'Audit logs cleaned up',
        deletedCount: result.affectedRows,
      })
    } catch (error) {
      handleApiError(res, error, 'Failed to cleanup audit logs')
    }
  })

  // System configuration
  router.get('/config', authenticateJWT, requireAdmin, async (req, res) => {
    try {
      // Return safe configuration values (no sensitive data)
      const safeConfig = [
        { key: 'API_PORT', value: String(API_PORT), description: 'API 서버 포트', type: 'number', category: 'general', requiresRestart: true },
        { key: 'NODE_ENV', value: process.env.NODE_ENV || 'development', description: '실행 환경', type: 'text', category: 'general', requiresRestart: true },
        { key: 'API_RATE_LIMIT_WINDOW_MS', value: String(RATE_LIMIT_WINDOW_MS), description: 'Rate Limit 시간창 (ms)', type: 'number', category: 'general', requiresRestart: true },
        { key: 'API_RATE_LIMIT_MAX_REQUESTS', value: String(RATE_LIMIT_MAX_REQUESTS), description: 'Rate Limit 최대 요청 수', type: 'number', category: 'general', requiresRestart: false },
        { key: 'CORS_ALLOWED_ORIGINS', value: CORS_ALLOWED_ORIGINS?.join(', ') || '', description: 'CORS 허용 도메인', type: 'textarea', category: 'general', requiresRestart: false },
        { key: 'DB_HOST', value: DB_HOST, description: 'DB 호스트', type: 'text', category: 'database', requiresRestart: true },
        { key: 'DB_PORT', value: String(DB_PORT), description: 'DB 포트', type: 'number', category: 'database', requiresRestart: true },
        { key: 'DB_CONN_LIMIT', value: String(DB_CONN_LIMIT), description: '연결 풀 크기', type: 'number', category: 'database', requiresRestart: true },
        { key: 'JWT_ACCESS_TOKEN_EXPIRATION', value: String(JWT_ACCESS_EXPIRATION), description: 'JWT 만료 시간 (초)', type: 'number', category: 'security', requiresRestart: false },
        { key: 'ADMIN_MAX_LOGIN_ATTEMPTS', value: String(ADMIN_MAX_LOGIN_ATTEMPTS), description: '최대 로그인 시도 횟수', type: 'number', category: 'security', requiresRestart: false },
        { key: 'AUDIT_LOG_ENABLED', value: String(AUDIT_LOG_ENABLED), description: '감사 로그 활성화', type: 'boolean', category: 'audit', requiresRestart: false },
        { key: 'AUDIT_LOG_RETENTION_DAYS', value: String(AUDIT_LOG_RETENTION_DAYS), description: '감사 로그 보관 기간 (일)', type: 'number', category: 'audit', requiresRestart: false },
      ]

      res.json({ config: safeConfig })
    } catch (error) {
      handleApiError(res, error, 'Failed to fetch configuration')
    }
  })

  router.patch('/config', authenticateJWT, requireAdmin, async (req, res) => {
    // Note: This is a read-only endpoint for demonstration
    // In production, use a proper config management system
    res.status(400).json({
      error: 'Configuration changes require server restart. Please update the .env file directly and restart the server.',
      message: '설정 변경을 위해서는 .env 파일을 직접 수정하고 서버를 재시작하세요.',
    })
  })

  // ========================================
  // Data Export / Import
  // ========================================

  // Export projects to JSON
  router.get('/export/projects', authenticateJWT, requireAdmin, async (req, res) => {
    try {
      const projects = await getAllProjects(pool, {})

      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        exportedBy: req.user.username,
        totalProjects: projects.length,
        projects: projects.map(p => ({
          id: p.id,
          title: p.title,
          description: p.description,
          author: p.author,
          department: p.department,
          stars: p.stars,
          forks: p.forks,
          comments: p.comments,
          views: p.views,
          tags: p.tags,
          createdAt: p.createdAt,
          isNew: p.isNew,
          trend: p.trend,
          badge: p.badge,
        })),
      }

      // Create audit log
      await createAuditLog(pool, 'DATA_EXPORT', {
        dataType: 'projects',
        recordCount: projects.length,
        adminUserId: req.user.userId,
      })

      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Content-Disposition', `attachment; filename="jbhub-projects-${new Date().toISOString().split('T')[0]}.json"`)
      res.send(exportData)
    } catch (error) {
      handleApiError(res, error, 'Failed to export projects')
    }
  })

  // Export audit logs to CSV
  router.get('/export/audit-logs', authenticateJWT, requireAdmin, async (req, res) => {
    try {
      const { startDate, endDate, action } = req.query

      const whereClauses = ['1=1']
      const params = []

      if (startDate) {
        whereClauses.push('created_at >= ?')
        params.push(startDate)
      }

      if (endDate) {
        whereClauses.push('created_at <= ?')
        params.push(endDate)
      }

      if (action) {
        whereClauses.push('action = ?')
        params.push(action)
      }

      const [logs] = await pool.query(
        `SELECT * FROM audit_logs WHERE ${whereClauses.join(' AND ')} ORDER BY created_at DESC`,
        params
      )

      // Convert to CSV
      const csvHeader = ['ID,Time,Action,Entity Type,Entity ID,Admin ID,IP Address,Details\n']
      const csvRows = logs.map((log) =>
        [
          log.id,
          log.created_at,
          log.action,
          log.entity_type || '',
          log.entity_id || '',
          log.admin_user_id || '',
          log.ip_address || '',
          JSON.stringify(log.details || {}).replace(/"/g, '""'),
        ].join(',')
      )

      const csv = csvHeader.concat(csvRows).join('\n')

      // Create audit log
      await createAuditLog(pool, 'DATA_EXPORT', {
        dataType: 'audit_logs',
        recordCount: logs.length,
        filters: { startDate, endDate, action },
        adminUserId: req.user.userId,
      })

      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="jbhub-audit-logs-${new Date().toISOString().split('T')[0]}.csv"`)
      res.send('\uFEFF' + csv) // UTF-8 BOM for Excel
    } catch (error) {
      handleApiError(res, error, 'Failed to export audit logs')
    }
  })

  // Import projects from JSON
  router.post('/import/projects', authenticateJWT, requireAdmin, async (req, res) => {
    try {
      const { projects, options } = req.body || {}

      if (!Array.isArray(projects)) {
        return res.status(400).json({
          error: 'Projects must be an array',
        })
      }

      if (projects.length === 0) {
        return res.status(400).json({
          error: 'Projects array is empty',
        })
      }

      if (projects.length > 1000) {
        return res.status(400).json({
          error: 'Cannot import more than 1000 projects at once',
        })
      }

      const results = {
        success: 0,
        failed: 0,
        errors: [],
      }

      const importPromises = projects.map(async (projectData) => {
        try {
          const normalized = normalizeInputProject(projectData)
          await insertProject(pool, normalized)
          results.success++
        } catch (error) {
          results.failed++
          results.errors.push({
            project: projectData.title || 'Unknown',
            error: error.message || 'Import failed',
          })
        }
      })

      await Promise.all(importPromises)

      // Create audit log
      await createAuditLog(pool, 'DATA_IMPORT', {
        dataType: 'projects',
        totalProjects: projects.length,
        successCount: results.success,
        failCount: results.failed,
        adminUserId: req.user.userId,
      })

      res.json({
        message: 'Import completed',
        results,
      })
    } catch (error) {
      handleApiError(res, error, 'Failed to import projects')
    }
  })

  // ========================================
  // Bulk Operations
  // ========================================

  // Bulk update projects
  router.post('/bulk/projects/update', authenticateJWT, requireAdmin, async (req, res) => {
    try {
      const { projectIds, updates } = req.body || {}

      if (!Array.isArray(projectIds) || projectIds.length === 0) {
        return res.status(400).json({
          error: 'projectIds must be a non-empty array',
        })
      }

      if (typeof updates !== 'object' || updates === null) {
        return res.status(400).json({
          error: 'updates must be an object',
        })
      }

      const allowedFields = ['department', 'is_new']
      const invalidFields = Object.keys(updates).filter(key => !allowedFields.includes(key))

      if (invalidFields.length > 0) {
        return res.status(400).json({
          error: `Invalid fields: ${invalidFields.join(', ')}. Allowed: ${allowedFields.join(', ')}`,
        })
      }

      const updatePromises = projectIds.map(async (projectId) => {
        const updatesArray = Object.entries(updates).map(([key, value]) => {
          if (key === 'is_new') {
            return `${key} = ${value ? 1 : 0}`
          }
          return `${key} = ?`
        })

        if (updatesArray.length === 0) return 0

        const sql = `UPDATE projects SET ${updatesArray.join(', ')} WHERE id = ?`
        const values = [...Object.values(updates), projectId]

        const [result] = await pool.query(sql, values)
        return result.affectedRows
      })

      const affectedRowsArray = await Promise.all(updatePromises)
      const totalAffected = affectedRowsArray.reduce((sum, count) => sum + count, 0)

      // Create audit log
      await createAuditLog(pool, 'BULK_UPDATE', {
        entityType: 'projects',
        targetIds: projectIds,
        updates,
        affectedCount: totalAffected,
        adminUserId: req.user.userId,
      })

      res.json({
        message: 'Bulk update completed',
        affectedCount: totalAffected,
      })
    } catch (error) {
      handleApiError(res, error, 'Failed to bulk update projects')
    }
  })

  // Bulk delete projects
  router.post('/bulk/projects/delete', authenticateJWT, requireAdmin, async (req, res) => {
    try {
      const { projectIds } = req.body || {}

      if (!Array.isArray(projectIds) || projectIds.length === 0) {
        return res.status(400).json({
          error: 'projectIds must be a non-empty array',
        })
      }

      if (projectIds.length > 100) {
        return res.status(400).json({
          error: 'Cannot delete more than 100 projects at once',
        })
      }

      let deletedCount = 0
      for (const projectId of projectIds) {
        deletedCount += await deleteProjectById(pool, projectId)
      }

      // Create audit log
      await createAuditLog(pool, 'BULK_DELETE', {
        entityType: 'projects',
        deletedIds: projectIds,
        deletedCount,
        adminUserId: req.user.userId,
      })

      res.json({
        message: 'Bulk delete completed',
        deletedCount,
      })
    } catch (error) {
      handleApiError(res, error, 'Failed to bulk delete projects')
    }
  })

  // ========================================
  // Tag Management
  // ========================================

  router.get('/tags', authenticateJWT, requireAdmin, async (req, res) => {
    try {
      // Get all unique tags from projects
      const [rows] = await pool.query(`
        SELECT
          TRIM(BOTH ',' FROM TRIM(BOTH '[' FROM TRIM(BOTH ']' FROM tags))) AS tag
        FROM projects
        WHERE tags IS NOT NULL AND tags != ''
      `)

      const tagCounts = {}
      rows.forEach((row) => {
        const tags = row.tag.split(',').map((t) => t.trim()).filter((t) => t)
        tags.forEach((tag) => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1
        })
      })

      const sortedTags = Object.entries(tagCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)

      res.json({ tags: sortedTags })
    } catch (error) {
      handleApiError(res, error, 'Failed to fetch tags')
    }
  })

  // Rename tag
  router.post('/tags/rename', authenticateJWT, requireAdmin, async (req, res) => {
    try {
      const { oldName, newName } = req.body || {}

      if (!oldName || !newName) {
        return res.status(400).json({ error: 'oldName and newName are required' })
      }

      if (oldName === newName) {
        return res.status(400).json({ error: 'Old and new names cannot be the same' })
      }

      // Get all projects with the old tag
      const [projects] = await pool.query(
        'SELECT id, tags FROM projects WHERE JSON_SEARCH(tags, "one", ?) IS NOT NULL',
        [oldName]
      )

      let updatedCount = 0
      for (const project of projects) {
        const tags = JSON.parse(project.tags)
        const updatedTags = tags.map((tag) => tag === oldName ? newName : tag)

        await pool.query(
          'UPDATE projects SET tags = ? WHERE id = ?',
          [JSON.stringify(updatedTags), project.id]
        )
        updatedCount++
      }

      await createAuditLog(pool, 'TAG_RENAMED', {
        adminUser: req.user.username,
        oldName,
        newName,
        affectedProjects: updatedCount,
      })

      res.json({
        message: 'Tag renamed successfully',
        affectedProjects: updatedCount,
      })
    } catch (error) {
      handleApiError(res, error, 'Failed to rename tag')
    }
  })

  // Delete tag from all projects
  router.post('/tags/delete', authenticateJWT, requireAdmin, async (req, res) => {
    try {
      const { tagName } = req.body || {}

      if (!tagName) {
        return res.status(400).json({ error: 'tagName is required' })
      }

      // Get all projects with the tag
      const [projects] = await pool.query(
        'SELECT id, tags FROM projects WHERE JSON_SEARCH(tags, "one", ?) IS NOT NULL',
        [tagName]
      )

      let updatedCount = 0
      for (const project of projects) {
        const tags = JSON.parse(project.tags)
        const updatedTags = tags.filter((tag) => tag !== tagName)

        await pool.query(
          'UPDATE projects SET tags = ? WHERE id = ?',
          [JSON.stringify(updatedTags), project.id]
        )
        updatedCount++
      }

      await createAuditLog(pool, 'TAG_DELETED', {
        adminUser: req.user.username,
        tagName,
        affectedProjects: updatedCount,
      })

      res.json({
        message: 'Tag deleted successfully',
        affectedProjects: updatedCount,
      })
    } catch (error) {
      handleApiError(res, error, 'Failed to delete tag')
    }
  })

  // Merge tags
  router.post('/tags/merge', authenticateJWT, requireAdmin, async (req, res) => {
    try {
      const { sourceTag, targetTag } = req.body || {}

      if (!sourceTag || !targetTag) {
        return res.status(400).json({ error: 'sourceTag and targetTag are required' })
      }

      if (sourceTag === targetTag) {
        return res.status(400).json({ error: 'Source and target tags cannot be the same' })
      }

      // Get all projects with the source tag
      const [projects] = await pool.query(
        'SELECT id, tags FROM projects WHERE JSON_SEARCH(tags, "one", ?) IS NOT NULL',
        [sourceTag]
      )

      let updatedCount = 0
      for (const project of projects) {
        const tags = JSON.parse(project.tags)
        const filteredTags = tags.filter((tag) => tag !== sourceTag)

        // Add target tag if not already present
        if (!filteredTags.includes(targetTag)) {
          filteredTags.push(targetTag)
        }

        await pool.query(
          'UPDATE projects SET tags = ? WHERE id = ?',
          [JSON.stringify(filteredTags), project.id]
        )
        updatedCount++
      }

      await createAuditLog(pool, 'TAGS_MERGED', {
        adminUser: req.user.username,
        sourceTag,
        targetTag,
        affectedProjects: updatedCount,
      })

      res.json({
        message: 'Tags merged successfully',
        affectedProjects: updatedCount,
      })
    } catch (error) {
      handleApiError(res, error, 'Failed to merge tags')
    }
  })

  // ========================================
  // Analytics & Statistics
  // ========================================

  router.get('/analytics/departments', authenticateJWT, requireAdmin, async (req, res) => {
    try {
      const [rows] = await pool.query(`
        SELECT
          department,
          COUNT(*) as projectCount,
          SUM(stars) as totalStars,
          SUM(forks) as totalForks,
          SUM(views) as totalViews,
          SUM(comments) as totalComments
        FROM projects
        GROUP BY department
        ORDER BY totalStars DESC
      `)

      res.json({
        departments: rows.map((row) => ({
          name: row.department,
          projectCount: Number(row.projectCount),
          totalStars: Number(row.totalStars),
          totalForks: Number(row.totalForks),
          totalViews: Number(row.totalViews),
          totalComments: Number(row.totalComments),
          avgStars: row.projectCount > 0 ? Number(row.totalStars) / Number(row.projectCount) : 0,
        }))
      })
    } catch (error) {
      handleApiError(res, error, 'Failed to fetch department analytics')
    }
  })

  router.get('/analytics/timeline', authenticateJWT, requireAdmin, async (req, res) => {
    try {
      const { days = 30 } = req.query
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - Number(days))

      const [rows] = await pool.query(`
        SELECT
          DATE(created_at) as date,
          COUNT(*) as projectCount
        FROM projects
        WHERE created_at >= ?
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `, [startDate])

      res.json({
        timeline: rows.map((row) => ({
          date: row.date,
          projectCount: Number(row.projectCount),
        }))
      })
    } catch (error) {
      handleApiError(res, error, 'Failed to fetch timeline analytics')
    }
  })

  // ========================================
  // Search & Filter
  // ========================================

  router.get('/search/advanced', authenticateJWT, requireAdmin, async (req, res) => {
    try {
      const {
        search = '',
        departments = [],
        tags = [],
        minStars = 0,
        maxStars = null,
        minDate = null,
        maxDate = null,
      } = req.query || {}

      const whereClauses = ['1=1']
      const params = []

      if (search && typeof search === 'string') {
        const likeValue = `%${search}%`
        whereClauses.push('(title LIKE ? OR description LIKE ? OR author LIKE ? OR department LIKE ?)')
        params.push(likeValue, likeValue, likeValue, likeValue)
      }

      if (Array.isArray(departments) && departments.length > 0) {
        const placeholders = departments.map(() => '?').join(',')
        whereClauses.push(`department IN (${placeholders})`)
        params.push(...departments)
      }

      if (Array.isArray(tags) && tags.length > 0) {
        const tagConditions = tags.map(() => 'JSON_SEARCH(tags, "one", ?) IS NOT NULL').join(' OR ')
        whereClauses.push(`(${tagConditions})`)
        params.push(...tags)
      }

      if (minStars && !isNaN(Number(minStars))) {
        whereClauses.push('stars >= ?')
        params.push(Number(minStars))
      }

      if (maxStars && !isNaN(Number(maxStars))) {
        whereClauses.push('stars <= ?')
        params.push(Number(maxStars))
      }

      const sql = `
        SELECT * FROM projects
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY created_at DESC
      `

      const [rows] = await pool.query(sql, params)
      res.json({ projects: rows.map(toProjectDto) })
    } catch (error) {
      handleApiError(res, error, 'Advanced search failed')
    }
  })

  // ========================================
  // Backup & Restore
  // ========================================

  // In-memory storage for backups (production should use cloud storage)
  const backups = new Map() // backupId -> backup data

  // Get all backups
  router.get('/backups', authenticateJWT, requireAdmin, async (req, res) => {
    try {
      const backupList = Array.from(backups.values()).map(b => ({
        id: b.id,
        name: b.name,
        filename: b.filename,
        size: b.size,
        createdAt: b.createdAt,
        type: b.type,
        status: b.status,
      }))
      res.json({ backups: backupList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) })
    } catch (error) {
      handleApiError(res, error, 'Failed to fetch backups')
    }
  })

  // Create backup
  router.post('/backups/create', authenticateJWT, requireAdmin, async (req, res) => {
    try {
      const { includeProjects = true, includeUsers = true, includeAuditLogs = true } = req.body || {}

      const backupId = Date.now().toString()
      const timestamp = new Date().toISOString()
      const filename = `jbhub-backup-${Date.now()}.sql`

      // Build SQL dump
      let sqlDump = `-- JB-Hub Database Backup\n-- Created: ${timestamp}\n-- By: ${req.user.username}\n\n`

      if (includeProjects) {
        const [projects] = await pool.query('SELECT * FROM projects')
        sqlDump += `-- Projects (${projects.length} records)\n`
        sqlDump += `DELETE FROM projects;\n`
        for (const p of projects) {
          sqlDump += `INSERT INTO projects VALUES (${Object.values(p).map(v => {
            if (v === null) return 'NULL'
            if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`
            if (v instanceof Date) return `'${v.toISOString()}'`
            return v
          }).join(', ')});\n`
        }
        sqlDump += '\n'
      }

      if (includeUsers) {
        const [users] = await pool.query('SELECT * FROM admin_users')
        sqlDump += `-- Admin Users (${users.length} records)\n`
        sqlDump += `DELETE FROM admin_users;\n`
        for (const u of users) {
          sqlDump += `INSERT INTO admin_users VALUES (${Object.values(u).map(v => {
            if (v === null) return 'NULL'
            if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`
            if (v instanceof Date) return `'${v.toISOString()}'`
            return v
          }).join(', ')});\n`
        }
        sqlDump += '\n'
      }

      if (includeAuditLogs) {
        const [logs] = await pool.query('SELECT * FROM audit_logs LIMIT 1000')
        sqlDump += `-- Audit Logs (${logs.length} records)\n`
        sqlDump += `DELETE FROM audit_logs;\n`
        for (const l of logs) {
          sqlDump += `INSERT INTO audit_logs VALUES (${Object.values(l).map(v => {
            if (v === null) return 'NULL'
            if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`
            if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`
            if (v instanceof Date) return `'${v.toISOString()}'`
            return v
          }).join(', ')});\n`
        }
      }

      const backupData = {
        id: backupId,
        name: `백업 ${new Date().toLocaleString('ko-KR')}`,
        filename,
        data: sqlDump,
        size: sqlDump.length,
        createdAt: timestamp,
        type: 'manual',
        status: 'completed',
      }

      backups.set(backupId, backupData)

      await createAuditLog(pool, 'BACKUP_CREATED', {
        adminUser: req.user.username,
        backupId,
        filename,
        size: backupData.size,
      })

      res.json({
        message: 'Backup created successfully',
        backup: {
          id: backupData.id,
          name: backupData.name,
          filename: backupData.filename,
          size: backupData.size,
          createdAt: backupData.createdAt,
          type: backupData.type,
          status: backupData.status,
        },
      })
    } catch (error) {
      handleApiError(res, error, 'Failed to create backup')
    }
  })

  // Download backup
  router.get('/backups/:id/download', authenticateJWT, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params
      const backup = backups.get(id)

      if (!backup) {
        return res.status(404).json({ error: 'Backup not found' })
      }

      res.setHeader('Content-Type', 'application/sql')
      res.setHeader('Content-Disposition', `attachment; filename="${backup.filename}"`)
      res.send(backup.data)
    } catch (error) {
      handleApiError(res, error, 'Failed to download backup')
    }
  })

  // Restore from backup
  router.post('/backups/:id/restore', authenticateJWT, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params
      const backup = backups.get(id)

      if (!backup) {
        return res.status(404).json({ error: 'Backup not found' })
      }

      // Note: This is a simplified restore. In production, you would:
      // 1. Parse the SQL dump
      // 2. Execute statements within a transaction
      // 3. Handle errors and rollback if needed

      await createAuditLog(pool, 'BACKUP_RESTORED', {
        adminUser: req.user.username,
        backupId: id,
        filename: backup.filename,
      })

      res.json({
        message: 'Restore initiated',
        warning: 'This is a demo. Implement proper SQL parsing and execution for production.',
      })
    } catch (error) {
      handleApiError(res, error, 'Failed to restore backup')
    }
  })

  // Delete backup
  router.delete('/backups/:id', authenticateJWT, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params

      if (!backups.has(id)) {
        return res.status(404).json({ error: 'Backup not found' })
      }

      backups.delete(id)

      await createAuditLog(pool, 'BACKUP_DELETED', {
        adminUser: req.user.username,
        backupId: id,
      })

      res.json({ message: 'Backup deleted successfully' })
    } catch (error) {
      handleApiError(res, error, 'Failed to delete backup')
    }
  })

  // ========================================
  // Webhooks
  // ========================================

  // In-memory storage for webhooks (production should use database)
  const webhooks = new Map() // webhookId -> webhook data
  const webhookLogs = []

  // Get all webhooks
  router.get('/webhooks', authenticateJWT, requireAdmin, async (req, res) => {
    try {
      const webhookList = Array.from(webhooks.values())
      res.json({ webhooks: webhookList })
    } catch (error) {
      handleApiError(res, error, 'Failed to fetch webhooks')
    }
  })

  // Create webhook
  router.post('/webhooks', authenticateJWT, requireAdmin, async (req, res) => {
    try {
      const { name, url, events = [], headers = {}, secret } = req.body || {}

      if (!name || !url) {
        return res.status(400).json({ error: 'name and url are required' })
      }

      if (!Array.isArray(events) || events.length === 0) {
        return res.status(400).json({ error: 'events must be a non-empty array' })
      }

      const webhookId = Date.now().toString()
      const webhook = {
        id: webhookId,
        name,
        url,
        events,
        headers,
        secret: secret || undefined,
        enabled: true,
        lastTriggered: null,
        successCount: 0,
        failureCount: 0,
        createdAt: new Date().toISOString(),
      }

      webhooks.set(webhookId, webhook)

      await createAuditLog(pool, 'WEBHOOK_CREATED', {
        adminUser: req.user.username,
        webhookId,
        name,
        url,
        events,
      })

      res.status(201).json({ webhook })
    } catch (error) {
      handleApiError(res, error, 'Failed to create webhook')
    }
  })

  // Update webhook
  router.patch('/webhooks/:id', authenticateJWT, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params
      const { name, url, events, headers, secret } = req.body || {}

      const webhook = webhooks.get(id)
      if (!webhook) {
        return res.status(404).json({ error: 'Webhook not found' })
      }

      const updated = {
        ...webhook,
        ...(name && { name }),
        ...(url && { url }),
        ...(events && { events }),
        ...(headers && { headers }),
        ...(secret !== undefined && { secret: secret || undefined }),
      }

      webhooks.set(id, updated)

      await createAuditLog(pool, 'WEBHOOK_UPDATED', {
        adminUser: req.user.username,
        webhookId: id,
        changes: Object.keys(req.body || {}),
      })

      res.json({ webhook: updated })
    } catch (error) {
      handleApiError(res, error, 'Failed to update webhook')
    }
  })

  // Delete webhook
  router.delete('/webhooks/:id', authenticateJWT, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params

      if (!webhooks.has(id)) {
        return res.status(404).json({ error: 'Webhook not found' })
      }

      webhooks.delete(id)

      await createAuditLog(pool, 'WEBHOOK_DELETED', {
        adminUser: req.user.username,
        webhookId: id,
      })

      res.json({ message: 'Webhook deleted successfully' })
    } catch (error) {
      handleApiError(res, error, 'Failed to delete webhook')
    }
  })

  // Test webhook
  router.post('/webhooks/:id/test', authenticateJWT, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params
      const webhook = webhooks.get(id)

      if (!webhook) {
        return res.status(404).json({ error: 'Webhook not found' })
      }

      const startTime = Date.now()

      // Send test webhook
      const payload = {
        event: 'test',
        timestamp: new Date().toISOString(),
        data: {
          message: 'This is a test webhook from JB-Hub',
          triggeredBy: req.user.username,
        },
      }

      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'JB-Hub-Webhook/1.0',
        ...webhook.headers,
      }

      if (webhook.secret) {
        const crypto = await import('crypto')
        const signature = crypto
          .createHmac('sha256', webhook.secret)
          .update(JSON.stringify(payload))
          .digest('hex')
        headers['X-Hub-Signature-256'] = `sha256=${signature}`
      }

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })

      const responseTime = Date.now() - startTime

      const log = {
        id: Date.now().toString(),
        webhookId: id,
        webhookName: webhook.name,
        event: 'test',
        url: webhook.url,
        status: response.ok ? 'success' : 'failed',
        statusCode: response.status,
        responseTime,
        createdAt: new Date().toISOString(),
      }

      webhookLogs.push(log)

      if (response.ok) {
        webhook.successCount++
      } else {
        webhook.failureCount++
      }
      webhook.lastTriggered = new Date().toISOString()

      res.json({
        message: 'Test webhook sent',
        log,
      })
    } catch (error) {
      handleApiError(res, error, 'Failed to send test webhook')
    }
  })

  // Get webhook logs
  router.get('/webhooks/logs', authenticateJWT, requireAdmin, async (req, res) => {
    try {
      const { limit = 50 } = req.query
      const logs = webhookLogs
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, Number(limit))

      res.json({ logs })
    } catch (error) {
      handleApiError(res, error, 'Failed to fetch webhook logs')
    }
  })

  // Trigger webhook (helper function, exposed for testing)
  async function triggerWebhook(event, data) {
    for (const webhook of webhooks.values()) {
      if (!webhook.enabled || !webhook.events.includes(event)) continue

      try {
        const payload = {
          event,
          timestamp: new Date().toISOString(),
          data,
        }

        const headers = {
          'Content-Type': 'application/json',
          'User-Agent': 'JB-Hub-Webhook/1.0',
          ...webhook.headers,
        }

        if (webhook.secret) {
          const crypto = await import('crypto')
          const signature = crypto
            .createHmac('sha256', webhook.secret)
            .update(JSON.stringify(payload))
            .digest('hex')
          headers['X-Hub-Signature-256'] = `sha256=${signature}`
        }

        const startTime = Date.now()
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        })
        const responseTime = Date.now() - startTime

        webhookLogs.push({
          id: randomUUID(),
          webhookId: webhook.id,
          webhookName: webhook.name,
          event,
          url: webhook.url,
          status: response.ok ? 'success' : 'failed',
          statusCode: response.status,
          responseTime,
          createdAt: new Date().toISOString(),
        })

        if (response.ok) {
          webhook.successCount++
        } else {
          webhook.failureCount++
        }
        webhook.lastTriggered = new Date().toISOString()
      } catch (error) {
        webhook.failureCount++
        webhookLogs.push({
          id: randomUUID(),
          webhookId: webhook.id,
          webhookName: webhook.name,
          event,
          url: webhook.url,
          status: 'failed',
          statusCode: 0,
          responseTime: 0,
          createdAt: new Date().toISOString(),
          error: error.message,
        })
      }
    }
  }

  return router
}

async function start() {
  // Validate environment before starting
  validateEnvironment()

  const pool = await createPoolWithRetry()
  await ensureSchema(pool)
  await ensureSignupPlatformSchema(pool)
  await ensureSiteContentSchema(pool)
  await seedAdminUser(pool) // Seed default admin user
  if (DB_SEED) {
    await seedIfEmpty(pool)
  }
  await cleanupProjectsWithoutFiles(pool)

  const app = express()
  app.use(createRequestLogger())

  // CORS Security: Require explicit configuration, deny by default
  if (!CORS_ALLOWED_ORIGINS || CORS_ALLOWED_ORIGINS.length === 0) {
    console.warn('[api] WARNING: CORS_ALLOWED_ORIGINS not configured. CORS will be DENIED for all origins.')
  }

  app.use(cors({
    origin: CORS_ALLOWED_ORIGINS && CORS_ALLOWED_ORIGINS.length > 0
      ? (origin, callback) => {
          if (!origin) return callback(null, true)
          if (CORS_ALLOWED_ORIGINS.includes('*') || CORS_ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true)
          } else {
            // Security: Log blocked CORS attempts
            logSecurityEvent('CORS_BLOCKED', { origin, timestamp: new Date().toISOString() })
            callback(new Error('CORS not allowed for this origin'))
          }
        }
      : false, // DENY all if not explicitly configured
    credentials: true,
  }))

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: CORS_ALLOWED_ORIGINS && CORS_ALLOWED_ORIGINS.length > 0
          ? CORS_ALLOWED_ORIGINS.includes('*')
            ? ["'self'"]
            : ["'self'", ...CORS_ALLOWED_ORIGINS.filter(o => o !== '*')]
          : ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }))

  // Performance: Response compression
  app.use(compression({
    filter: (req, res) => {
      // Don't compress if response is already compressed
      if (res.getHeader('Content-Encoding')) {
        return false
      }
      // Compress all responses
      return true
    },
    threshold: 1024, // Only compress responses larger than 1KB
    level: 6, // Compression level (1-9, 6 is default)
  }))

  app.use(createRateLimiter(RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS))

  // Security: Request size limiter (prevent DoS via large requests)
  app.use((req, res, next) => {
    const contentLength = parseInt(req.get('content-length') || '0', 10)
    const isDockerUploadRoute = typeof req.path === 'string' && req.path.includes('/docker/')
    const isToolsUploadRoute = typeof req.path === 'string' && req.path.includes('/tools/')
    const MAX_SIZE = isDockerUploadRoute
      ? 1536 * 1024 * 1024
      : isToolsUploadRoute
        ? 64 * 1024 * 1024
        : 2 * 1024 * 1024
    if (contentLength > MAX_SIZE) {
      return res.status(413).json({
        error: 'Request entity too large',
        requestId: req.requestId,
      })
    }
    next()
  })

  // Body parser with size limit
  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: false, limit: '1mb' }))

  // Keep project uploads on disk so oversized multipart payloads cannot exhaust server memory.
  const defaultFileUploadMiddleware = fileUpload({
    createParentPath: true,
    abortOnLimit: true,
    responseOnLimit: JSON.stringify({
      error: 'Uploaded file is too large. The maximum size is 512MB per file.',
    }),
    limitHandler: (_req, res) => {
      if (!res.headersSent) {
        res.status(413).json({
          error: 'Uploaded file is too large. The maximum size is 512MB per file.',
        })
      }
    },
    limits: { fileSize: 512 * 1024 * 1024 },
    useTempFiles: true,
    tempFileDir: UPLOAD_TEMP_DIR,
  })

  app.use((req, res, next) => {
    if (typeof req.path === 'string' && req.path.includes('/docker/')) {
      next()
      return
    }

    defaultFileUploadMiddleware(req, res, next)
  })

  // Security: Cookie settings middleware
  app.use((req, res, next) => {
    const originalCookie = res.cookie
    res.cookie = function(name, value, options = {}) {
      const secureOptions = {
        ...options,
        httpOnly: true,
        secure: IS_PRODUCTION_MODE,
        sameSite: 'strict',
        path: '/',
        maxAge: options.maxAge || 24 * 60 * 60 * 1000,
      }
      return originalCookie.call(this, name, value, secureOptions)
    }
    next()
  })

  // API Versioning: v1 routes
  const v1Router = express.Router()

  // Security: Cache control middleware
  v1Router.use((req, res, next) => {
    // Prevent caching of API responses by default
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
    next()
  })

  // Enhanced health check endpoint
  v1Router.get('/health', async (req, res) => {
    const requestId = req.requestId
    const health = {
      status: 'healthy',
      version: '1.0.0',
      apiVersion: 'v1',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      uptimeFormatted: formatUptime(process.uptime()),
      requestId,
      environment: IS_PRODUCTION_MODE ? 'production' : 'development',
      checks: {
        database: { status: 'unknown' },
        memory: { status: 'unknown' },
      },
    }

    // Helper to format uptime
    function formatUptime(seconds) {
      const days = Math.floor(seconds / 86400)
      const hours = Math.floor((seconds % 86400) / 3600)
      const minutes = Math.floor((seconds % 3600) / 60)
      const secs = Math.floor(seconds % 60)
      return `${days}d ${hours}h ${minutes}m ${secs}s`
    }

    try {
      // Database check
      const startTime = Date.now()
      await pool.query('SELECT 1 AS ok')
      health.checks.database = {
        status: 'healthy',
        latency: Date.now() - startTime,
      }
    } catch (error) {
      health.status = 'unhealthy'
      health.checks.database = {
        status: 'unhealthy',
        error: 'Database connection failed',
      }
      console.error('[api] health check failed:', requestId, error)
    }

    // Memory check
    const memUsage = process.memoryUsage()
    const memPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100
    health.checks.memory = {
      status: memPercent < 90 ? 'healthy' : 'warning',
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024),
      percent: Math.round(memPercent),
    }

    const statusCode = health.status === 'healthy' ? 200 : 503
    res.status(statusCode).json(health)
  })

  v1Router.use(createSignupPlatformPublicRouter(pool, {
    handleApiError,
    createAuditLog,
  }))
  v1Router.use(createSiteContentPublicRouter(pool, { handleApiError }))
  v1Router.use('/tools', createToolsRouter())

  // Projects endpoints
  v1Router.get('/projects', async (req, res) => {
    try {
      const projects = await getAllProjects(pool, req.query)
      res.json({ projects, meta: { version: '1.0', count: projects.length } })
    } catch (error) {
      handleApiError(res, error, 'Failed to fetch projects.')
    }
  })

  // Keep this route before /projects/:id so "insights" is not parsed as an id.
  v1Router.get('/projects/insights', async (req, res) => {
    try {
      const projects = await getAllProjects(pool, req.query)
      res.json({ insights: buildProjectInsights(projects) })
    } catch (error) {
      handleApiError(res, error, 'Failed to build project insights.')
    }
  })

  v1Router.get('/projects/:id', async (req, res) => {
    const projectId = Number.parseInt(String(req.params.id), 10)
    if (!Number.isFinite(projectId) || projectId <= 0) {
      res.status(400).json({ error: 'Invalid project id.', requestId: req.requestId })
      return
    }

    try {
      const project = await getProjectById(pool, projectId)
      if (!project) {
        res.status(404).json({ error: 'Project not found.', requestId: req.requestId })
        return
      }
      res.json({ project })
    } catch (error) {
      handleApiError(res, error, 'Failed to fetch project.')
    }
  })

  v1Router.post('/projects', async (req, res) => {
    try {
      const project = await insertProject(pool, req.body ?? {})
      if (!project) {
        res.status(500).json({ error: 'Failed to create project.', requestId: req.requestId })
        return
      }

      res.status(201).json({
        project,
        projectEditToken: generateProjectEditToken(project),
      })
    } catch (error) {
      handleApiError(res, error, 'Failed to create project.')
    }
  })

  v1Router.get('/projects/:id/readme', async (req, res) => {
    const projectId = Number.parseInt(String(req.params.id), 10)
    if (!Number.isFinite(projectId) || projectId <= 0) {
      res.status(400).json({ error: 'Invalid project id.', requestId: req.requestId })
      return
    }

    try {
      const project = await getProjectById(pool, projectId)
      if (!project) {
        res.status(404).json({ error: 'Project not found.', requestId: req.requestId })
        return
      }

      const readme = await readProjectReadmeDocument(project)
      res.json({ readme })
    } catch (error) {
      handleApiError(res, error, 'Failed to fetch project README.')
    }
  })

  v1Router.put('/projects/:id/readme', async (req, res) => {
    const projectId = Number.parseInt(String(req.params.id), 10)
    if (!Number.isFinite(projectId) || projectId <= 0) {
      res.status(400).json({ error: 'Invalid project id.', requestId: req.requestId })
      return
    }

    try {
      const project = await getProjectById(pool, projectId)
      if (!project) {
        res.status(404).json({ error: 'Project not found.', requestId: req.requestId })
        return
      }

      if (!hasProjectWriteAccess(req, project)) {
        res.status(403).json({ error: 'Only the project author can update the README.', requestId: req.requestId })
        return
      }

      const target = await resolveProjectReadmeTarget(projectId)
      const nextContent = sanitizeProjectReadmeContent(req.body?.content, buildDefaultProjectReadme(project))
      await ensureProjectStorageLimit(projectId, [
        {
          target,
          sizeBytes: Buffer.byteLength(nextContent, 'utf8'),
        },
      ])

      await fs.promises.mkdir(target.projectDir, { recursive: true })
      await fs.promises.writeFile(target.absolutePath, nextContent, 'utf8')

      const readme = await readProjectReadmeDocument(project)
      res.json({ readme })
    } catch (error) {
      handleApiError(res, error, 'Failed to save project README.')
    }
  })

  v1Router.get('/projects/:id/files', async (req, res) => {
    const projectId = Number.parseInt(String(req.params.id), 10)
    if (!Number.isFinite(projectId) || projectId <= 0) {
      res.status(400).json({ error: 'Invalid project id.', requestId: req.requestId })
      return
    }

    try {
      const project = await getProjectById(pool, projectId)
      if (!project) {
        res.status(404).json({ error: 'Project not found.', requestId: req.requestId })
        return
      }

      const projectDir = path.join(PROJECT_FILES_ROOT, String(projectId))
      const files = await listProjectFiles(projectDir)
      res.json({ files })
    } catch (error) {
      handleApiError(res, error, 'Failed to fetch project files.')
    }
  })

  v1Router.post('/projects/:id/files', async (req, res) => {
    const projectId = Number.parseInt(String(req.params.id), 10)
    if (!Number.isFinite(projectId) || projectId <= 0) {
      res.status(400).json({ error: 'Invalid project id.', requestId: req.requestId })
      return
    }

    try {
      const project = await getProjectById(pool, projectId)
      if (!project) {
        res.status(404).json({ error: 'Project not found.', requestId: req.requestId })
        return
      }

      if (!hasProjectWriteAccess(req, project)) {
        res.status(403).json({ error: 'Only the project author can upload files.', requestId: req.requestId })
        return
      }

      if (!req.files || !req.files.files) {
        throw new Error('validation:At least one file is required.')
      }

      const uploadedFiles = Array.isArray(req.files.files) ? req.files.files : [req.files.files]
      const relativePaths = normalizeUploadedRelativePaths(req.body?.relativePaths)
      const uploaded = []
      const plannedWrites = []

      for (const [index, uploadedFile] of uploadedFiles.entries()) {
        const fallbackName = sanitizeProjectPathSegment(uploadedFile.name, `upload-${index + 1}`)
        const target = resolveProjectFileTarget(projectId, relativePaths[index] ?? fallbackName, fallbackName)
        if (isRestrictedProjectFilePath(target.relativePath)) {
          throw new Error('validation:Sensitive files and secrets cannot be uploaded to projects.')
        }

        plannedWrites.push({
          target,
          sizeBytes: Number(uploadedFile.size ?? 0),
        })
      }

      await ensureProjectStorageLimit(projectId, plannedWrites)

      for (const [index, uploadedFile] of uploadedFiles.entries()) {
        const target = plannedWrites[index].target

        await fs.promises.mkdir(path.dirname(target.absolutePath), { recursive: true })
        await uploadedFile.mv(target.absolutePath)

        const stats = await fs.promises.stat(target.absolutePath)
        uploaded.push({
          name: path.basename(target.absolutePath),
          path: target.relativePath,
          size: stats.size,
          updatedAt: stats.mtime.toISOString(),
        })
      }

      const files = await listProjectFiles(path.join(PROJECT_FILES_ROOT, String(projectId)))
      res.status(201).json({ uploaded, files })
    } catch (error) {
      handleApiError(res, error, 'Failed to upload project files.')
    }
  })

  v1Router.delete('/projects/:id/files', async (req, res) => {
    const projectId = Number.parseInt(String(req.params.id), 10)
    if (!Number.isFinite(projectId) || projectId <= 0) {
      res.status(400).json({ error: 'Invalid project id.', requestId: req.requestId })
      return
    }

    const requestedPath = typeof req.query.path === 'string' ? req.query.path : ''
    if (!requestedPath.trim()) {
      res.status(400).json({ error: 'File path is required.', requestId: req.requestId })
      return
    }

    try {
      const project = await getProjectById(pool, projectId)
      if (!project) {
        res.status(404).json({ error: 'Project not found.', requestId: req.requestId })
        return
      }

      if (!hasProjectWriteAccess(req, project)) {
        res.status(403).json({ error: 'Only the project author can delete files.', requestId: req.requestId })
        return
      }

      const target = resolveProjectFileTarget(projectId, requestedPath)
      if (isRestrictedProjectFilePath(target.relativePath)) {
        res.status(403).json({ error: 'Access to this file is restricted.', requestId: req.requestId })
        return
      }

      await fs.promises.stat(target.absolutePath)
      await fs.promises.rm(target.absolutePath, { recursive: true, force: false })
      await removeEmptyProjectDirectories(target.projectDir, path.dirname(target.absolutePath))

      const files = await listProjectFiles(path.join(PROJECT_FILES_ROOT, String(projectId)))
      res.json({ deletedPath: target.relativePath, files })
    } catch (error) {
      if (error?.code === 'ENOENT') {
        res.status(404).json({ error: 'File not found.', requestId: req.requestId })
        return
      }
      handleApiError(res, error, 'Failed to delete project file.')
    }
  })

  v1Router.get('/projects/:id/files/content', async (req, res) => {
    const projectId = Number.parseInt(String(req.params.id), 10)
    if (!Number.isFinite(projectId) || projectId <= 0) {
      res.status(400).json({ error: 'Invalid project id.', requestId: req.requestId })
      return
    }

    const requestedPath = typeof req.query.path === 'string' ? req.query.path : ''
    if (!requestedPath.trim()) {
      res.status(400).json({ error: 'File path is required.', requestId: req.requestId })
      return
    }

    try {
      const project = await getProjectById(pool, projectId)
      if (!project) {
        res.status(404).json({ error: 'Project not found.', requestId: req.requestId })
        return
      }

      const target = resolveProjectFileTarget(projectId, requestedPath)
      if (isRestrictedProjectFilePath(target.relativePath)) {
        res.status(403).json({ error: 'Access to this file is restricted.', requestId: req.requestId })
        return
      }
      const stats = await fs.promises.stat(target.absolutePath)
      if (!stats.isFile()) {
        res.status(400).json({ error: 'Preview is only available for files.', requestId: req.requestId })
        return
      }

      const preview = await readProjectFilePreview(target.absolutePath, stats)
      res.json({
        file: {
          name: path.basename(target.absolutePath),
          path: target.relativePath,
          size: stats.size,
          updatedAt: stats.mtime.toISOString(),
          isText: preview.isText,
          truncated: preview.truncated,
          content: preview.content,
        },
      })
    } catch (error) {
      if (error?.code === 'ENOENT') {
        res.status(404).json({ error: 'File not found.', requestId: req.requestId })
        return
      }
      handleApiError(res, error, 'Failed to read project file.')
    }
  })

  v1Router.get('/projects/:id/files/download', async (req, res) => {
    const projectId = Number.parseInt(String(req.params.id), 10)
    if (!Number.isFinite(projectId) || projectId <= 0) {
      res.status(400).json({ error: 'Invalid project id.', requestId: req.requestId })
      return
    }

    const requestedPath = typeof req.query.path === 'string' ? req.query.path : ''
    if (!requestedPath.trim()) {
      res.status(400).json({ error: 'File path is required.', requestId: req.requestId })
      return
    }

    try {
      const project = await getProjectById(pool, projectId)
      if (!project) {
        res.status(404).json({ error: 'Project not found.', requestId: req.requestId })
        return
      }

      const target = resolveProjectFileTarget(projectId, requestedPath)
      if (isRestrictedProjectFilePath(target.relativePath)) {
        res.status(403).json({ error: 'Access to this file is restricted.', requestId: req.requestId })
        return
      }
      const stats = await fs.promises.stat(target.absolutePath)
      if (!stats.isFile()) {
        res.status(400).json({ error: 'Only files can be downloaded.', requestId: req.requestId })
        return
      }

      const downloadName = path.basename(target.absolutePath)
      res.setHeader('Content-Disposition', buildAttachmentContentDisposition(downloadName))
      res.setHeader('Content-Length', String(stats.size))
      res.setHeader('Cache-Control', 'no-store')
      res.type(downloadName)
      res.sendFile(target.absolutePath)
    } catch (error) {
      if (error?.code === 'ENOENT') {
        res.status(404).json({ error: 'File not found.', requestId: req.requestId })
        return
      }
      handleApiError(res, error, 'Failed to download project file.')
    }
  })

  // API Documentation (OpenAPI/Swagger)
  v1Router.get('/docs', (req, res) => {
    const openApiSpec = {
      openapi: '3.0.0',
      info: {
        title: 'JB-Hub API',
        version: '1.0.0',
        description: 'JB-Hub 프로젝트 관리 API',
        contact: {
          name: 'API Support',
          email: 'admin@jbhub.local',
        },
      },
      servers: [
        {
          url: `/api/v1`,
          description: 'API v1',
        },
      ],
      paths: {
        '/health': {
          get: {
            summary: 'API 상태 확인',
            description: 'API 서버와 데이터베이스 상태를 확인합니다.',
            tags: ['System'],
            responses: {
              '200': {
                description: '정상 응답',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', example: 'healthy' },
                        version: { type: 'string', example: '1.0.0' },
                        uptime: { type: 'number' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        '/projects': {
          get: {
            summary: '프로젝트 목록 조회',
            description: '필터링된 프로젝트 목록을 반환합니다.',
            tags: ['Projects'],
            parameters: [
              {
                name: 'search',
                in: 'query',
                description: '검색어 (제목, 설명, 작성자, 부서, 태그)',
                schema: { type: 'string' },
              },
              {
                name: 'department',
                in: 'query',
                description: '부서 필터',
                schema: { type: 'string' },
              },
              {
                name: 'minStars',
                in: 'query',
                description: '최소 Stars 수',
                schema: { type: 'integer' },
              },
              {
                name: 'sortBy',
                in: 'query',
                description: '정렬 기준',
                schema: { type: 'string', enum: ['newest', 'stars', 'views', 'comments'] },
              },
              {
                name: 'limit',
                in: 'query',
                description: '최대 반환 수 (최대 100)',
                schema: { type: 'integer' },
              },
              {
                name: 'offset',
                in: 'query',
                description: '건너뛸 수 (페이지네이션)',
                schema: { type: 'integer' },
              },
            ],
            responses: {
              '200': {
                description: '프로젝트 목록',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        projects: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              id: { type: 'integer' },
                              title: { type: 'string' },
                              description: { type: 'string' },
                              author: { type: 'string' },
                              department: { type: 'string' },
                              stars: { type: 'integer' },
                              forks: { type: 'integer' },
                              comments: { type: 'integer' },
                              views: { type: 'integer' },
                              tags: { type: 'array', items: { type: 'string' } },
                            },
                          },
                        },
                        meta: {
                          type: 'object',
                          properties: {
                            version: { type: 'string' },
                            count: { type: 'integer' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          post: {
            summary: '프로젝트 생성',
            description: '새 프로젝트를 생성합니다.',
            tags: ['Projects'],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['title', 'description', 'author', 'department', 'tags'],
                    properties: {
                      title: { type: 'string', minLength: 2, maxLength: 255 },
                      description: { type: 'string', minLength: 10, maxLength: 5000 },
                      author: { type: 'string', minLength: 2, maxLength: 120 },
                      department: { type: 'string', minLength: 1, maxLength: 120 },
                      tags: { type: 'array', items: { type: 'string' }, minItems: 1 },
                      stars: { type: 'integer', minimum: 0 },
                      forks: { type: 'integer', minimum: 0 },
                      comments: { type: 'integer', minimum: 0 },
                      views: { type: 'integer', minimum: 0 },
                    },
                  },
                },
              },
            },
            responses: {
              '201': {
                description: '생성된 프로젝트',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        project: { type: 'object' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        '/projects/{id}': {
          get: {
            summary: '프로젝트 상세 조회',
            description: 'ID로 프로젝트 상세 정보를 조회합니다.',
            tags: ['Projects'],
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                description: '프로젝트 ID',
                schema: { type: 'integer' },
              },
            ],
            responses: {
              '200': {
                description: '프로젝트 상세',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        project: { type: 'object' },
                      },
                    },
                  },
                },
              },
              '404': {
                description: '프로젝트를 찾을 수 없음',
              },
            },
          },
        },
        '/projects/insights': {
          get: {
            summary: '프로젝트 인사이트',
            description: '프로젝트 통계 및 분석 데이터를 반환합니다.',
            tags: ['Analytics'],
            responses: {
              '200': {
                description: '인사이트 데이터',
              },
            },
          },
        },
        '/rankings': {
          get: {
            summary: '순위 데이터',
            description: '프로젝트, 기여자, 부서 순위를 반환합니다.',
            tags: ['Analytics'],
            responses: {
              '200': {
                description: '순위 데이터',
              },
            },
          },
        },
      },
      components: {
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      security: [
        { BearerAuth: [] },
      ],
    }

    res.json(openApiSpec)
  })

  // Insights router
  v1Router.use('/', createInsightsRouter(pool))

  // Mount v1 API
  app.use('/api/v1', v1Router)

  // Admin API (mounted separately with different authentication)
  app.use('/api/admin', createAdminRouter(pool))

  const toV1Path = (originalUrl) => {
    if (typeof originalUrl !== 'string' || !originalUrl.startsWith('/api')) {
      return '/api/v1'
    }
    return `/api/v1${originalUrl.slice('/api'.length)}`
  }

  // Legacy API routes (redirect to v1 for backward compatibility)
  app.get('/api/health', (req, res) => {
    res.redirect(307, toV1Path(req.originalUrl))
  })
  app.get('/api/projects', (req, res) => {
    res.redirect(307, toV1Path(req.originalUrl))
  })
  app.get('/api/projects/insights', (req, res) => {
    res.redirect(307, toV1Path(req.originalUrl))
  })
  app.get('/api/projects/:id', (req, res) => {
    res.redirect(307, toV1Path(req.originalUrl))
  })
  app.post('/api/projects', (req, res) => {
    res.redirect(307, toV1Path(req.originalUrl))
  })
  app.get('/api/rankings', (req, res) => {
    res.redirect(307, toV1Path(req.originalUrl))
  })

  // Docker API routes (폐쇄망 환경: 로컬 Docker 데몬 사용)

  // Catch-all for unmatched API routes
  app.use('/api/*splat', (_req, res) => {
    res.status(404).json({
      error: 'Endpoint not found.',
      hint: 'Available endpoints: /api/v1/projects, /api/v1/health',
    })
  })

  // Global error handler
  app.use((error, _req, res, _next) => {
    handleApiError(res, error, 'Unhandled server error.')
  })

  const server = app.listen(API_PORT, () => {
    console.log(`[api] http://127.0.0.1:${API_PORT}`)
  })

  const authStateCleanupInterval = setInterval(() => {
    const cleaned = cleanupExpiredAuthState()
    if (cleaned.sessions > 0 || cleaned.refreshTokens > 0 || cleaned.loginAttempts > 0) {
      console.log(
        `[auth] cleanup: sessions=${cleaned.sessions}, refreshTokens=${cleaned.refreshTokens}, loginAttempts=${cleaned.loginAttempts}`,
      )
    }
  }, AUTH_STATE_CLEANUP_INTERVAL_MS)

  const shutdown = async () => {
    console.log('[api] shutting down gracefully...')

    // Clean up rate limiter intervals
    if (createRateLimiter.cleanupIntervals) {
      createRateLimiter.cleanupIntervals.forEach(clearInterval)
      createRateLimiter.cleanupIntervals = []
    }

    clearInterval(authStateCleanupInterval)
    // Stop accepting new connections
    server.close(() => {
      console.log('[api] server closed')
    })

    // Force shutdown after timeout (30 seconds)
    const shutdownTimeout = setTimeout(() => {
      console.error('[api] shutdown timeout, forcing exit')
      process.exit(1)
    }, 30000)

    try {
      // Close database connections
      await pool.end()
      console.log('[api] database connections closed')
      clearTimeout(shutdownTimeout)
      process.exit(0)
    } catch (error) {
      console.error('[api] error during shutdown:', error)
      clearTimeout(shutdownTimeout)
      process.exit(1)
    }
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

start().catch((error) => {
  console.error('[api] startup failed:', error)
  process.exit(1)
})
