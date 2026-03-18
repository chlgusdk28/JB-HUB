import { useState } from 'react'
import { Share2, Link2, Check, Copy, Mail, X, ChevronDown, ExternalLink, Globe2 } from 'lucide-react'
import { copyTextToClipboard } from '../../lib/clipboard'

interface SharePanelProps {
  projectName: string
  projectUrl: string
  description?: string
  onShareComplete?: () => void
  onClose: () => void
}

export function SharePanel({ projectName, projectUrl, description, onShareComplete, onClose }: SharePanelProps) {
  const [copied, setCopied] = useState(false)
  const [showLinkInput, setShowLinkInput] = useState(false)

  const handleCopy = async (text: string) => {
    const didCopy = await copyTextToClipboard(text)
    if (!didCopy) {
      return
    }
    setCopied(true)
    onShareComplete?.()
    setTimeout(() => setCopied(false), 2000)
  }

  const shareUrls = {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(projectUrl)}`,
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${projectName} - ${description || ''}`)}&url=${encodeURIComponent(projectUrl)}`,
    mail: `mailto:?subject=${encodeURIComponent(projectName)}&body=${encodeURIComponent(`${description || ''}\n\n${projectUrl}`)}`,
  }

  const handleSocialShare = (platform: 'facebook' | 'twitter' | 'mail') => {
    window.open(shareUrls[platform], '_blank', 'noopener,noreferrer,width=600,height=400')
    onShareComplete?.()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
      <div className="surface-panel w-full max-w-md rounded-2xl">
        <div className="border-b border-slate-200/80 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900">
                <Share2 className="h-5 w-5 text-[#315779]" />
                프로젝트 공유
              </h3>
              <p className="mt-1 line-clamp-1 text-sm text-slate-500">{projectName}</p>
            </div>
            <button type="button" onClick={onClose} className="glass-inline-button !px-2.5 !py-1.5 text-xs" aria-label="닫기">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4 sm:px-6">
          <section className="surface-soft rounded-xl p-4">
            <p className="text-xs font-semibold tracking-[0.08em] text-slate-500">외부 공유</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleSocialShare('facebook')}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                title="Facebook으로 공유"
              >
                Facebook
              </button>
              <button
                type="button"
                onClick={() => handleSocialShare('twitter')}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                title="X로 공유"
              >
                X
              </button>
              <button
                type="button"
                onClick={() => handleSocialShare('mail')}
                className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                title="메일로 공유"
              >
                <Mail className="h-3.5 w-3.5" />
                메일
              </button>
            </div>
            <button
              type="button"
              onClick={() => window.open(projectUrl, '_blank', 'noopener,noreferrer')}
              className="mt-2 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
            >
              <Globe2 className="h-3.5 w-3.5" />
              링크 열기
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </section>

          <section className="surface-soft rounded-xl p-4">
            <button
              type="button"
              onClick={() => setShowLinkInput((prev) => !prev)}
              className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              <span className="inline-flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                링크 복사
              </span>
              <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${showLinkInput ? 'rotate-180' : ''}`} />
            </button>

            {showLinkInput ? (
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={projectUrl}
                  onClick={(event) => event.currentTarget.select()}
                  className="select-soft !py-2"
                />
                <button
                  type="button"
                  onClick={() => handleCopy(projectUrl)}
                  className="inline-flex items-center gap-1 rounded-xl border border-[#264969] bg-[#264969] px-3 py-2 text-xs font-semibold text-white transition-colors hover:border-[#1f3e5a] hover:bg-[#1f3e5a]"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? '복사됨' : '복사'}
                </button>
              </div>
            ) : null}
          </section>

          <p className="text-xs text-slate-500">
            프로젝트 링크를 팀 채널에 공유하면 공동 작업 참여를 더 빠르게 유도할 수 있습니다.
          </p>
        </div>

        <div className="border-t border-slate-200/80 px-5 py-3 sm:px-6">
          <button type="button" onClick={onClose} className="glass-inline-button w-full justify-center">
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
