type ExportRow = Record<string, unknown>

function ensureBrowser() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('브라우저 환경에서만 내보내기를 지원합니다.')
  }
}

function downloadBlob(content: BlobPart, mimeType: string, fileName: string) {
  ensureBrowser()
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.style.display = 'none'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}

function escapeCsvCell(value: unknown): string {
  const normalized = value === null || value === undefined ? '' : String(value)
  const escaped = normalized.replace(/"/g, '""')
  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped
}

function buildCsv(rows: ExportRow[]): string {
  if (rows.length === 0) {
    return ''
  }

  const headers = Array.from(
    rows.reduce((headerSet, row) => {
      Object.keys(row).forEach((key) => headerSet.add(key))
      return headerSet
    }, new Set<string>()),
  )

  const headerLine = headers.map(escapeCsvCell).join(',')
  const dataLines = rows.map((row) => headers.map((header) => escapeCsvCell(row[header])).join(','))

  return [headerLine, ...dataLines].join('\n')
}

export function exportToCSV(rows: ExportRow[], fileName: string) {
  const csv = buildCsv(rows)
  downloadBlob(csv, 'text/csv;charset=utf-8', fileName)
}

export function exportToJSON(rows: ExportRow[], fileName: string) {
  const json = JSON.stringify(rows, null, 2)
  downloadBlob(json, 'application/json;charset=utf-8', fileName)
}
