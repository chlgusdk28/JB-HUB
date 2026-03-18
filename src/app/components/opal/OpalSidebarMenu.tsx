import { NavigationMenuItem } from '../common/NavigationMenuItem'
import type { NavigationSection } from '../common/navigation-types'

interface OpalSidebarMenuProps<TId extends string = string> {
  sections: NavigationSection<TId>[]
  activeItemId?: TId
  onItemClick?: (itemId: TId) => void
  width?: number
}

export function OpalSidebarMenu<TId extends string = string>({
  sections,
  activeItemId,
  onItemClick,
  width = 256,
}: OpalSidebarMenuProps<TId>) {
  const renderMenuItems = (items: NavigationSection<TId>['items']) =>
    items.map((item) => (
      <NavigationMenuItem
        key={item.id}
        item={item}
        isActive={activeItemId === item.id}
        onClick={(itemId) => onItemClick?.(itemId)}
      />
    ))

  return (
    <aside
      className="fixed left-0 top-28 z-30 hidden h-[calc(100vh-8rem)] py-4 lg:block"
      style={{ width: `${width}px` }}
    >
      <div
        className="ml-4 h-full rounded-2xl border border-slate-200/85 bg-white/94 p-2.5 backdrop-blur-md"
        style={{
          boxShadow: '0 12px 24px rgba(12, 42, 70, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
        }}
      >
        <nav className="flex h-full flex-col gap-4 overflow-y-auto px-2 py-1">
          {sections.map((section, index) => (
            <div key={`section-${index}`} className={index === 0 ? 'space-y-2' : 'border-t border-slate-200/75 pt-4 space-y-2'}>
              {renderMenuItems(section.items)}
            </div>
          ))}
        </nav>
      </div>
    </aside>
  )
}
