import { ReactNode } from 'react';

interface OpalCardProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  padding?: 'small' | 'medium' | 'large';
}

export function OpalCard({ children, onClick, className = '', padding = 'medium' }: OpalCardProps) {
  const paddingClasses = {
    small: 'p-6',
    medium: 'p-8',
    large: 'p-12',
  };

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl transition-all ${
        onClick ? 'cursor-pointer hover:shadow-md' : 'shadow-sm'
      } ${paddingClasses[padding]} ${className}`}
      style={{
        boxShadow: onClick 
          ? '0 1px 3px rgba(0, 0, 0, 0.04)'
          : '0 1px 3px rgba(0, 0, 0, 0.04)',
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.08)';
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.04)';
        }
      }}
    >
      {children}
    </div>
  );
}
