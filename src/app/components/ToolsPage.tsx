import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import {
  Copy,
  Download,
  FileImage,
  FileText,
  Image,
  Loader2,
  RefreshCw,
  Scissors,
  Sparkles,
  Upload,
  Wrench,
} from 'lucide-react'
import { PageHeader, PageShell, Pill } from './common'
import { copyTextToClipboard } from '../lib/clipboard'
import {
  compressPdfTool,
  convertImageTool,
  fetchPdfToolMeta,
  runOcrTool,
  slicePdfTool,
} from '../lib/tools-api'

type ToolTabId = 'ocr' | 'image' | 'pdf'

interface Point {
  x: number
  y: number
}

interface SelectionRect {
  x: number
  y: number
  width: number
  height: number
}

const TOOL_TABS: Array<{ id: ToolTabId; label: string; description: string }> = [
  { id: 'ocr', label: 'OCR 작업실', description: '문서 이미지를 읽어 텍스트를 바로 추출합니다.' },
  { id: 'image', label: '이미지 변환', description: '자주 쓰는 이미지 형식 변환을 빠르게 처리합니다.' },
  { id: 'pdf', label: 'PDF 도구', description: '페이지 확인, 자르기, 최적화를 한 화면에서 진행합니다.' },
]

function downloadBlob(blob: Blob, fileName: string) {
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.URL.revokeObjectURL(url)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function normalizeRect(start: Point, end: Point): SelectionRect {
  const x = Math.min(start.x, end.x)
  const y = Math.min(start.y, end.y)
  const width = Math.abs(end.x - start.x)
  const height = Math.abs(end.y - start.y)
  return { x, y, width, height }
}

function getRelativePoint(event: MouseEvent<HTMLElement>, image: HTMLImageElement): Point | null {
  const rect = image.getBoundingClientRect()
  const insideX = event.clientX >= rect.left && event.clientX <= rect.right
  const insideY = event.clientY >= rect.top && event.clientY <= rect.bottom

  if (!insideX || !insideY) {
    return null
  }

  return {
    x: clamp(event.clientX - rect.left, 0, rect.width),
    y: clamp(event.clientY - rect.top, 0, rect.height),
  }
}

async function cropImageFromSelection(
  image: HTMLImageElement,
  selection: SelectionRect,
  fileName: string,
): Promise<File> {
  const scaleX = image.naturalWidth / image.clientWidth
  const scaleY = image.naturalHeight / image.clientHeight
  const sourceX = Math.max(0, Math.round(selection.x * scaleX))
  const sourceY = Math.max(0, Math.round(selection.y * scaleY))
  const sourceWidth = Math.max(1, Math.round(selection.width * scaleX))
  const sourceHeight = Math.max(1, Math.round(selection.height * scaleY))

  const canvas = document.createElement('canvas')
  canvas.width = sourceWidth
  canvas.height = sourceHeight
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('이미지 캔버스를 준비하지 못했습니다.')
  }

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    sourceWidth,
    sourceHeight,
  )

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (nextBlob) {
        resolve(nextBlob)
        return
      }

      reject(new Error('선택한 영역을 이미지로 만들지 못했습니다.'))
    }, 'image/png')
  })

  return new File([blob], `${fileName.replace(/\.[^.]+$/, '') || 'ocr-selection'}.png`, {
    type: 'image/png',
  })
}

function getToolIcon(tabId: ToolTabId) {
  switch (tabId) {
    case 'ocr':
      return Sparkles
    case 'image':
      return FileImage
    case 'pdf':
      return FileText
  }
}

interface ToolDropZoneProps {
  title: string
  description: string
  accept: string
  selectedFile: File | null
  onFileChange: (file: File | null) => void
}

function ToolDropZone({
  title,
  description,
  accept,
  selectedFile,
  onFileChange,
}: ToolDropZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          inputRef.current?.click()
        }
      }}
      onDragOver={(event) => {
        event.preventDefault()
      }}
      onDrop={(event) => {
        event.preventDefault()
        const file = event.dataTransfer.files[0] ?? null
        onFileChange(file)
      }}
      className="rounded-3xl border border-dashed border-slate-300/80 bg-slate-50/70 p-5 text-left transition hover:border-slate-400 hover:bg-white"
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          onFileChange(event.target.files?.[0] ?? null)
        }}
      />

      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
          <Upload className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-sm leading-6 text-slate-600">{description}</p>
          <p className="text-xs text-slate-500">
            {selectedFile ? `선택됨: ${selectedFile.name}` : '클릭하거나 파일을 드래그해서 올리세요.'}
          </p>
        </div>
      </div>
    </div>
  )
}

