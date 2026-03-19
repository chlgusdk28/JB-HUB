import { useEffect, useMemo, useRef, useState } from 'react'
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
  { id: 'ocr', label: 'OCR 작업실', description: 'codexP 문서 OCR 기능을 허브 안에서 바로 실행합니다.' },
  { id: 'image', label: '이미지 변환', description: '이미지 확장자를 빠르게 변환해 다운로드합니다.' },
  { id: 'pdf', label: 'PDF 도구', description: '페이지 수 확인, 페이지 자르기, 가벼운 최적화를 수행합니다.' },
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

function normalizeRect(start: Point, end: Point): SelectionRect {
  const x = Math.min(start.x, end.x)
  const y = Math.min(start.y, end.y)
  const width = Math.abs(end.x - start.x)
  const height = Math.abs(end.y - start.y)
  return { x, y, width, height }
}

function getRelativePoint(event: React.MouseEvent<HTMLElement>, image: HTMLImageElement): Point | null {
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
      className="rounded-[28px] border-2 border-dashed border-slate-300 bg-slate-50/70 p-5 text-left transition hover:border-slate-500 hover:bg-white"
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
    <div className={`rounded-2xl border px-4 py-3 ${toneClassName}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-6 text-current/80">{description}</p>
    </div>
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
    let cancelled = false

    if (!pdfFile) {
      setPdfPageCount(null)
      setPdfStartPage(1)
      setPdfEndPage(1)
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

  const importedFeatureCards = useMemo(
    () => [
      {
        title: '문서 OCR',
        description: 'codexP의 OCR 흐름을 가져와 이미지에서 텍스트를 뽑고 결과를 바로 복사할 수 있게 구성했습니다.',
        icon: Sparkles,
      },
      {
        title: '이미지 변환',
        description: '운영 중 자주 쓰는 확장자 변환을 `Tools` 안으로 옮겨와 별도 앱 없이 처리할 수 있습니다.',
        icon: Image,
      },
      {
        title: 'PDF 유틸리티',
        description: '페이지 수 확인, 페이지 자르기, 가벼운 최적화까지 한곳에서 처리하는 흐름으로 다시 묶었습니다.',
        icon: FileText,
      },
    ],
    [],
  )

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

    try {
      setPdfBusyAction('slice')
      setPdfStatus('선택한 페이지 범위로 새 PDF를 만드는 중입니다.')
      const result = await slicePdfTool(pdfFile, pdfStartPage, pdfEndPage)
      downloadBlob(result.blob, result.fileName)
      setPdfStatus(`페이지 ${pdfStartPage} ~ ${pdfEndPage} 범위를 새 PDF로 만들었습니다.`)
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

  return (
    <div className="page-shell space-y-6">
      <section className="rounded-[32px] border border-slate-200/80 bg-white/90 p-6 shadow-[0_20px_48px_rgba(15,23,42,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
              <Sparkles className="h-3.5 w-3.5" />
              Imported From codexP
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">codexP 도구를 허브 안으로 옮긴 작업실</h2>
            <p className="text-sm leading-6 text-slate-600">
              이전 프로젝트에서 만들었던 OCR과 파일 유틸리티 흐름을 `Tools` 메뉴 안으로 옮겨왔습니다.
              별도 앱을 켜지 않고 허브 안에서 바로 실행하고 다운로드할 수 있게 다시 구성했습니다.
            </p>
          </div>

          <div className="min-w-[220px] rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">현재 연결</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">OCR + File Tools</p>
            <p className="mt-1 text-sm text-slate-600">이미지 OCR, 이미지 변환, PDF 자르기와 최적화를 바로 실행할 수 있습니다.</p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {importedFeatureCards.map((item) => {
          const Icon = item.icon
          return (
            <article
              key={item.title}
              className="rounded-[28px] border border-slate-200/80 bg-white/82 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.07)]"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
            </article>
          )
        })}
      </section>

      <section className="rounded-[32px] border border-slate-200/80 bg-white/86 p-3 shadow-[0_20px_48px_rgba(15,23,42,0.08)]">
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
          {TOOL_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-[24px] px-4 py-4 text-left transition ${
                activeTab === tab.id
                  ? 'bg-slate-950 text-white shadow-[0_18px_36px_rgba(15,23,42,0.22)]'
                  : 'bg-slate-50 text-slate-800 hover:bg-slate-100'
              }`}
            >
              <p className="text-sm font-semibold">{tab.label}</p>
              <p className={`mt-1 text-sm leading-6 ${activeTab === tab.id ? 'text-white/75' : 'text-slate-600'}`}>
                {tab.description}
              </p>
            </button>
          ))}
        </div>
      </section>

      {activeTab === 'ocr' ? (
        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-4 rounded-[30px] border border-slate-200/80 bg-white/86 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.07)]">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-slate-900">문서 OCR</h3>
                <p className="text-sm text-slate-600">이미지 전체 또는 선택 영역만 OCR로 읽어 텍스트를 추출합니다.</p>
              </div>
            </div>

            <ToolDropZone
              title="OCR할 문서 이미지 업로드"
              description="PNG, JPG, GIF, BMP, TIFF 같은 문서 이미지를 올릴 수 있습니다."
              accept="image/*"
              selectedFile={ocrFile}
              onFileChange={setOcrFile}
            />

            <div className="rounded-[26px] border border-slate-200 bg-slate-50/80 p-4">
              <label className="text-sm font-semibold text-slate-900" htmlFor="ocr-language">
                OCR 언어
              </label>
              <select
                id="ocr-language"
                value={ocrLanguage}
                onChange={(event) => setOcrLanguage(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500"
              >
                <option value="kor+eng">한국어 + 영어</option>
                <option value="kor">한국어</option>
                <option value="eng">영어</option>
              </select>
            </div>

            <StatusPanel
              title="작업 상태"
              description={ocrStatus}
              tone={ocrText.trim() ? 'success' : 'default'}
            />

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void executeOcr(false)}
                disabled={ocrBusy || !ocrFile}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {ocrBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                전체 OCR
              </button>
              <button
                type="button"
                onClick={() => void executeOcr(true)}
                disabled={ocrBusy || !ocrFile || !ocrSelection}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                {ocrBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
                선택 영역 OCR
              </button>
              <button
                type="button"
                onClick={() => {
                  setOcrSelection(null)
                  setOcrText('')
                  setOcrStatus('선택 영역과 OCR 결과를 비웠습니다.')
                }}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <RefreshCw className="h-4 w-4" />
                초기화
              </button>
            </div>
          </div>

          <div className="space-y-4 rounded-[30px] border border-slate-200/80 bg-white/86 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.07)]">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-slate-900">미리보기와 결과</h3>
              <p className="text-sm leading-6 text-slate-600">
                미리보기에서 드래그하면 영역 선택이 저장됩니다. 선택 영역 OCR은 해당 부분만 잘라 서버에 보내도록 옮겨왔습니다.
              </p>
            </div>

            {ocrPreviewUrl ? (
              <div className="rounded-[28px] border border-slate-200 bg-slate-50/90 p-4">
                <div
                  className="relative overflow-auto rounded-2xl border border-slate-200 bg-white p-3"
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
                      className="block max-h-[68vh] max-w-full rounded-2xl"
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
                description="OCR할 이미지를 올리면 여기에서 선택 영역을 지정할 수 있습니다."
              />
            )}

            <div className="rounded-[28px] border border-slate-200 bg-slate-50/90 p-4">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-slate-900">OCR 결과</h4>
                <button
                  type="button"
                  onClick={() => void handleCopyOcrResult()}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
                >
                  <Copy className="h-4 w-4" />
                  결과 복사
                </button>
              </div>
              <textarea
                value={ocrText}
                onChange={(event) => setOcrText(event.target.value)}
                placeholder="OCR 결과가 여기에 표시됩니다."
                className="mt-3 min-h-[240px] w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 font-mono text-sm text-slate-900 outline-none transition focus:border-slate-500"
              />
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === 'image' ? (
        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4 rounded-[30px] border border-slate-200/80 bg-white/86 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.07)]">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <FileImage className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-slate-900">이미지 확장자 변환</h3>
                <p className="text-sm text-slate-600">codexP의 이미지 변환 기능을 허브 안에서 다운로드형 도구로 옮겼습니다.</p>
              </div>
            </div>

            <ToolDropZone
              title="변환할 이미지 업로드"
              description="PNG, JPG, GIF, BMP, TIFF, WEBP 등 일반 이미지 파일을 사용할 수 있습니다."
              accept="image/*"
              selectedFile={imageFile}
              onFileChange={setImageFile}
            />

            <div className="rounded-[26px] border border-slate-200 bg-slate-50/80 p-4">
              <label className="text-sm font-semibold text-slate-900" htmlFor="image-format">
                변환 형식
              </label>
              <select
                id="image-format"
                value={imageFormat}
                onChange={(event) => setImageFormat(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500"
              >
                <option value="png">PNG</option>
                <option value="jpg">JPG</option>
                <option value="gif">GIF</option>
                <option value="bmp">BMP</option>
                <option value="tif">TIFF</option>
              </select>
            </div>

            <StatusPanel
              title="변환 상태"
              description={imageStatus}
              tone={imageStatus.startsWith('변환 완료') ? 'success' : 'default'}
            />

            <button
              type="button"
              onClick={() => void handleConvertImage()}
              disabled={imageBusy || !imageFile}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {imageBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              변환 후 다운로드
            </button>
          </div>

          <div className="space-y-4 rounded-[30px] border border-slate-200/80 bg-white/86 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.07)]">
            <div className="rounded-[28px] border border-slate-200 bg-slate-50/90 p-5">
              <h4 className="text-lg font-semibold text-slate-900">현재 가져온 흐름</h4>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                이전 프로젝트의 파일 도구 중 이미지 변환 흐름을 그대로 가져와, 허브에서는 선택한 형식으로 바로 다운로드하는
                단일 액션으로 단순화했습니다.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <StatusPanel
                title="입력"
                description={imageFile ? `${imageFile.name} (${Math.round(imageFile.size / 1024)} KB)` : '선택된 이미지가 없습니다.'}
              />
              <StatusPanel
                title="출력"
                description={`${imageFormat.toUpperCase()} 파일로 변환해 즉시 다운로드합니다.`}
              />
            </div>

            <div className="rounded-[28px] border border-dashed border-slate-300 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(241,245,249,0.95))] p-5">
              <h4 className="text-lg font-semibold text-slate-900">활용 예시</h4>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                <li>문서 스캔 이미지를 PNG로 바꿔 OCR 품질을 높일 때</li>
                <li>배포용 이미지를 JPG로 가볍게 전달할 때</li>
                <li>부서 요청 형식에 맞춰 BMP/TIFF로 변환할 때</li>
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === 'pdf' ? (
        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4 rounded-[30px] border border-slate-200/80 bg-white/86 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.07)]">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-slate-900">PDF 도구</h3>
                <p className="text-sm text-slate-600">페이지 수 확인, 원하는 범위 자르기, 가벼운 재저장을 한곳에서 처리합니다.</p>
              </div>
            </div>

            <ToolDropZone
              title="작업할 PDF 업로드"
              description="페이지 정보 확인 후 원하는 범위를 잘라내거나, 가볍게 다시 저장할 수 있습니다."
              accept="application/pdf,.pdf"
              selectedFile={pdfFile}
              onFileChange={setPdfFile}
            />

            <StatusPanel
              title="PDF 상태"
              description={pdfStatus}
              tone={pdfPageCount ? 'success' : 'default'}
            />

            <div className="rounded-[26px] border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">페이지 범위 자르기</p>
                  <p className="text-sm text-slate-600">필요한 구간만 새 PDF로 만들어 다운로드합니다.</p>
                </div>
                <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                  {pdfMetaLoading ? '페이지 수 확인 중...' : pdfPageCount ? `총 ${pdfPageCount}페이지` : 'PDF 대기'}
                </div>
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

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void handleSlicePdf()}
                  disabled={!pdfFile || pdfMetaLoading || pdfBusyAction !== null}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {pdfBusyAction === 'slice' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
                  페이지 자르기
                </button>
                <button
                  type="button"
                  onClick={() => void handleCompressPdf()}
                  disabled={!pdfFile || pdfMetaLoading || pdfBusyAction !== null}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  {pdfBusyAction === 'compress' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  PDF 최적화
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-[30px] border border-slate-200/80 bg-white/86 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.07)]">
            <div className="rounded-[28px] border border-slate-200 bg-slate-50/90 p-5">
              <h4 className="text-lg font-semibold text-slate-900">이관 메모</h4>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                `codexP`의 PDF 도구 흐름을 허브에 맞게 다시 묶었습니다. 현재 버전은 페이지 자르기와 페이지 수 확인을 우선 살렸고,
                최적화는 불필요한 구조를 덜어내는 가벼운 재저장 방식으로 옮겨왔습니다.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <StatusPanel
                title="선택한 파일"
                description={pdfFile ? pdfFile.name : '선택된 PDF가 없습니다.'}
              />
              <StatusPanel
                title="페이지 수"
                description={pdfMetaLoading ? '확인 중입니다.' : pdfPageCount ? `${pdfPageCount}페이지` : '아직 확인 전입니다.'}
              />
            </div>

            <div className="rounded-[28px] border border-dashed border-slate-300 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(241,245,249,0.95))] p-5">
              <h4 className="text-lg font-semibold text-slate-900">추천 사용 흐름</h4>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                <li>먼저 페이지 수를 확인하고 필요한 구간만 잘라 별도 공유본을 만듭니다.</li>
                <li>외부 전달용 파일은 최적화 버튼으로 다시 저장해 용량을 한 번 더 정리합니다.</li>
                <li>스캔본 이미지는 필요하면 이미지 변환 탭과 조합해 OCR 전에 먼저 다듬을 수 있습니다.</li>
              </ul>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  )
}
