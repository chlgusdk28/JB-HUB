type DividerVariant = 'subtle' | 'default';
type DividerOrientation = 'horizontal' | 'vertical';

interface DividerProps {
  variant?: DividerVariant;
  orientation?: DividerOrientation;
  spacing?: number;
}

const variantStyles: Record<DividerVariant, string> = {
  subtle: 'bg-gray-100',   // 거의 보이지 않음
  default: 'bg-gray-200',
};

export function Divider({
  variant = 'subtle',
  orientation = 'horizontal',
  spacing = 0,
}: DividerProps) {
  const marginClass = spacing > 0 ? `my-${spacing}` : '';

  if (orientation === 'vertical') {
    return <div className={`w-px h-full ${variantStyles[variant]}`} />;
  }

  return <div className={`h-px w-full ${variantStyles[variant]} ${marginClass}`} />;
}
