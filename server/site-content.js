import express from 'express'

const SITE_CONTENT_DEFINITIONS = [
  {
    key: 'brand.badge',
    label: '브랜드 배지',
    group: 'branding',
    defaultValue: 'JB Hub',
    isMultiline: false,
    description: '좌측 브랜딩 영역 상단에 표시되는 짧은 배지입니다.',
    displayOrder: 10,
  },
  {
    key: 'brand.name',
    label: '브랜드 이름',
    group: 'branding',
    defaultValue: 'JB Hub',
    isMultiline: false,
    description: '서비스 대표 이름입니다.',
    displayOrder: 20,
  },
  {
    key: 'home.eyebrow',
    label: '홈 상단 라벨',
    group: 'home',
    defaultValue: 'JB Hub · 사내 프로젝트 허브',
    isMultiline: false,
    description: '홈 상단의 작은 라벨 문구입니다.',
    displayOrder: 30,
  },
  {
    key: 'home.title',
    label: '홈 메인 제목',
    group: 'home',
    defaultValue: '흩어진 업무 도구를 한 곳에서',
    isMultiline: false,
    description: '홈 화면의 대표 제목입니다.',
    displayOrder: 40,
  },
  {
    key: 'home.highlight',
    label: '홈 강조 제목',
    group: 'home',
    defaultValue: '빠르게 탐색하고 비교하세요',
    isMultiline: false,
    description: '홈 화면 제목 아래 강조 문구입니다.',
    displayOrder: 50,
  },
  {
    key: 'home.description',
    label: '홈 설명',
    group: 'home',
    defaultValue:
      '카테고리, 부서, 스타 조건으로 필요한 프로젝트를 즉시 찾고 팀에 맞는 도구를 빠르게 선택할 수 있습니다.',
    isMultiline: true,
    description: '홈 화면의 대표 설명 문구입니다.',
    displayOrder: 60,
  },
  {
    key: 'explore.title',
    label: '탐색 제목',
    group: 'explore',
    defaultValue: '프로젝트 탐색',
    isMultiline: false,
    description: '탐색 페이지 제목입니다.',
    displayOrder: 70,
  },
  {
    key: 'explore.description',
    label: '탐색 설명',
    group: 'explore',
    defaultValue:
      '카테고리, 부서, 즐겨찾기, 신규 여부, 최소 스타 조건을 조합해 필요한 프로젝트를 정확하게 찾으세요.',
    isMultiline: true,
    description: '탐색 페이지 설명 문구입니다.',
    displayOrder: 80,
  },
  {
    key: 'ops.notice',
    label: '운영 공지',
    group: 'operations',
    defaultValue: '운영 공지는 관리자 콘솔에서 바로 수정할 수 있습니다.',
    isMultiline: true,
    description: '운영자 콘솔 상단에 표시되는 공지 문구입니다.',
    displayOrder: 90,
  },
]

function sanitizeContentValue(value, maxLength = 5000) {
  if (value === null || value === undefined) {
    return ''
  }

  return String(value)
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength)
}

function normalizeEntryInput(payload) {
  if (Array.isArray(payload)) {
    return payload
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null
        }

        return {
          key: sanitizeContentValue(entry.key, 120),
          value: sanitizeContentValue(entry.value),
        }
      })
      .filter(Boolean)
  }

  if (payload && typeof payload === 'object') {
    return Object.entries(payload).map(([key, value]) => ({
      key: sanitizeContentValue(key, 120),
      value: sanitizeContentValue(value),
    }))
  }

  return []
}

