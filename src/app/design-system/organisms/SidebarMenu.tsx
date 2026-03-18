import { ReactNode } from 'react';
import { Text } from '../atoms/Text';
import { Icon } from '../atoms/Icon';

interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  badge?: number;
}

interface MenuSection {
  title?: string;
  items: MenuItem[];
}

interface SidebarMenuProps {
  sections: MenuSection[];
  activeItemId?: string;
  onItemClick?: (itemId: string) => void;
  width?: number;
}

export function SidebarMenu({
  sections,
  activeItemId,
  onItemClick,
  width = 224,
}: SidebarMenuProps) {
  return (
    <aside
      className="h-screen fixed left-0 top-20 py-8"
      style={{ width: `${width}px` }}
    >
      <nav className="px-6 space-y-10">
        {sections.map((section, sectionIndex) => (
          <div key={sectionIndex} className="space-y-1">
            {/* Section Title */}
            {section.title && (
              <div className="px-3 mb-4">
                <Text variant="meta" color="tertiary">{section.title}</Text>
              </div>
            )}

            {/* Items */}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = activeItemId === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => onItemClick?.(item.id)}
                    className={`
                      w-full
                      flex items-center justify-between
                      gap-3 px-3 py-2.5
                      rounded-lg
                      transition-colors
                      ${isActive ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'}
                    `}
                  >
                    <div className="flex items-center gap-3">
                      {item.icon && (
                        <Icon 
                          icon={item.icon} 
                          size="sm" 
                          color={isActive ? 'primary' : 'secondary'} 
                        />
                      )}
                      <Text 
                        variant="small" 
                        color={isActive ? 'primary' : 'secondary'}
                        className={isActive ? 'font-medium' : ''}
                      >
                        {item.label}
                      </Text>
                    </div>

                    {/* Badge */}
                    {item.badge !== undefined && item.badge > 0 && (
                      <Text variant="meta" color="tertiary">{item.badge}</Text>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
