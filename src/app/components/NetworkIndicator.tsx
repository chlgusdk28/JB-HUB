import { useEffect, useState } from 'react'
import { Wifi, WifiOff } from 'lucide-react'

type OnlineStatus = 'online' | 'offline' | 'unknown'

export function useNetworkStatus() {
  const [status, setStatus] = useState<OnlineStatus>('unknown')
  const [wasOffline, setWasOffline] = useState(false)

  useEffect(() => {
    setStatus(navigator.onLine ? 'online' : 'offline')

    const handleOnline = () => {
      setStatus('online')
      setWasOffline(true)
      setTimeout(() => setWasOffline(false), 3000)
    }

    const handleOffline = () => {
      setStatus('offline')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return { isOnline: status === 'online', status, wasOffline }
}

interface NetworkIndicatorProps {
  showText?: boolean
  position?: 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left'
}

export function NetworkIndicator({ showText = false, position = 'top-right' }: NetworkIndicatorProps) {
  const { isOnline, status, wasOffline } = useNetworkStatus()

  if (status === 'unknown') return null

  const positionClasses = {
    'top-right': 'top-4 right-4',
    'bottom-right': 'bottom-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-left': 'bottom-4 left-4',
  }

  if (isOnline && !wasOffline) return null

  return (
    <div
      className={`fixed z-50 flex items-center gap-2 rounded-lg px-3 py-2 shadow-lg ${
        isOnline
          ? 'border border-green-200 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-300'
          : 'border border-red-200 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300'
      } ${positionClasses[position]} animate-slide-in-right`}
    >
      {isOnline ? (
        <>
          <Wifi className="h-4 w-4" />
          {showText && <span className="text-sm font-medium">연결됨</span>}
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4" />
          {showText && <span className="text-sm font-medium">오프라인</span>}
        </>
      )}
    </div>
  )
}

export function NetworkStatusIndicator() {
  const { isOnline, wasOffline } = useNetworkStatus()

  if (isOnline && !wasOffline) return null

  return (
    <div className="fixed top-20 right-4 z-50">
      <div
        className={`flex items-center gap-2 rounded-lg px-3 py-2 shadow-lg animate-slide-in-right ${
          isOnline
            ? 'border border-green-200 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-300'
            : 'border border-red-200 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300'
        }`}
      >
        {isOnline ? (
          <>
            <Wifi className="h-4 w-4" />
            <span className="text-sm font-medium">연결 복구됨</span>
          </>
        ) : (
          <>
            <WifiOff className="h-4 w-4" />
            <span className="text-sm font-medium">네트워크 연결 없음</span>
          </>
        )}
      </div>
    </div>
  )
}
