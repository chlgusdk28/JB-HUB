import express from 'express'

const SIGNUP_STATUS_VALUES = new Set(['pending', 'approved', 'rejected'])

function sanitizeText(value, maxLength = 255, allowLineBreaks = false) {
  if (typeof value !== 'string') {
    return ''
  }

  let normalized = value.trim()
  normalized = normalized.replace(/<script[^>]*>.*?<\/script>/gi, '')
  normalized = normalized.replace(/<[^>]*>/g, '')
  normalized = normalized.slice(0, maxLength)

  if (allowLineBreaks) {
    normalized = normalized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
  } else {
    normalized = normalized.replace(/[\x00-\x1F\x7F]/g, ' ')
  }

  return normalized.replace(/\s+/g, allowLineBreaks ? ' ' : ' ').trim()
}

function normalizeEmail(value) {
  return sanitizeText(value, 255).toLowerCase()
}

function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function normalizeStatus(value, fallback = 'pending') {
  const normalized = sanitizeText(String(value ?? ''), 32).toLowerCase()
  return SIGNUP_STATUS_VALUES.has(normalized) ? normalized : fallback
}

function normalizeSignupApplicationInput(input) {
  const normalized = {
    name: sanitizeText(String(input?.name ?? ''), 120),
    email: normalizeEmail(String(input?.email ?? '')),
    phone: sanitizeText(String(input?.phone ?? ''), 40),
    organization: sanitizeText(String(input?.organization ?? ''), 160),
    department: sanitizeText(String(input?.department ?? ''), 120),
    positionTitle: sanitizeText(String(input?.positionTitle ?? ''), 120),
    message: sanitizeText(String(input?.message ?? ''), 2000, true),
  }

  if (normalized.name.length < 2) {
    throw new Error('validation:이름은 2자 이상이어야 합니다.')
  }

  if (!validateEmail(normalized.email)) {
    throw new Error('validation:올바른 이메일 주소를 입력해 주세요.')
  }

  if (normalized.organization.length < 2) {
    throw new Error('validation:소속 또는 회사명은 2자 이상이어야 합니다.')
  }

  return normalized
}

function normalizeSignupListFilter(filter) {
  return {
    status: normalizeStatus(filter?.status, ''),
    search: sanitizeText(String(filter?.search ?? ''), 100),
    limit: Math.min(
      200,
      Math.max(1, Number.parseInt(String(filter?.limit ?? '100'), 10) || 100),
    ),
  }
}

function toSignupApplicationDto(row) {
  return {
    id: Number(row.id),
    name: String(row.name ?? ''),
    email: String(row.email ?? ''),
    phone: row.phone ? String(row.phone) : null,
    organization: String(row.organization ?? ''),
    department: row.department ? String(row.department) : null,
    positionTitle: row.position_title ? String(row.position_title) : null,
    message: row.message ? String(row.message) : null,
    status: normalizeStatus(row.status),
    reviewNote: row.review_note ? String(row.review_note) : null,
    reviewerName: row.reviewer_name ? String(row.reviewer_name) : null,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  }
}

async function getSignupPlatformCounts(pool) {
  const [rows] = await pool.query(`
    SELECT
      COUNT(*) AS total_count,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved_count,
      SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected_count
    FROM signup_applications
  `)

  const row = rows[0] ?? {}
  return {
    total: Number(row.total_count ?? 0),
    pending: Number(row.pending_count ?? 0),
    approved: Number(row.approved_count ?? 0),
    rejected: Number(row.rejected_count ?? 0),
  }
}

async function listSignupApplications(pool, filter = {}) {
  const normalized = normalizeSignupListFilter(filter)
  const whereClauses = []
  const params = []

  if (normalized.status) {
    whereClauses.push('sa.status = ?')
    params.push(normalized.status)
  }

  if (normalized.search) {
    whereClauses.push('(sa.name LIKE ? OR sa.email LIKE ? OR sa.organization LIKE ? OR sa.department LIKE ?)')
    const pattern = `%${normalized.search}%`
    params.push(pattern, pattern, pattern, pattern)
  }

  const sql = `
    SELECT
      sa.*,
      reviewer.username AS reviewer_name
    FROM signup_applications sa
    LEFT JOIN admin_users reviewer ON reviewer.id = sa.reviewed_by_user_id
    ${whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''}
    ORDER BY
      CASE WHEN sa.status = 'pending' THEN 0 ELSE 1 END,
      sa.created_at DESC
    LIMIT ?
  `

  const [rows] = await pool.query(sql, [...params, normalized.limit])
  return rows.map(toSignupApplicationDto)
}

