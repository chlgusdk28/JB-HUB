import { memo } from 'react'
import { NavigationMenuItem, type NavigationItem } from '../common'
import type { PageId } from '../../types/page'

interface MobileMenuItemsProps {
  items: NavigationItem<PageId>[]
  currentPage: PageId
  onItemClick: (page: PageId) => void
}

function MobileMenuItemsBase({ items, currentPage, onItemClick }: MobileMenuItemsProps) {
  return (
    <>
      {items.map((item) => (
        <NavigationMenuItem
          key={item.id}
          item={item}
          isActive={currentPage === item.id}
          onClick={onItemClick}
          variant="mobile"
        />
      ))}
    </>
  )
}

export const MobileMenuItems = memo(MobileMenuItemsBase)
MobileMenuItems.displayName = 'MobileMenuItems'
