import type { NavigationItem } from './navigation-types'

interface NavigationMenuItemProps<TId extends string = string> {
  item: NavigationItem<TId>
  isActive: boolean
  onClick: (itemId: TId) => void
  variant?: 'desktop' | 'mobile'
}

export function NavigationMenuItem<TId extends string = string>({
  item,
  isActive,
  onClick,
  variant = 'desktop',
}: NavigationMenuItemProps<TId>) {
  const desktopClass = isActive ? 'nav-item-desktop-active' : 'nav-item-desktop-idle'
  const mobileClass = isActive ? 'nav-item-mobile-active' : 'nav-item-mobile-idle'
  const lockClass = item.locked ? 'nav-item-locked' : ''

  return (
    <button
      type="button"
      onClick={() => onClick(item.id)}
      className={`nav-item-base ${variant === 'mobile' ? mobileClass : desktopClass} ${lockClass}`.trim()}
      title={item.locked ? item.lockHint ?? '상위 모드에서 사용 가능합니다.' : undefined}
    >
      <div className="nav-item-row">
        <div className="nav-item-start">
          {item.icon ? <span className={`nav-item-icon ${isActive ? 'nav-item-icon-active' : ''}`}>{item.icon}</span> : null}
          <span>{item.label}</span>
        </div>

        {item.locked ? (
          <span className="nav-item-lock-badge">잠금</span>
        ) : item.badge !== undefined && item.badge > 0 ? (
          <span className={isActive ? 'nav-item-badge-active' : 'nav-item-badge-idle'}>
            {item.badge}
          </span>
        ) : null}
      </div>
    </button>
  )
}