async function listRecentApprovedApplications(pool, limit = 4) {
  const [rows] = await pool.query(
    `
      SELECT
        sa.*,
        reviewer.username AS reviewer_name
      FROM signup_applications sa
      LEFT JOIN admin_users reviewer ON reviewer.id = sa.reviewed_by_user_id
      WHERE sa.status = 'approved'
      ORDER BY sa.reviewed_at DESC, sa.updated_at DESC
      LIMIT ?
    `,
    [limit],
  )

  return rows.map(toSignupApplicationDto)
}

async function findBlockingApplicationByEmail(pool, email) {
  const [rows] = await pool.query(
    `
      SELECT id, status
      FROM signup_applications
      WHERE email = ? AND status IN ('pending', 'approved')
      ORDER BY id DESC
      LIMIT 1
    `,
    [email],
  )

  return rows[0] ?? null
}

async function getSignupApplicationById(pool, applicationId) {
  const [rows] = await pool.query(
    `
      SELECT
        sa.*,
        reviewer.username AS reviewer_name
      FROM signup_applications sa
      LEFT JOIN admin_users reviewer ON reviewer.id = sa.reviewed_by_user_id
      WHERE sa.id = ?
      LIMIT 1
    `,
    [applicationId],
  )

  return rows[0] ? toSignupApplicationDto(rows[0]) : null
}

async function createSignupApplication(pool, payload) {
  const [result] = await pool.execute(
    `
      INSERT INTO signup_applications (
        name,
        email,
        phone,
        organization,
        department,
        position_title,
        message,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `,
    [
      payload.name,
      payload.email,
      payload.phone || null,
      payload.organization,
      payload.department || null,
      payload.positionTitle || null,
      payload.message || null,
    ],
  )

  return Number(result.insertId)
}

async function updateSignupApplicationStatus(pool, applicationId, payload) {
  await pool.execute(
    `
      UPDATE signup_applications
      SET
        status = ?,
        review_note = ?,
        reviewed_by_user_id = ?,
        reviewed_at = CASE WHEN ? = 'pending' THEN NULL ELSE NOW() END
      WHERE id = ?
    `,
    [
      payload.status,
      payload.reviewNote || null,
      payload.reviewerUserId ?? null,
      payload.status,
      applicationId,
    ],
  )
}

