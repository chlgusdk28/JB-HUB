import type { ReactNode } from 'react'
import { cn } from '../ui/utils'
import { NavigationMenuItem } from './NavigationMenuItem'
import { PageHeader } from './PageHeader'
import type { NavigationSection } from './navigation-types'

interface PlatformFrameProps<TId extends string = string> {
  brandMark: ReactNode
  brandEyebrow: ReactNode
  brandTitle: ReactNode
  brandDescription?: ReactNode
  onBrandClick?: () => void
  navigationSections: NavigationSection<TId>[]
  activeNavigationId: TId
  onSelectNavigation: (itemId: TId) => void
  headerEyebrow?: ReactNode
  headerTitle?: ReactNode
  headerDescription?: ReactNode
  headerActions?: ReactNode
  headerMeta?: ReactNode
  sidebarLead?: ReactNode
  sidebarFooter?: ReactNode
  children: ReactNode
  className?: string
}

export function PlatformFrame<TId extends string = string>({
  brandMark,
  brandEyebrow,
  brandTitle,
  brandDescription,
  onBrandClick,
  navigationSections,
  activeNavigationId,
  onSelectNavigation,
  headerEyebrow,
  headerTitle,
  headerDescription,
  headerActions,
  headerMeta,
  sidebarLead,
  sidebarFooter,
  children,
  className,
}: PlatformFrameProps<TId>) {
  const BrandWrapper = onBrandClick ? 'button' : 'div'
  const hasHeader = [headerEyebrow, headerTitle, headerDescription, headerActions, headerMeta].some(Boolean)

  return (
    <div className={cn('platform-shell', className)}>
      <aside className="platform-sidebar">
        <div className="platform-sidebar-card">
          <div className="platform-sidebar-card-inner">
            <BrandWrapper
              {...(onBrandClick
                ? {
                    type: 'button',
                    onClick: onBrandClick,
                    className:
                      'platform-brand-row w-full cursor-pointer rounded-[28px] border-0 bg-transparent p-0 text-left transition hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70',
                    'aria-label': '홈으로 이동',
                  }
                : {
                    className: 'platform-brand-row',
                  })}
            >
              <div className="platform-brand-mark">{brandMark}</div>
              <div className="platform-brand-copy">
                <p className="platform-brand-eyebrow">{brandEyebrow}</p>
                <h1 className="platform-brand-title">{brandTitle}</h1>
                {brandDescription ? <p className="platform-brand-description">{brandDescription}</p> : null}
              </div>
            </BrandWrapper>

            {sidebarLead ? <div className="platform-sidebar-slot">{sidebarLead}</div> : null}

            <div className="platform-nav-stack">
              {navigationSections.map((section, sectionIndex) => (
                <div key={`section-${sectionIndex}`} className="platform-nav-section">
                  {section.title ? <p className="platform-nav-section-title">{section.title}</p> : null}
                  <div className="platform-nav-section-card">
                    <div className="space-y-2">
                      {section.items.map((item) => (
                        <NavigationMenuItem
                          key={item.id}
                          item={item}
                          isActive={item.id === activeNavigationId}
                          onClick={onSelectNavigation}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {sidebarFooter ? <div className="platform-sidebar-footer">{sidebarFooter}</div> : null}
          </div>
        </div>
      </aside>

      <main className="platform-main">
        {hasHeader ? (
          <PageHeader
            eyebrow={headerEyebrow}
            title={headerTitle ?? ''}
            description={headerDescription}
            actions={headerActions}
            meta={headerMeta}
            className="platform-main-header"
          />
        ) : null}
        <div className={cn('platform-main-content', !hasHeader && 'platform-main-content-no-header')}>{children}</div>
      </main>
    </div>
  )
}
