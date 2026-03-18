import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  message: string
  type: ToastType
  duration?: number
}

interface ToastProps extends Toast {
  onClose: (id: string) => void
}

const toastConfig = {
  success: { icon: CheckCircle, bgColor: 'bg-green-50', borderColor: 'border-green-200', textColor: 'text-green-800' },
  error: { icon: AlertCircle, bgColor: 'bg-red-50', borderColor: 'border-red-200', textColor: 'text-red-800' },
  warning: { icon: AlertTriangle, bgColor: 'bg-amber-50', borderColor: 'border-amber-200', textColor: 'text-amber-800' },
  info: { icon: Info, bgColor: 'bg-blue-50', borderColor: 'border-blue-200', textColor: 'text-blue-800' },
}

function ToastItem({ id, message, type, onClose }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false)
  const config = toastConfig[type]
  const Icon = config.icon

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true)
      setTimeout(() => onClose(id), 300)
    }, 5000)

    return () => clearTimeout(timer)
  }, [id, onClose])

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border ${config.borderColor} ${config.bgColor} px-4 py-3 shadow-lg transition-all duration-300 ${
        isExiting ? 'opacity-0 translate-x-full' : 'opacity-100 translate-x-0'
      }`}
      role="alert"
      aria-live="polite"
    >
      <Icon className={`h-5 w-5 flex-shrink-0 ${config.textColor}`} />
      <p className={`flex-1 text-sm font-medium ${config.textColor}`}>{message}</p>
      <button
        onClick={() => {
          setIsExiting(true)
          setTimeout(() => onClose(id), 300)
        }}
        className={`flex-shrink-0 rounded-full p-1 transition-colors hover:bg-black/5 ${config.textColor}`}
        aria-label="닫기"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

// Toast manager
let toastListeners: Set<(toasts: Toast[]) => void> = new Set()
let toasts: Toast[] = []

function notifyListeners() {
  toastListeners.forEach((listener) => listener([...toasts]))
}

export function toast(message: string, type: ToastType = 'info') {
  const id = Math.random().toString(36).slice(2)
  toasts.push({ id, message, type })
  notifyListeners()
  return id
}

export function toastSuccess(message: string) {
  return toast(message, 'success')
}

export function toastError(message: string) {
  return toast(message, 'error')
}

export function toastWarning(message: string) {
  return toast(message, 'warning')
}

export function removeToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id)
  notifyListeners()
}

export function clearToasts() {
  toasts = []
  notifyListeners()
}

export function ToastContainer() {
  const [currentToasts, setCurrentToasts] = useState<Toast[]>([])

  useEffect(() => {
    toastListeners.add(setCurrentToasts)
    setCurrentToasts([...toasts])

    return () => {
      toastListeners.delete(setCurrentToasts)
    }
  }, [])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed right-4 top-4 z-[9999] flex w-full max-w-sm flex-col gap-2">
      {currentToasts.map((t) => (
        <ToastItem key={t.id} {...t} onClose={removeToast} />
      ))}
    </div>,
    document.body
  )
}
