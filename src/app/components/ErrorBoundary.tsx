import { Component, ReactNode } from 'react'
import { isRecoverableChunkError, reloadForRecoverableChunkError } from '../lib/chunk-recovery'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: { componentStack: string }) => void
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    console.error('[ErrorBoundary] Caught error:', error)
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack)
    if (reloadForRecoverableChunkError(error)) {
      return
    }
    this.props.onError?.(error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined })
  }

  render() {
    if (this.state.hasError) {
      const isChunkError = isRecoverableChunkError(this.state.error)

      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
            <div className="mb-4 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
            </div>

            <h2 className="mb-2 text-center text-xl font-semibold text-slate-900">오류가 발생했습니다</h2>

            <p className="mb-6 text-center text-sm text-slate-600">
              {isChunkError ? (
                <>
                  화면이 갱신되면서 예전 프로젝트 상세 파일을 찾지 못했습니다.
                  <br />
                  페이지를 새로고침하면 최신 화면으로 다시 열립니다.
                </>
              ) : (
                <>
                  죄송합니다. 예기치 않은 오류가 발생했습니다.
                  <br />
                  페이지를 새로고침하거나 잠시 후 다시 시도해 주세요.
                </>
              )}
            </p>

            {this.state.error && import.meta.env.DEV && (
              <details className="mb-6 rounded-lg bg-slate-100 p-4">
                <summary className="cursor-pointer text-sm font-medium text-slate-700">오류 내용 (개발용)</summary>
                <pre className="mt-2 overflow-auto text-xs text-slate-800">
                  {this.state.error.toString()}
                  {'\n'}
                  {this.state.error.stack}
                </pre>
              </details>
            )}

            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  if (isChunkError) {
                    window.location.reload()
                    return
                  }
                  this.handleReset()
                }}
                className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                {isChunkError ? '페이지 새로고침' : '다시 시도'}
              </button>
              <button
                onClick={() => {
                  window.location.href = '/'
                }}
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                홈으로 이동
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
