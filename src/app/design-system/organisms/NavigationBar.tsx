import { ReactNode } from 'react';
import { Text } from '../atoms/Text';

interface NavigationBarProps {
  logo?: ReactNode;
  logoText?: string;
  searchSlot?: ReactNode;
  actions?: ReactNode;
}

export function NavigationBar({
  logo,
  logoText,
  searchSlot,
  actions,
}: NavigationBarProps) {
  return (
    <nav className="h-20 bg-white/60 backdrop-blur-md fixed top-0 left-0 right-0 z-50 border-b border-gray-100">
      <div className="h-full max-w-7xl mx-auto px-8 flex items-center justify-between gap-8">
        {/* Logo */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {logo}
          {logoText && <Text variant="body" color="primary">{logoText}</Text>}
        </div>

        {/* Search */}
        {searchSlot && (
          <div className="flex-1 max-w-md">
            {searchSlot}
          </div>
        )}

        {/* Actions */}
        {actions && (
          <div className="flex items-center gap-4 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>
    </nav>
  );
}