interface StatusPanelProps {
  title: string
  description: string
  tone?: 'default' | 'success' | 'warning'
}

function StatusPanel({ title, description, tone = 'default' }: StatusPanelProps) {
  const toneClassName =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50/90 text-emerald-900'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50/90 text-amber-900'
        : 'border-slate-200 bg-slate-50/90 text-slate-900'

  return (
    <div className={`rounded-3xl border px-4 py-3 ${toneClassName}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-6 text-current/80">{description}</p>
    </div>
  )
}

interface ToolSectionHeaderProps {
  icon: ReactNode
  title: string
  description: string
  badge?: ReactNode
}

function ToolSectionHeader({ icon, title, description, badge }: ToolSectionHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
          {icon}
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <p className="text-sm leading-6 text-slate-600">{description}</p>
        </div>
      </div>
      {badge ? <div className="shrink-0">{badge}</div> : null}
    </div>
  )
}

interface ToolActionButtonProps {
  label: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
  variant?: 'primary' | 'secondary'
}

function ToolActionButton({
  label,
  icon,
  onClick,
  disabled = false,
  variant = 'primary',
}: ToolActionButtonProps) {
  const className =
    variant === 'primary'
      ? 'bg-slate-950 text-white hover:bg-slate-800 disabled:bg-slate-300'
      : 'border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 disabled:text-slate-400'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed ${className}`}
    >
      {icon}
      {label}
    </button>
  )
}

