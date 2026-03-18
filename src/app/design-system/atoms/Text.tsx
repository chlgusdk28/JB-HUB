import { ReactNode } from 'react';

type TextVariant = 'hero' | 'section' | 'subsection' | 'large' | 'body' | 'small' | 'meta' | 'tiny';
type TextColor = 'primary' | 'secondary' | 'tertiary' | 'muted';
type TextAlign = 'left' | 'center' | 'right';

interface TextProps {
  variant?: TextVariant;
  color?: TextColor;
  align?: TextAlign;
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<TextVariant, string> = {
  hero: 'text-5xl font-medium leading-tight',
  section: 'text-3xl font-medium leading-snug',
  subsection: 'text-2xl font-medium leading-snug',
  large: 'text-lg leading-relaxed',
  body: 'text-[15px] leading-relaxed',
  small: 'text-sm leading-normal',
  meta: 'text-xs leading-normal',
  tiny: 'text-[11px] leading-tight',
};

const colorStyles: Record<TextColor, string> = {
  primary: 'text-gray-900',
  secondary: 'text-gray-600',
  tertiary: 'text-gray-400',
  muted: 'text-gray-300',
};

const alignStyles: Record<TextAlign, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

export function Text({
  variant = 'body',
  color = 'primary',
  align = 'left',
  children,
  className = '',
}: TextProps) {
  return (
    <div className={`${variantStyles[variant]} ${colorStyles[color]} ${alignStyles[align]} ${className}`}>
      {children}
    </div>
  );
}
