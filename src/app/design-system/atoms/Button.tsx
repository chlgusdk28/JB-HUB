import { ReactNode } from 'react';

type ButtonSize = 'sm' | 'md' | 'lg';
type ButtonEmphasis = 'high' | 'medium' | 'low';

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  size?: ButtonSize;
  emphasis?: ButtonEmphasis;
  icon?: ReactNode;
  disabled?: boolean;
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

// Opal 스타일: 모든 emphasis가 미세한 차이만
const emphasisStyles: Record<ButtonEmphasis, string> = {
  high: 'text-gray-900 hover:text-gray-600',
  medium: 'text-gray-600 hover:text-gray-900',
  low: 'text-gray-400 hover:text-gray-600',
};

export function Button({
  children,
  onClick,
  size = 'md',
  emphasis = 'medium',
  icon,
  disabled = false,
}: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        flex items-center gap-2
        transition-colors duration-150
        ${sizeStyles[size]}
        ${emphasisStyles[emphasis]}
        ${disabled ? 'opacity-30 cursor-not-allowed pointer-events-none' : 'cursor-pointer'}
      `}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span>{children}</span>
    </button>
  );
}