export async function ensureSiteContentSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_content (
      content_key VARCHAR(120) NOT NULL,
      content_group VARCHAR(64) NOT NULL,
      label VARCHAR(120) NOT NULL,
      description VARCHAR(255) NULL,
      content_value TEXT NOT NULL,
      is_multiline TINYINT(1) NOT NULL DEFAULT 0,
      display_order INT UNSIGNED NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (content_key),
      INDEX idx_site_content_group (content_group),
      INDEX idx_site_content_order (display_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  for (const definition of SITE_CONTENT_DEFINITIONS) {
    await pool.execute(
      `
        INSERT INTO site_content (
          content_key,
          content_group,
          label,
          description,
          content_value,
          is_multiline,
          display_order
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          content_group = VALUES(content_group),
          label = VALUES(label),
          description = VALUES(description),
          is_multiline = VALUES(is_multiline),
          display_order = VALUES(display_order)
      `,
      [
        definition.key,
        definition.group,
        definition.label,
        definition.description,
        definition.defaultValue,
        definition.isMultiline ? 1 : 0,
        definition.displayOrder,
      ],
    )
  }
}

export async function listSiteContentEntries(pool) {
  const [rows] = await pool.query(
    `
      SELECT
        content_key,
        content_group,
        label,
        description,
        content_value,
        is_multiline,
        display_order,
        updated_at
      FROM site_content
      ORDER BY display_order ASC, content_key ASC
    `,
  )

  const rowMap = new Map(rows.map((row) => [row.content_key, row]))

  return SITE_CONTENT_DEFINITIONS.map((definition) => {
    const row = rowMap.get(definition.key)

    return {
      key: definition.key,
      group: definition.group,
      label: row?.label ?? definition.label,
      description: row?.description ?? definition.description,
      value: row?.content_value ?? definition.defaultValue,
      isMultiline: Boolean(row?.is_multiline ?? definition.isMultiline),
      updatedAt: row?.updated_at?.toISOString?.() ?? row?.updated_at ?? null,
      displayOrder: Number(row?.display_order ?? definition.displayOrder),
    }
  })
}

export async function getPublicSiteContentMap(pool) {
  const entries = await listSiteContentEntries(pool)
  return Object.fromEntries(entries.map((entry) => [entry.key, entry.value]))
}

export async function updateSiteContentEntries(pool, nextEntries) {
  for (const entry of nextEntries) {
    const definition = SITE_CONTENT_DEFINITIONS.find((item) => item.key === entry.key)
    if (!definition) {
      throw new Error(`validation:Unknown site content key: ${entry.key}`)
    }

    const value = sanitizeContentValue(entry.value)
    await pool.execute(
      `
        UPDATE site_content
        SET content_value = ?
        WHERE content_key = ?
      `,
      [value, entry.key],
    )
  }

  return await listSiteContentEntries(pool)
}

export function createSiteContentPublicRouter(pool, options = {}) {
  const handleApiError = typeof options.handleApiError === 'function' ? options.handleApiError : null
  if (!handleApiError) {
    throw new Error('createSiteContentPublicRouter requires handleApiError')
  }

  const router = express.Router()

  router.get('/site-content', async (_req, res) => {
    try {
      res.json({
        content: await getPublicSiteContentMap(pool),
      })
    } catch (error) {
      handleApiError(res, error, '사이트 문구를 불러오지 못했습니다.')
    }
  })

  return router
}

export function attachAdminSiteContentRoutes(router, pool, options = {}) {
  const authenticateJWT = typeof options.authenticateJWT === 'function' ? options.authenticateJWT : null
  const requireAdmin = typeof options.requireAdmin === 'function' ? options.requireAdmin : null
  const handleApiError = typeof options.handleApiError === 'function' ? options.handleApiError : null
  const createAuditLog = typeof options.createAuditLog === 'function' ? options.createAuditLog : null

  if (!authenticateJWT || !requireAdmin || !handleApiError || !createAuditLog) {
    throw new Error('attachAdminSiteContentRoutes requires authentication, admin, error, and audit helpers')
  }

  router.get('/site-content', authenticateJWT, requireAdmin, async (_req, res) => {
    try {
      res.json({
        entries: await listSiteContentEntries(pool),
      })
    } catch (error) {
      handleApiError(res, error, '운영 문구를 불러오지 못했습니다.')
    }
  })

  router.patch('/site-content', authenticateJWT, requireAdmin, async (req, res) => {
    try {
      const nextEntries = normalizeEntryInput(req.body?.entries)
      if (nextEntries.length === 0) {
        res.status(400).json({ error: 'At least one content entry is required.' })
        return
      }

      const updatedEntries = await updateSiteContentEntries(pool, nextEntries)

      await createAuditLog(pool, 'SITE_CONTENT_UPDATED', {
        updatedKeys: nextEntries.map((entry) => entry.key),
        adminUserId: req.user.userId,
      })

      res.json({
        message: 'Site content updated successfully',
        entries: updatedEntries,
      })
    } catch (error) {
      handleApiError(res, error, '운영 문구를 저장하지 못했습니다.')
    }
  })
}
