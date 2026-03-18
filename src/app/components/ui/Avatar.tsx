import { memo, type ReactNode } from 'react'

interface AvatarProps {
  name: string
  src?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const GRADIENTS = [
  'from-slate-500 to-slate-600',
  'from-[#5f7f9f] to-[#3f6284]',
  'from-[#6b8198] to-[#4f6880]',
  'from-[#7b91a7] to-[#5a728a]',
  'from-[#647c94] to-[#405a76]',
  'from-[#7890a7] to-[#57718b]',
  'from-[#5c748d] to-[#3e5975]',
  'from-[#889eb2] to-[#617b96]',
]

function getGradientForName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length]
}

function getInitials(name: string): string {
  const parts = name.trim().split(' ')
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase()
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

export const Avatar = memo(function Avatar({
  name,
  src,
  size = 'md',
  className = '',
}: AvatarProps) {
  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
    xl: 'w-12 h-12 text-lg',
  }

  const gradient = getGradientForName(name)
  const initials = getInitials(name)

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`${sizeClasses[size]} rounded-full object-cover ${className}`.trim()}
      />
    )
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-medium ${className}`.trim()}
      title={name}
    >
      {initials}
    </div>
  )
})

interface AvatarGroupProps {
  children: ReactNode
  max?: number
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function AvatarGroup({ children, max = 3, size = 'md', className = '' }: AvatarGroupProps) {
  const avatars = Array.isArray(children) ? children : [children]
  const visible = avatars.slice(0, max)
  const remaining = avatars.length - max

  const spacingClasses = {
    sm: '-space-x-2',
    md: '-space-x-3',
    lg: '-space-x-4',
  }

  const countSizeClasses = {
    sm: 'h-6 w-6 text-[10px]',
    md: 'h-8 w-8 text-xs',
    lg: 'h-10 w-10 text-sm',
  }

  return (
    <div className={`flex items-center ${spacingClasses[size]} ${className}`.trim()}>
      {visible.map((avatar, index) => (
        <div key={index} className="ring-2 ring-white dark:ring-slate-800 rounded-full">
          {avatar}
        </div>
      ))}
      {remaining > 0 && (
        <div
          className={`ring-2 ring-white dark:ring-slate-800 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center font-medium text-slate-600 dark:text-slate-400 ${countSizeClasses[size]}`}
        >
          +{remaining}
        </div>
      )}
    </div>
  )
}
