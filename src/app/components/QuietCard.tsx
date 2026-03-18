import { ReactNode } from 'react';

interface QuietCardProps {
  children: ReactNode;
  onClick?: () => void;
  spacing?: 'compact' | 'comfortable' | 'spacious';
}

export function QuietCard({ children, onClick, spacing = 'comfortable' }: QuietCardProps) {
  const spacingClasses = {
    compact: 'p-8',
    comfortable: 'p-10',
    spacious: 'p-12',
  };

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl transition-all duration-150 ${
        onClick ? 'cursor-pointer' : ''
      } ${spacingClasses[spacing]}`}
      style={{
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.06)';
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.03)';
        }
      }}
    >
      {children}
    </div>
  );
}
