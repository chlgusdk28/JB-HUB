import { useCallback, useEffect, useRef } from 'react'

// Prevent scroll jank with pointer events
export function useScrollOptimization(isEnabled = true) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isEnabled || !ref.current) return

    let timeoutId: ReturnType<typeof setTimeout>

    const handleScroll = () => {
      // Add pointer-events-none during scroll
      if (ref.current) {
        ref.current.style.pointerEvents = 'none'
      }

      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        if (ref.current) {
          ref.current.style.pointerEvents = ''
        }
      }, 100)
    }

    const element = ref.current
    element.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      clearTimeout(timeoutId)
      element?.removeEventListener('scroll', handleScroll)
    }
  }, [isEnabled])

  return ref
}

// Optimize expensive computations with requestIdleCallback
export function useIdleCallback<T extends (...args: unknown[]) => void>(
  callback: T,
  deps: unknown[] = []
) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  return useCallback((...args: Parameters<T>) => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => callbackRef.current(...args))
    } else {
      callbackRef.current(...args)
    }
  }, deps)
}

// Detect and respond to reduced motion preference
export function useReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)

    const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches)
    mediaQuery.addEventListener('change', listener)
    return () => mediaQuery.removeEventListener('change', listener)
  }, [])

  return prefersReducedMotion
}
