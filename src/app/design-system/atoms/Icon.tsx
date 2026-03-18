import { ReactNode } from 'react';

type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
type IconColor = 'primary' | 'secondary' | 'tertiary' | 'muted';

interface IconProps {
  icon: ReactNode;
  size?: IconSize;
  color?: IconColor;
  className?: string;
}

const sizeStyles: Record<IconSize, string> = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
  xl: 'w-8 h-8',
};

const colorStyles: Record<IconColor, string> = {
  primary: 'text-gray-900',
  secondary: 'text-gray-600',
  tertiary: 'text-gray-400',
  muted: 'text-gray-300',
};

export function Icon({
  icon,
  size = 'md',
  color = 'tertiary',
  className = '',
}: IconProps) {
  return (
    <div className={`${sizeStyles[size]} ${colorStyles[color]} ${className} flex-shrink-0`}>
      {icon}
    </div>
  );
}
