import { getApiBase } from './api-base'

const API_BASE = getApiBase('/api/v1/tools')

export interface OcrToolResponse {
  text: string
  language: string
  fileName: string
}

export interface PdfToolMeta {
  pageCount: number
  fileName: string
}

export interface ToolBinaryResult {
  blob: Blob
  fileName: string
}

async function extractApiError(response: Response, fallbackMessage: string) {
  try {
    const payload = (await response.json()) as { error?: unknown }
    if (typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error
    }
  } catch {
    // Ignore invalid payloads and use the fallback message.
  }

  return fallbackMessage
}

function parseContentDispositionFileName(headerValue: string | null) {
  if (!headerValue) {
    return null
  }

  const utf8Match = headerValue.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1])
    } catch {
      // Fall back to plain filename parsing below.
    }
  }

  const plainMatch = headerValue.match(/filename="([^"]+)"/i) || headerValue.match(/filename=([^;]+)/i)
  if (plainMatch?.[1]) {
    return plainMatch[1].trim()
  }

  return null
}

async function requestBinary(
  endpoint: string,
  formData: FormData,
  fallbackMessage: string,
  fallbackFileName: string,
): Promise<ToolBinaryResult> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error(await extractApiError(response, fallbackMessage))
  }

  const blob = await response.blob()
  const fileName = parseContentDispositionFileName(response.headers.get('content-disposition')) ?? fallbackFileName
  return { blob, fileName }
}

export async function runOcrTool(file: File, language: string) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('lang', language)

  const response = await fetch(`${API_BASE}/ocr`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error(await extractApiError(response, 'OCR 처리에 실패했습니다.'))
  }

  const payload = (await response.json()) as {
    text?: unknown
    language?: unknown
    fileName?: unknown
  }

  return {
    text: typeof payload.text === 'string' ? payload.text : '',
    language: typeof payload.language === 'string' ? payload.language : language,
    fileName: typeof payload.fileName === 'string' ? payload.fileName : file.name,
  } satisfies OcrToolResponse
}

export async function convertImageTool(file: File, targetFormat: string) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('targetFormat', targetFormat)

  return await requestBinary(
    '/convert-image',
    formData,
    '이미지 변환에 실패했습니다.',
    `converted.${targetFormat}`,
  )
}

export async function fetchPdfToolMeta(file: File) {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${API_BASE}/pdf-meta`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error(await extractApiError(response, 'PDF 정보를 확인하지 못했습니다.'))
  }

  const payload = (await response.json()) as {
    pageCount?: unknown
    fileName?: unknown
  }

  return {
    pageCount: typeof payload.pageCount === 'number' ? payload.pageCount : 0,
    fileName: typeof payload.fileName === 'string' ? payload.fileName : file.name,
  } satisfies PdfToolMeta
}

export async function slicePdfTool(file: File, startPage: number, endPage: number) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('startPage', String(startPage))
  formData.append('endPage', String(endPage))

  return await requestBinary(
    '/slice-pdf',
    formData,
    'PDF 페이지 자르기에 실패했습니다.',
    'sliced.pdf',
  )
}

export async function compressPdfTool(file: File) {
  const formData = new FormData()
  formData.append('file', file)

  return await requestBinary(
    '/compress-pdf',
    formData,
    'PDF 최적화에 실패했습니다.',
    'optimized.pdf',
  )
}