export async function ensureSignupPlatformSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS signup_applications (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(40) NULL,
      organization VARCHAR(160) NOT NULL,
      department VARCHAR(120) NULL,
      position_title VARCHAR(120) NULL,
      message TEXT NULL,
      status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
      review_note TEXT NULL,
      reviewed_by_user_id INT UNSIGNED NULL,
      reviewed_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_signup_status (status),
      INDEX idx_signup_email (email),
      INDEX idx_signup_created_at (created_at),
      FOREIGN KEY (reviewed_by_user_id) REFERENCES admin_users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

export function createSignupPlatformPublicRouter(pool, options = {}) {
  const handleApiError = typeof options.handleApiError === 'function' ? options.handleApiError : null
  const createAuditLog = typeof options.createAuditLog === 'function' ? options.createAuditLog : null

  if (!handleApiError) {
    throw new Error('signup platform public router requires handleApiError')
  }

  const router = express.Router()

  router.get('/signup-platform', async (_req, res) => {
    try {
      const [counts, approvedApplications] = await Promise.all([
        getSignupPlatformCounts(pool),
        listRecentApprovedApplications(pool, 4),
      ])

      res.json({
        platform: {
          headline: 'JB Hub 가입 플랫폼',
          counts,
          approvedApplications,
        },
      })
    } catch (error) {
      handleApiError(res, error, '가입 플랫폼 요약 정보를 불러오지 못했습니다.')
    }
  })

  router.post('/signup-applications', async (req, res) => {
    try {
      const normalized = normalizeSignupApplicationInput(req.body)
      const existing = await findBlockingApplicationByEmail(pool, normalized.email)

      if (existing) {
        throw new Error(
          existing.status === 'approved'
            ? 'validation:이미 승인된 가입 신청이 있습니다.'
            : 'validation:같은 이메일로 접수된 대기 중 신청이 있습니다.',
        )
      }

      const applicationId = await createSignupApplication(pool, normalized)
      const application = await getSignupApplicationById(pool, applicationId)

      if (createAuditLog) {
        await createAuditLog(pool, 'SIGNUP_APPLICATION_CREATED', {
          applicationId,
          email: normalized.email,
          organization: normalized.organization,
        })
      }

      res.status(201).json({
        application,
        counts: await getSignupPlatformCounts(pool),
      })
    } catch (error) {
      handleApiError(res, error, '가입 신청을 접수하지 못했습니다.')
    }
  })

  return router
}

export function attachSignupPlatformAdminRoutes(router, pool, options = {}) {
  const authenticateJWT = typeof options.authenticateJWT === 'function' ? options.authenticateJWT : null
  const requireAdmin = typeof options.requireAdmin === 'function' ? options.requireAdmin : null
  const validateAdminSession =
    typeof options.validateAdminSession === 'function' ? options.validateAdminSession : null
  const handleApiError = typeof options.handleApiError === 'function' ? options.handleApiError : null
  const createAuditLog = typeof options.createAuditLog === 'function' ? options.createAuditLog : null

  if (!authenticateJWT || !requireAdmin || !validateAdminSession || !handleApiError) {
    throw new Error('signup platform admin routes require auth and error handlers')
  }

  router.get('/signup-applications', authenticateJWT, validateAdminSession, requireAdmin, async (req, res) => {
    try {
      const [applications, counts] = await Promise.all([
        listSignupApplications(pool, req.query),
        getSignupPlatformCounts(pool),
      ])

      res.json({ applications, counts })
    } catch (error) {
      handleApiError(res, error, '가입 신청 목록을 불러오지 못했습니다.')
    }
  })

  router.patch('/signup-applications/:id', authenticateJWT, validateAdminSession, requireAdmin, async (req, res) => {
    const applicationId = Number.parseInt(String(req.params.id), 10)
    if (!Number.isFinite(applicationId) || applicationId <= 0) {
      res.status(400).json({ error: '올바른 신청 ID가 아닙니다.' })
      return
    }

    try {
      const status = normalizeStatus(req.body?.status, '')
      const reviewNote = sanitizeText(String(req.body?.reviewNote ?? ''), 2000, true)

      if (!SIGNUP_STATUS_VALUES.has(status)) {
        throw new Error('validation:처리 상태는 pending, approved, rejected 중 하나여야 합니다.')
      }

      const existing = await getSignupApplicationById(pool, applicationId)
      if (!existing) {
        res.status(404).json({ error: '가입 신청을 찾을 수 없습니다.' })
        return
      }

      await updateSignupApplicationStatus(pool, applicationId, {
        status,
        reviewNote,
        reviewerUserId: req.user.userId,
      })

      if (createAuditLog) {
        await createAuditLog(
          pool,
          'SIGNUP_APPLICATION_REVIEWED',
          {
            applicationId,
            previousStatus: existing.status,
            nextStatus: status,
            email: existing.email,
          },
          req.user.userId,
        )
      }

      res.json({
        application: await getSignupApplicationById(pool, applicationId),
        counts: await getSignupPlatformCounts(pool),
      })
    } catch (error) {
      handleApiError(res, error, '가입 신청 상태를 변경하지 못했습니다.')
    }
  })

  router.delete('/signup-applications/:id', authenticateJWT, validateAdminSession, requireAdmin, async (req, res) => {
    const applicationId = Number.parseInt(String(req.params.id), 10)
    if (!Number.isFinite(applicationId) || applicationId <= 0) {
      res.status(400).json({ error: '올바른 신청 ID가 아닙니다.' })
      return
    }

    try {
      const existing = await getSignupApplicationById(pool, applicationId)
      if (!existing) {
        res.status(404).json({ error: '가입 신청을 찾을 수 없습니다.' })
        return
      }

      await pool.execute('DELETE FROM signup_applications WHERE id = ?', [applicationId])

      if (createAuditLog) {
        await createAuditLog(
          pool,
          'SIGNUP_APPLICATION_DELETED',
          {
            applicationId,
            email: existing.email,
          },
          req.user.userId,
        )
      }

      res.json({
        removedApplicationId: applicationId,
        counts: await getSignupPlatformCounts(pool),
      })
    } catch (error) {
      handleApiError(res, error, '가입 신청을 삭제하지 못했습니다.')
    }
  })
}
