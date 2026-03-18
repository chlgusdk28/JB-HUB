type TagSize = 'sm' | 'md';
type TagVariant = 'default' | 'subtle';

interface TagProps {
  label: string;
  size?: TagSize;
  variant?: TagVariant;
  onClick?: () => void;
}

const sizeStyles: Record<TagSize, string> = {
  sm: 'text-xs',
  md: 'text-sm',
};

const variantStyles: Record<TagVariant, string> = {
  default: 'text-gray-500',
  subtle: 'text-gray-400',
};

export function Tag({
  label,
  size = 'sm',
  variant = 'default',
  onClick,
}: TagProps) {
  const interactiveClass = onClick ? 'cursor-pointer hover:text-gray-900 transition-colors' : '';

  return (
    <span
      onClick={onClick}
      className={`${sizeStyles[size]} ${variantStyles[variant]} ${interactiveClass}`}
    >
      {label}
    </span>
  );
}
