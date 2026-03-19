import express from 'express'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { PDFDocument } from 'pdf-lib'

const execFileAsync = promisify(execFile)

const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.tif',
  '.tiff',
  '.webp',
  '.heic',
  '.heif',
])

const IMAGE_FORMAT_MAP = {
  png: { extension: 'png', sipsFormat: 'png', contentType: 'image/png' },
  jpg: { extension: 'jpg', sipsFormat: 'jpeg', contentType: 'image/jpeg' },
  gif: { extension: 'gif', sipsFormat: 'gif', contentType: 'image/gif' },
  bmp: { extension: 'bmp', sipsFormat: 'bmp', contentType: 'image/bmp' },
  tif: { extension: 'tif', sipsFormat: 'tiff', contentType: 'image/tiff' },
}

class ToolApiError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'ToolApiError'
    this.status = status
  }
}

function safeFileName(fileName, fallback = 'file') {
  if (typeof fileName !== 'string' || !fileName.trim()) {
    return fallback
  }

  return fileName.replace(/[\\/]/g, '_')
}

function getSingleUploadedFile(req, fieldNames = ['file']) {
  const fileBag = req.files
  if (!fileBag || typeof fileBag !== 'object') {
    throw new ToolApiError(400, '파일을 선택해 주세요.')
  }

  for (const fieldName of fieldNames) {
    const candidate = fileBag[fieldName]
    if (!candidate) {
      continue
    }

    if (Array.isArray(candidate)) {
      if (candidate.length === 0) {
        continue
      }
      return candidate[0]
    }

    return candidate
  }

  throw new ToolApiError(400, '파일을 선택해 주세요.')
}

function getLowerCaseExtension(fileName) {
  return path.extname(String(fileName || '')).toLowerCase()
}

function isImageUpload(uploadedFile) {
  const mimeType = typeof uploadedFile.mimetype === 'string' ? uploadedFile.mimetype.toLowerCase() : ''
  const extension = getLowerCaseExtension(uploadedFile.name)
  return mimeType.startsWith('image/') || SUPPORTED_IMAGE_EXTENSIONS.has(extension)
}

function isPdfUpload(uploadedFile) {
  const mimeType = typeof uploadedFile.mimetype === 'string' ? uploadedFile.mimetype.toLowerCase() : ''
  const extension = getLowerCaseExtension(uploadedFile.name)
  return mimeType.includes('pdf') || extension === '.pdf'
}

async function materializeUploadedFile(uploadedFile) {
  const originalName = safeFileName(uploadedFile.name)
  const extension = getLowerCaseExtension(originalName)

  if (typeof uploadedFile.tempFilePath === 'string' && uploadedFile.tempFilePath.trim()) {
    const tempFilePath = uploadedFile.tempFilePath
    return {
      originalName,
      filePath: tempFilePath,
      cleanup: async () => {
        await fs.promises.rm(tempFilePath, { force: true }).catch(() => {})
      },
      extension,
    }
  }

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'jbhub-tools-'))
  const tempFilePath = path.join(tempDir, originalName || `upload${extension}`)
  const data = Buffer.isBuffer(uploadedFile.data) ? uploadedFile.data : Buffer.from(uploadedFile.data ?? '')
  await fs.promises.writeFile(tempFilePath, data)

  return {
    originalName,
    filePath: tempFilePath,
    cleanup: async () => {
      await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
    },
    extension,
  }
}

function normalizeOcrLanguage(rawLanguage) {
  const normalized = typeof rawLanguage === 'string' && rawLanguage.trim() ? rawLanguage.trim() : 'kor+eng'
  if (!/^[A-Za-z0-9_+]+$/.test(normalized)) {
    throw new ToolApiError(400, 'OCR 언어 설정이 올바르지 않습니다.')
  }
  return normalized
}

function getTargetImageFormat(rawTargetFormat) {
  const normalized = typeof rawTargetFormat === 'string' && rawTargetFormat.trim()
    ? rawTargetFormat.trim().toLowerCase()
    : 'png'

  if (normalized === 'jpeg') {
    return IMAGE_FORMAT_MAP.jpg
  }
  if (normalized === 'tiff') {
    return IMAGE_FORMAT_MAP.tif
  }

  const resolved = IMAGE_FORMAT_MAP[normalized]
  if (!resolved) {
    throw new ToolApiError(400, '지원하지 않는 이미지 변환 형식입니다. (png, jpg, gif, bmp, tif)')
  }

  return resolved
}

