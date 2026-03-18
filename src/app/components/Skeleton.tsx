interface SkeletonProps {
  className?: string
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded'
  width?: string | number
  height?: string | number
  animation?: true | false
}

export function Skeleton({
  className = '',
  variant = 'rectangular',
  width,
  height,
  animation = true,
}: SkeletonProps) {
  const baseClasses = 'bg-slate-200/60 dark:bg-slate-700/40'

  const variantClasses = {
    text: 'rounded h-4 w-full',
    circular: 'rounded-full',
    rectangular: 'rounded-md',
    rounded: 'rounded-xl',
  }

  const animationClass = animation ? 'animate-pulse' : ''

  const style = {
    width: width !== undefined ? (typeof width === 'number' ? `${width}px` : width) : undefined,
    height: height !== undefined ? (typeof height === 'number' ? `${height}px` : height) : undefined,
  }

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${animationClass} ${className}`.trim()}
      style={style}
      aria-hidden="true"
    />
  )
}

export function ProjectCardSkeleton() {
  return (
    <div className="surface-panel p-5 space-y-4">
      <div className="flex items-start gap-4">
        <Skeleton variant="rounded" width={60} height={60} />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" width="70%" height={20} />
          <Skeleton variant="text" width="40%" height={16} />
        </div>
      </div>
      <Skeleton variant="text" width="100%" height={14} />
      <Skeleton variant="text" width="80%" height={14} />
      <div className="flex gap-2">
        <Skeleton variant="rounded" width={60} height={24} />
        <Skeleton variant="rounded" width={60} height={24} />
      </div>
    </div>
  )
}

export function MetricCardSkeleton() {
  return (
    <div className="surface-panel p-5 space-y-3">
      <Skeleton variant="text" width="40%" height={16} />
      <Skeleton variant="text" width="60%" height={28} />
      <Skeleton variant="text" width="30%" height={14} />
    </div>
  )
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="surface-panel overflow-hidden">
      <div className="space-y-3 p-4">
        <div className="flex gap-4">
          <Skeleton variant="text" width="20%" />
          <Skeleton variant="text" width="30%" />
          <Skeleton variant="text" width="25%" />
          <Skeleton variant="text" width="15%" />
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <Skeleton variant="text" width="20%" />
            <Skeleton variant="text" width="30%" />
            <Skeleton variant="text" width="25%" />
            <Skeleton variant="text" width="15%" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function CommentSkeleton() {
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-3">
        <Skeleton variant="circular" width={32} height={32} />
        <div className="flex-1 space-y-1">
          <Skeleton variant="text" width="25%" height={14} />
          <Skeleton variant="text" width="20%" height={12} />
        </div>
      </div>
      <Skeleton variant="text" width="100%" height={14} />
      <Skeleton variant="text" width="90%" height={14} />
      <Skeleton variant="text" width="70%" height={14} />
    </div>
  )
}
