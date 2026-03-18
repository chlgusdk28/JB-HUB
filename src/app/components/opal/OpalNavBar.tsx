import { ReactNode } from 'react';

interface NavItem {
  id: string;
  label: string;
  icon?: ReactNode;
}

interface OpalNavBarProps {
  logo?: ReactNode;
  logoText?: string;
  leftItems?: NavItem[];
  rightItems?: ReactNode;
  searchSlot?: ReactNode;
}

export function OpalNavBar({
  logo,
  logoText,
  leftItems = [],
  rightItems,
  searchSlot,
}: OpalNavBarProps) {
  return (
    <nav
      className="fixed left-0 right-0 top-0 z-50 h-20 border-b border-slate-200/80 bg-white/92 backdrop-blur-lg"
      style={{
        boxShadow: '0 8px 18px rgba(10, 38, 62, 0.08), inset 0 -1px 0 rgba(255, 255, 255, 0.78)',
      }}
    >
      <div className="mx-auto flex h-full w-full max-w-[1500px] items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <div className="flex flex-shrink-0 items-center gap-3">
          {logo && <div className="flex-shrink-0">{logo}</div>}
          {logoText && (
            <span className="whitespace-nowrap text-lg font-bold tracking-tight text-slate-900">
              {logoText}
            </span>
          )}
        </div>

        {/* Left Navigation Items */}
        {leftItems.length > 0 && (
          <div className="flex items-center gap-1">
            {leftItems.map((item) => (
              <button
                key={item.id}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        )}

        {/* Search Slot */}
        {searchSlot && (
          <div className="max-w-2xl flex-1">
            {searchSlot}
          </div>
        )}

        {/* Right Items */}
        {rightItems && (
          <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
            {rightItems}
          </div>
        )}
      </div>
    </nav>
  );
}