function parsePositivePageNumber(rawValue, fieldLabel) {
  const parsed = Number.parseInt(String(rawValue ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new ToolApiError(400, `${fieldLabel}는 1 이상의 숫자여야 합니다.`)
  }
  return parsed
}

async function runTesseract(filePath, language) {
  try {
    const { stdout } = await execFileAsync('tesseract', [filePath, 'stdout', '-l', language, '--psm', '6'], {
      maxBuffer: 10 * 1024 * 1024,
    })
    return stdout.trim()
  } catch (error) {
    const details = error instanceof Error && 'stderr' in error && typeof error.stderr === 'string'
      ? error.stderr.trim()
      : ''
    throw new ToolApiError(500, details || 'OCR 처리 중 오류가 발생했습니다.')
  }
}

async function convertImageWithSips(filePath, targetFormat) {
  const outputDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'jbhub-tools-image-'))
  const outputPath = path.join(outputDir, `converted.${targetFormat.extension}`)

  try {
    await execFileAsync('sips', ['-s', 'format', targetFormat.sipsFormat, filePath, '--out', outputPath], {
      maxBuffer: 10 * 1024 * 1024,
    })
    const bytes = await fs.promises.readFile(outputPath)
    return {
      bytes,
      contentType: targetFormat.contentType,
    }
  } catch (error) {
    const details = error instanceof Error && 'stderr' in error && typeof error.stderr === 'string'
      ? error.stderr.trim()
      : ''
    throw new ToolApiError(500, details || '이미지 변환 중 오류가 발생했습니다.')
  } finally {
    await fs.promises.rm(outputDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function loadPdfDocument(bytes) {
  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  } catch {
    throw new ToolApiError(400, 'PDF 파일을 읽을 수 없습니다.')
  }
}

async function getPdfMeta(bytes) {
  const document = await loadPdfDocument(bytes)
  const pageCount = document.getPageCount()
  if (pageCount < 1) {
    throw new ToolApiError(400, '페이지가 없는 PDF입니다.')
  }
  return { pageCount }
}

async function slicePdf(bytes, startPage, endPage) {
  const input = await loadPdfDocument(bytes)
  const pageCount = input.getPageCount()

  if (endPage < startPage) {
    throw new ToolApiError(400, '끝 페이지는 시작 페이지보다 크거나 같아야 합니다.')
  }
  if (endPage > pageCount) {
    throw new ToolApiError(400, `페이지 범위가 PDF 총 페이지 수(${pageCount}페이지)를 벗어났습니다.`)
  }

  const output = await PDFDocument.create()
  const indexes = Array.from({ length: endPage - startPage + 1 }, (_, index) => startPage - 1 + index)
  const copiedPages = await output.copyPages(input, indexes)
  for (const page of copiedPages) {
    output.addPage(page)
  }

  const slicedBytes = await output.save({ useObjectStreams: true })
  return {
    bytes: Buffer.from(slicedBytes),
    pageCount,
  }
}

async function optimizePdf(bytes) {
  const input = await loadPdfDocument(bytes)
  const output = await PDFDocument.create()
  const copiedPages = await output.copyPages(
    input,
    Array.from({ length: input.getPageCount() }, (_, index) => index),
  )

  for (const page of copiedPages) {
    output.addPage(page)
  }

  const optimizedBytes = Buffer.from(await output.save({ useObjectStreams: true }))
  const reduced = optimizedBytes.length < bytes.length
  return {
    bytes: reduced ? optimizedBytes : bytes,
    reduced,
  }
}

function replaceExtension(fileName, extension) {
  const safeName = safeFileName(fileName)
  const lastDot = safeName.lastIndexOf('.')
  const base = lastDot > 0 ? safeName.slice(0, lastDot) : safeName
  return `${base}.${extension}`
}

function appendPdfSuffix(fileName, suffix) {
  const safeName = safeFileName(fileName, 'document.pdf')
  const lowerName = safeName.toLowerCase()
  if (lowerName.endsWith('.pdf')) {
    return `${safeName.slice(0, -4)}${suffix}.pdf`
  }
  return `${safeName}${suffix}.pdf`
}

function buildContentDisposition(fileName) {
  const safeName = safeFileName(fileName)
  const asciiFallback = safeName.replace(/[^\x20-\x7E]/g, '_')
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(safeName)}`
}

function sendBinaryFile(res, { bytes, fileName, contentType }) {
  res.setHeader('Content-Type', contentType)
  res.setHeader('Content-Disposition', buildContentDisposition(fileName))
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Length', String(bytes.length))
  res.send(bytes)
}

function handleRouteError(res, req, error, fallbackMessage) {
  const status = error instanceof ToolApiError ? error.status : 500
  const message = error instanceof Error && error.message ? error.message : fallbackMessage
  res.status(status).json({
    success: false,
    error: message,
    requestId: req.requestId ?? null,
  })
}

export function createToolsRouter() {
  const router = express.Router()

  router.post('/ocr', async (req, res) => {
    let uploaded

    try {
      uploaded = getSingleUploadedFile(req, ['file', 'image'])
      if (!isImageUpload(uploaded)) {
        throw new ToolApiError(400, '이미지 파일만 OCR을 실행할 수 있습니다.')
      }

      const language = normalizeOcrLanguage(req.body?.lang)
      const materialized = await materializeUploadedFile(uploaded)

      try {
        const text = await runTesseract(materialized.filePath, language)
        res.json({
          success: true,
          text,
          language,
          fileName: materialized.originalName,
        })
      } finally {
        await materialized.cleanup()
      }
    } catch (error) {
      handleRouteError(res, req, error, 'OCR 처리에 실패했습니다.')
    }
  })

  router.post('/convert-image', async (req, res) => {
    try {
      const uploaded = getSingleUploadedFile(req, ['file'])
      if (!isImageUpload(uploaded)) {
        throw new ToolApiError(400, '이미지 파일만 변환할 수 있습니다.')
      }

      const targetFormat = getTargetImageFormat(req.body?.targetFormat)
      const materialized = await materializeUploadedFile(uploaded)

      try {
        const converted = await convertImageWithSips(materialized.filePath, targetFormat)
        sendBinaryFile(res, {
          bytes: converted.bytes,
          fileName: replaceExtension(materialized.originalName, targetFormat.extension),
          contentType: converted.contentType,
        })
      } finally {
        await materialized.cleanup()
      }
    } catch (error) {
      handleRouteError(res, req, error, '이미지 변환에 실패했습니다.')
    }
  })

  router.post('/pdf-meta', async (req, res) => {
    try {
      const uploaded = getSingleUploadedFile(req, ['file'])
      if (!isPdfUpload(uploaded)) {
        throw new ToolApiError(400, 'PDF 파일만 처리할 수 있습니다.')
      }

      const materialized = await materializeUploadedFile(uploaded)

      try {
        const bytes = await fs.promises.readFile(materialized.filePath)
        const meta = await getPdfMeta(bytes)
        res.json({
          success: true,
          pageCount: meta.pageCount,
          fileName: materialized.originalName,
        })
      } finally {
        await materialized.cleanup()
      }
    } catch (error) {
      handleRouteError(res, req, error, 'PDF 정보를 확인하지 못했습니다.')
    }
  })

  router.post('/slice-pdf', async (req, res) => {
    try {
      const uploaded = getSingleUploadedFile(req, ['file'])
      if (!isPdfUpload(uploaded)) {
        throw new ToolApiError(400, 'PDF 파일만 자를 수 있습니다.')
      }

      const startPage = parsePositivePageNumber(req.body?.startPage, '시작 페이지')
      const endPage = parsePositivePageNumber(req.body?.endPage, '끝 페이지')
      const materialized = await materializeUploadedFile(uploaded)

      try {
        const bytes = await fs.promises.readFile(materialized.filePath)
        const sliced = await slicePdf(bytes, startPage, endPage)
        const suffix = startPage === endPage ? `-p${startPage}` : `-p${startPage}-${endPage}`

        sendBinaryFile(res, {
          bytes: sliced.bytes,
          fileName: appendPdfSuffix(materialized.originalName, suffix),
          contentType: 'application/pdf',
        })
      } finally {
        await materialized.cleanup()
      }
    } catch (error) {
      handleRouteError(res, req, error, 'PDF 페이지 자르기에 실패했습니다.')
    }
  })

  router.post('/compress-pdf', async (req, res) => {
    try {
      const uploaded = getSingleUploadedFile(req, ['file'])
      if (!isPdfUpload(uploaded)) {
        throw new ToolApiError(400, 'PDF 파일만 최적화할 수 있습니다.')
      }

      const materialized = await materializeUploadedFile(uploaded)

      try {
        const bytes = await fs.promises.readFile(materialized.filePath)
        const optimized = await optimizePdf(bytes)

        sendBinaryFile(res, {
          bytes: optimized.bytes,
          fileName: appendPdfSuffix(
            materialized.originalName,
            optimized.reduced ? '-optimized' : '-unchanged',
          ),
          contentType: 'application/pdf',
        })
      } finally {
        await materialized.cleanup()
      }
    } catch (error) {
      handleRouteError(res, req, error, 'PDF 최적화에 실패했습니다.')
    }
  })

  return router
}
