import { Search } from 'lucide-react';
import { Icon } from '../atoms/Icon';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  variant?: 'filled' | 'underlined' | 'minimal';
  size?: 'sm' | 'md' | 'lg';
}

export function SearchBar({
  value,
  onChange,
  placeholder = '검색',
  variant = 'filled',
  size = 'md',
}: SearchBarProps) {
  const sizeStyles = {
    sm: 'text-xs py-2',
    md: 'text-sm py-2.5',
    lg: 'text-xl py-3',
  };

  const variantStyles = {
    filled: 'bg-gray-50 rounded-lg px-4 focus-within:bg-gray-100',
    underlined: 'bg-transparent border-b border-gray-200 px-0 focus-within:border-gray-300',
    minimal: 'bg-transparent px-0',
  };

  const iconLeft = variant === 'filled' ? '4' : '0';

  return (
    <div className={`relative flex items-center gap-3 transition-colors ${variantStyles[variant]}`}>
      <div className={`flex-shrink-0 ${variant === 'filled' ? 'ml-0' : ''}`}>
        <Icon icon={<Search />} size="sm" color="tertiary" />
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`
          flex-1
          bg-transparent
          text-gray-900
          placeholder:text-gray-400
          focus:outline-none
          ${sizeStyles[size]}
        `}
      />
    </div>
  );
}