export function ToolsPage() {
  const [activeTab, setActiveTab] = useState<ToolTabId>('ocr')

  const [ocrFile, setOcrFile] = useState<File | null>(null)
  const [ocrPreviewUrl, setOcrPreviewUrl] = useState<string | null>(null)
  const [ocrLanguage, setOcrLanguage] = useState('kor+eng')
  const [ocrText, setOcrText] = useState('')
  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrStatus, setOcrStatus] = useState('이미지를 올린 뒤 전체 OCR 또는 영역 OCR을 실행해 보세요.')
  const [ocrSelection, setOcrSelection] = useState<SelectionRect | null>(null)
  const [ocrDragStart, setOcrDragStart] = useState<Point | null>(null)

  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [imageFormat, setImageFormat] = useState('png')
  const [imageBusy, setImageBusy] = useState(false)
  const [imageStatus, setImageStatus] = useState('이미지 파일을 올리고 원하는 형식을 선택하세요.')

  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfPageCount, setPdfPageCount] = useState<number | null>(null)
  const [pdfStartPage, setPdfStartPage] = useState(1)
  const [pdfEndPage, setPdfEndPage] = useState(1)
  const [pdfMetaLoading, setPdfMetaLoading] = useState(false)
  const [pdfBusyAction, setPdfBusyAction] = useState<'slice' | 'compress' | null>(null)
  const [pdfStatus, setPdfStatus] = useState('PDF 파일을 올리면 페이지 수를 확인하고 도구를 활성화합니다.')

  const ocrImageRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    if (!ocrFile) {
      setOcrPreviewUrl(null)
      setOcrText('')
      setOcrSelection(null)
      setOcrStatus('이미지를 올린 뒤 전체 OCR 또는 영역 OCR을 실행해 보세요.')
      return
    }

    const nextUrl = URL.createObjectURL(ocrFile)
    setOcrPreviewUrl(nextUrl)
    setOcrText('')
    setOcrSelection(null)
    setOcrStatus('이미지를 준비했습니다. 필요한 경우 미리보기에서 영역을 드래그해 선택하세요.')

    return () => URL.revokeObjectURL(nextUrl)
  }, [ocrFile])

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null)
      setImageStatus('이미지 파일을 올리고 원하는 형식을 선택하세요.')
      return
    }

    const nextUrl = URL.createObjectURL(imageFile)
    setImagePreviewUrl(nextUrl)
    setImageStatus(`${imageFile.name}을 준비했습니다. 출력 형식을 골라 주세요.`)

    return () => URL.revokeObjectURL(nextUrl)
  }, [imageFile])

  useEffect(() => {
    let cancelled = false

    if (!pdfFile) {
      setPdfPageCount(null)
      setPdfStartPage(1)
      setPdfEndPage(1)
      setPdfMetaLoading(false)
      setPdfStatus('PDF 파일을 올리면 페이지 수를 확인하고 도구를 활성화합니다.')
      return
    }

    setPdfMetaLoading(true)
    setPdfStatus('PDF 페이지 수를 확인하는 중입니다.')

    void fetchPdfToolMeta(pdfFile)
      .then((meta) => {
        if (cancelled) {
          return
        }

        setPdfPageCount(meta.pageCount)
        setPdfStartPage(1)
        setPdfEndPage(meta.pageCount)
        setPdfStatus(`총 ${meta.pageCount}페이지를 확인했습니다. 자를 범위를 선택하거나 최적화를 실행하세요.`)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        const message = error instanceof Error ? error.message : 'PDF 정보를 확인하지 못했습니다.'
        setPdfPageCount(null)
        setPdfStatus(message)
      })
      .finally(() => {
        if (!cancelled) {
          setPdfMetaLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [pdfFile])

  async function executeOcr(useSelection: boolean) {
    if (!ocrFile) {
      setOcrStatus('먼저 OCR할 이미지를 선택해 주세요.')
      return
    }

    try {
      setOcrBusy(true)
      setOcrStatus(useSelection ? '선택한 영역의 OCR을 실행하는 중입니다.' : '전체 이미지 OCR을 실행하는 중입니다.')

      let nextFile = ocrFile
      if (useSelection) {
        const image = ocrImageRef.current
        if (!image || !ocrSelection || ocrSelection.width < 10 || ocrSelection.height < 10) {
          throw new Error('먼저 미리보기에서 OCR할 영역을 드래그해 주세요.')
        }

        nextFile = await cropImageFromSelection(image, ocrSelection, ocrFile.name)
      }

      const result = await runOcrTool(nextFile, ocrLanguage)
      setOcrText(result.text)
      setOcrStatus(result.text.trim() ? 'OCR 결과를 가져왔습니다.' : '텍스트를 찾지 못했습니다. 다른 영역이나 더 선명한 이미지를 시도해 보세요.')
    } catch (error) {
      setOcrStatus(error instanceof Error ? error.message : 'OCR 처리에 실패했습니다.')
    } finally {
      setOcrBusy(false)
    }
  }

  async function handleCopyOcrResult() {
    if (!ocrText.trim()) {
      setOcrStatus('복사할 OCR 결과가 아직 없습니다.')
      return
    }

    const copied = await copyTextToClipboard(ocrText)
    setOcrStatus(copied ? 'OCR 결과를 클립보드에 복사했습니다.' : '클립보드 복사에 실패했습니다.')
  }

  async function handleConvertImage() {
    if (!imageFile) {
      setImageStatus('먼저 변환할 이미지를 선택해 주세요.')
      return
    }

    try {
      setImageBusy(true)
      setImageStatus('이미지를 변환하고 다운로드 파일을 준비하는 중입니다.')
      const result = await convertImageTool(imageFile, imageFormat)
      downloadBlob(result.blob, result.fileName)
      setImageStatus(`변환 완료: ${result.fileName}`)
    } catch (error) {
      setImageStatus(error instanceof Error ? error.message : '이미지 변환에 실패했습니다.')
    } finally {
      setImageBusy(false)
    }
  }

  async function handleSlicePdf() {
    if (!pdfFile) {
      setPdfStatus('먼저 PDF 파일을 선택해 주세요.')
      return
    }

    const safeStartPage = Math.max(1, Math.trunc(pdfStartPage) || 1)
    const safeEndPage = Math.max(safeStartPage, Math.trunc(pdfEndPage) || safeStartPage)

    if (pdfPageCount && safeEndPage > pdfPageCount) {
      setPdfStatus(`끝 페이지는 ${pdfPageCount} 이하로 입력해 주세요.`)
      return
    }

    try {
      setPdfBusyAction('slice')
      setPdfStartPage(safeStartPage)
      setPdfEndPage(safeEndPage)
      setPdfStatus('선택한 페이지 범위로 새 PDF를 만드는 중입니다.')
      const result = await slicePdfTool(pdfFile, safeStartPage, safeEndPage)
      downloadBlob(result.blob, result.fileName)
      setPdfStatus(`페이지 ${safeStartPage} ~ ${safeEndPage} 범위를 새 PDF로 만들었습니다.`)
    } catch (error) {
      setPdfStatus(error instanceof Error ? error.message : 'PDF 페이지 자르기에 실패했습니다.')
    } finally {
      setPdfBusyAction(null)
    }
  }

  async function handleCompressPdf() {
    if (!pdfFile) {
      setPdfStatus('먼저 PDF 파일을 선택해 주세요.')
      return
    }

    try {
      setPdfBusyAction('compress')
      setPdfStatus('PDF를 가볍게 다시 저장해 최적화하는 중입니다.')
      const result = await compressPdfTool(pdfFile)
      downloadBlob(result.blob, result.fileName)
      setPdfStatus(`최적화 파일을 준비했습니다: ${result.fileName}`)
    } catch (error) {
      setPdfStatus(error instanceof Error ? error.message : 'PDF 최적화에 실패했습니다.')
    } finally {
      setPdfBusyAction(null)
    }
  }

  const activeTabConfig = TOOL_TABS.find((tab) => tab.id === activeTab) ?? TOOL_TABS[0]
  const ActiveTabIcon = getToolIcon(activeTabConfig.id)
  const readyToolCount = [ocrFile, imageFile, pdfFile].filter(Boolean).length
  const activeFile = activeTab === 'ocr' ? ocrFile : activeTab === 'image' ? imageFile : pdfFile
  const ocrSelectionLabel = ocrSelection
    ? `${Math.round(ocrSelection.width)} x ${Math.round(ocrSelection.height)}`
    : '선택 없음'
  const pdfRangeLabel = pdfPageCount ? `${Math.max(1, pdfStartPage)} ~ ${Math.max(Math.max(1, pdfStartPage), pdfEndPage)}` : '미정'

  const renderOcrView = () => (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
      <section className="page-panel space-y-4">
        <ToolSectionHeader
          icon={<Sparkles className="h-5 w-5" />}
          title="문서 OCR"
          description="이미지 전체 또는 원하는 영역만 읽어 텍스트를 추출합니다."
          badge={<Pill variant="subtle">언어 {ocrLanguage === 'kor+eng' ? '한/영' : ocrLanguage === 'kor' ? '한글' : '영문'}</Pill>}
        />

        <ToolDropZone
          title="OCR할 문서 이미지 업로드"
          description="PNG, JPG, GIF, BMP, TIFF 같은 문서 이미지를 올릴 수 있습니다."
          accept="image/*"
          selectedFile={ocrFile}
          onFileChange={setOcrFile}
        />

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-900">OCR 언어</span>
          <select
            value={ocrLanguage}
            onChange={(event) => setOcrLanguage(event.target.value)}
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500"
          >
            <option value="kor+eng">한국어 + 영어</option>
            <option value="kor">한국어</option>
            <option value="eng">영어</option>
          </select>
        </label>

        <StatusPanel
          title="작업 상태"
          description={ocrStatus}
          tone={ocrText.trim() ? 'success' : 'default'}
        />

        <div className="flex flex-wrap gap-2.5">
          <ToolActionButton
            label="전체 OCR"
            icon={ocrBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
            onClick={() => {
              void executeOcr(false)
            }}
            disabled={ocrBusy || !ocrFile}
          />
          <ToolActionButton
            label="선택 영역 OCR"
            icon={ocrBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
            onClick={() => {
              void executeOcr(true)
            }}
            disabled={ocrBusy || !ocrFile || !ocrSelection}
            variant="secondary"
          />
          <ToolActionButton
            label="초기화"
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={() => {
              setOcrSelection(null)
              setOcrText('')
              setOcrStatus('선택 영역과 OCR 결과를 비웠습니다.')
            }}
            variant="secondary"
          />
        </div>
      </section>

      <section className="page-panel space-y-4">
        <ToolSectionHeader
          icon={<ActiveTabIcon className="h-5 w-5" />}
          title="미리보기와 결과"
          description="드래그로 영역을 선택하고, 같은 패널에서 바로 결과를 확인할 수 있습니다."
          badge={<Pill variant="subtle">{ocrSelection ? `영역 ${ocrSelectionLabel}` : '전체 처리 가능'}</Pill>}
        />

        {ocrPreviewUrl ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50/90 p-4">
            <div
              className="relative overflow-auto rounded-3xl border border-slate-200 bg-white p-3"
              onMouseDown={(event) => {
                const image = ocrImageRef.current
                if (!image) {
                  return
                }

                const point = getRelativePoint(event, image)
                if (!point) {
                  return
                }

                event.preventDefault()
                setOcrDragStart(point)
                setOcrSelection({ x: point.x, y: point.y, width: 0, height: 0 })
              }}
              onMouseMove={(event) => {
                const image = ocrImageRef.current
                if (!image || !ocrDragStart) {
                  return
                }

                const point = getRelativePoint(event, image)
                if (!point) {
                  return
                }

                setOcrSelection(normalizeRect(ocrDragStart, point))
              }}
              onMouseUp={(event) => {
                const image = ocrImageRef.current
                if (!image || !ocrDragStart) {
                  return
                }

                const point = getRelativePoint(event, image) ?? ocrDragStart
                const nextSelection = normalizeRect(ocrDragStart, point)
                setOcrSelection(nextSelection.width >= 10 && nextSelection.height >= 10 ? nextSelection : null)
                setOcrDragStart(null)
              }}
              onMouseLeave={() => {
                if (ocrDragStart) {
                  setOcrDragStart(null)
                }
              }}
            >
              <div className="relative inline-block">
                <img
                  ref={ocrImageRef}
                  src={ocrPreviewUrl}
                  alt="OCR 미리보기"
                  className="block max-h-[64vh] max-w-full rounded-2xl"
                />
                {ocrSelection ? (
                  <div
                    className="pointer-events-none absolute rounded-xl border-2 border-emerald-600 bg-emerald-400/20"
                    style={{
                      left: `${ocrSelection.x}px`,
                      top: `${ocrSelection.y}px`,
                      width: `${ocrSelection.width}px`,
                      height: `${ocrSelection.height}px`,
                    }}
                  />
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <StatusPanel
            title="미리보기 대기 중"
            description="OCR할 이미지를 올리면 이 영역에서 범위를 선택할 수 있습니다."
          />
        )}

        <div className="page-summary-strip">
          <div className="page-summary-item">
            <span className="page-summary-label">선택 파일</span>
            <span className="page-summary-value">{ocrFile ? ocrFile.name : '없음'}</span>
          </div>
          <div className="page-summary-item">
            <span className="page-summary-label">선택 영역</span>
            <span className="page-summary-value">{ocrSelectionLabel}</span>
          </div>
          <div className="page-summary-item">
            <span className="page-summary-label">결과 상태</span>
            <span className="page-summary-value">{ocrText.trim() ? '추출됨' : '대기 중'}</span>
          </div>
        </div>

        <div className="border-t border-slate-200/80 pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">OCR 결과</h4>
              <p className="mt-1 text-sm text-slate-500">필요하면 결과를 바로 수정하거나 복사해서 사용할 수 있습니다.</p>
            </div>
            <ToolActionButton
              label="결과 복사"
              icon={<Copy className="h-4 w-4" />}
              onClick={() => {
                void handleCopyOcrResult()
              }}
              disabled={!ocrText.trim()}
              variant="secondary"
            />
          </div>
          <textarea
            value={ocrText}
            onChange={(event) => setOcrText(event.target.value)}
            placeholder="OCR 결과가 여기에 표시됩니다."
            className="mt-3 min-h-[220px] w-full rounded-3xl border border-slate-300 bg-white px-4 py-3 font-mono text-sm text-slate-900 outline-none transition focus:border-slate-500"
          />
        </div>
      </section>
    </section>
  )

  const renderImageView = () => (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
      <section className="page-panel space-y-4">
        <ToolSectionHeader
          icon={<FileImage className="h-5 w-5" />}
          title="이미지 변환"
          description="이미지 확장자를 바꿔 바로 다운로드할 수 있는 단순한 흐름입니다."
          badge={<Pill variant="subtle">출력 {imageFormat.toUpperCase()}</Pill>}
        />

        <ToolDropZone
          title="변환할 이미지 업로드"
          description="PNG, JPG, GIF, BMP, TIFF, WEBP 같은 일반 이미지 파일을 사용할 수 있습니다."
          accept="image/*"
          selectedFile={imageFile}
          onFileChange={setImageFile}
        />

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-900">변환 형식</span>
          <select
            value={imageFormat}
            onChange={(event) => setImageFormat(event.target.value)}
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500"
          >
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
            <option value="gif">GIF</option>
            <option value="bmp">BMP</option>
            <option value="tif">TIFF</option>
          </select>
        </label>

        <StatusPanel
          title="변환 상태"
          description={imageStatus}
          tone={imageStatus.startsWith('변환 완료') ? 'success' : 'default'}
        />

        <ToolActionButton
          label="변환 후 다운로드"
          icon={imageBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          onClick={() => {
            void handleConvertImage()
          }}
          disabled={imageBusy || !imageFile}
        />
      </section>

      <section className="page-panel space-y-4">
        <ToolSectionHeader
          icon={<Image className="h-5 w-5" />}
          title="미리보기"
          description="선택한 파일과 출력 형식을 한 번에 확인하고 바로 변환할 수 있습니다."
          badge={<Pill variant="subtle">{imageFile ? formatFileSize(imageFile.size) : '파일 대기'}</Pill>}
        />

        {imagePreviewUrl ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50/90 p-4">
            <div className="flex min-h-[320px] items-center justify-center overflow-hidden rounded-3xl border border-slate-200 bg-white p-4">
              <img
                src={imagePreviewUrl}
                alt="이미지 미리보기"
                className="max-h-[320px] max-w-full rounded-2xl object-contain"
              />
            </div>
          </div>
        ) : (
          <StatusPanel
            title="미리보기 대기 중"
            description="이미지를 올리면 여기에서 파일 상태와 변환 방향을 확인할 수 있습니다."
          />
        )}

        <div className="page-summary-strip">
          <div className="page-summary-item">
            <span className="page-summary-label">입력 파일</span>
            <span className="page-summary-value">{imageFile ? imageFile.name : '없음'}</span>
          </div>
          <div className="page-summary-item">
            <span className="page-summary-label">출력 형식</span>
            <span className="page-summary-value">{imageFormat.toUpperCase()}</span>
          </div>
          <div className="page-summary-item">
            <span className="page-summary-label">다운로드</span>
            <span className="page-summary-value">즉시 저장</span>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
          <h4 className="text-sm font-semibold text-slate-900">빠른 사용 팁</h4>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
            <li>스캔 문서는 PNG로 맞춰 두면 OCR 전처리에 더 유리합니다.</li>
            <li>전달용 파일은 JPG로 바꾸면 용량을 가볍게 정리하기 쉽습니다.</li>
            <li>부서 요청 형식이 정해져 있을 때 BMP나 TIFF로 바로 바꿀 수 있습니다.</li>
          </ul>
        </div>
      </section>
    </section>
  )

  const renderPdfView = () => (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
      <section className="page-panel space-y-4">
        <ToolSectionHeader
          icon={<FileText className="h-5 w-5" />}
          title="PDF 도구"
          description="페이지 수 확인, 원하는 범위 자르기, 가벼운 최적화를 한곳에서 처리합니다."
          badge={<Pill variant="subtle">{pdfMetaLoading ? '분석 중' : pdfPageCount ? `${pdfPageCount}페이지` : '파일 대기'}</Pill>}
        />

        <ToolDropZone
          title="작업할 PDF 업로드"
          description="페이지 정보를 확인한 뒤 필요한 범위만 잘라내거나, 가볍게 다시 저장할 수 있습니다."
          accept="application/pdf,.pdf"
          selectedFile={pdfFile}
          onFileChange={setPdfFile}
        />

        <StatusPanel
          title="PDF 상태"
          description={pdfStatus}
          tone={pdfPageCount ? 'success' : 'default'}
        />

        <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">페이지 범위 자르기</p>
              <p className="text-sm text-slate-600">필요한 구간만 새 PDF로 만들어 내려받습니다.</p>
            </div>
            <Pill variant="subtle">{pdfRangeLabel}</Pill>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>시작 페이지</span>
              <input
                type="number"
                min={1}
                max={pdfPageCount ?? undefined}
                value={pdfStartPage}
                onChange={(event) => setPdfStartPage(Number.parseInt(event.target.value || '1', 10))}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-slate-500"
              />
            </label>
            <div className="pb-3 text-center text-sm text-slate-500">~</div>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>끝 페이지</span>
              <input
                type="number"
                min={1}
                max={pdfPageCount ?? undefined}
                value={pdfEndPage}
                onChange={(event) => setPdfEndPage(Number.parseInt(event.target.value || '1', 10))}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-slate-500"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2.5">
            <ToolActionButton
              label="페이지 자르기"
              icon={pdfBusyAction === 'slice' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
              onClick={() => {
                void handleSlicePdf()
              }}
              disabled={!pdfFile || pdfMetaLoading || pdfBusyAction !== null}
            />
            <ToolActionButton
              label="PDF 최적화"
              icon={pdfBusyAction === 'compress' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              onClick={() => {
                void handleCompressPdf()
              }}
              disabled={!pdfFile || pdfMetaLoading || pdfBusyAction !== null}
              variant="secondary"
            />
          </div>
        </div>
      </section>

      <section className="page-panel space-y-4">
        <ToolSectionHeader
          icon={<ActiveTabIcon className="h-5 w-5" />}
          title="현재 파일과 흐름"
          description="지금 선택한 파일 상태와 실행 전 확인 포인트만 간단히 남겼습니다."
          badge={<Pill variant="subtle">{pdfFile ? pdfFile.name : '파일 없음'}</Pill>}
        />

        <div className="page-summary-strip">
          <div className="page-summary-item">
            <span className="page-summary-label">선택 파일</span>
            <span className="page-summary-value">{pdfFile ? pdfFile.name : '없음'}</span>
          </div>
          <div className="page-summary-item">
            <span className="page-summary-label">페이지 수</span>
            <span className="page-summary-value">
              {pdfMetaLoading ? '확인 중' : pdfPageCount ? `${pdfPageCount}페이지` : '미확인'}
            </span>
          </div>
          <div className="page-summary-item">
            <span className="page-summary-label">선택 범위</span>
            <span className="page-summary-value">{pdfRangeLabel}</span>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
          <h4 className="text-sm font-semibold text-slate-900">추천 사용 흐름</h4>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
            <li>먼저 페이지 수를 확인한 뒤 필요한 구간만 잘라 공유본을 만듭니다.</li>
            <li>외부 전달용 문서는 최적화 버튼으로 다시 저장해 용량을 한 번 더 정리합니다.</li>
            <li>스캔 이미지 PDF라면 이미지 변환이나 OCR 탭과 이어서 사용하는 흐름이 가장 깔끔합니다.</li>
          </ul>
        </div>

        <StatusPanel
          title="작업 참고"
          description="페이지 범위는 자동으로 1페이지 이상으로 보정하고, 끝 페이지가 총 페이지 수를 넘으면 실행 전에 안내합니다."
        />
      </section>
    </section>
  )

  return (
    <PageShell density="compact">
      <PageHeader
        variant="simple"
        eyebrow="Tools Workspace"
        title="작업 도구"
        description="OCR, 이미지 변환, PDF 작업을 큰 장식 없이 한 화면에서 바로 처리할 수 있게 정리했습니다."
        meta={<Pill variant="subtle">현재 {activeTabConfig.label}</Pill>}
      />

      <section className="page-panel space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="page-summary-strip">
            <div className="page-summary-item">
              <span className="page-summary-label">현재 도구</span>
              <span className="page-summary-value">{activeTabConfig.label}</span>
            </div>
            <div className="page-summary-item">
              <span className="page-summary-label">선택 파일</span>
              <span className="page-summary-value">{activeFile ? activeFile.name : '없음'}</span>
            </div>
            <div className="page-summary-item">
              <span className="page-summary-label">처리 흐름</span>
              <span className="page-summary-value">업로드 → 실행 → 다운로드</span>
            </div>
          </div>

          <p className="page-toolbar-note">필요한 도구만 선택해 바로 작업하고, 결과는 같은 화면에서 확인할 수 있습니다.</p>
        </div>

        <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
          {TOOL_TABS.map((tab) => {
            const Icon = getToolIcon(tab.id)
            const isActive = activeTab === tab.id

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-3xl border px-4 py-4 text-left transition ${
                  isActive
                    ? 'border-slate-900 bg-slate-950 text-white'
                    : 'border-slate-200/80 bg-white/80 text-slate-800 hover:border-slate-300 hover:bg-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                      isActive ? 'bg-white/14 text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">{tab.label}</p>
                    <p className={`text-sm leading-6 ${isActive ? 'text-white/78' : 'text-slate-600'}`}>
                      {tab.description}
                    </p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {activeTab === 'ocr' ? renderOcrView() : null}
      {activeTab === 'image' ? renderImageView() : null}
      {activeTab === 'pdf' ? renderPdfView() : null}
    </PageShell>
  )
}
