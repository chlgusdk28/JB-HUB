import { ReactNode, type RefObject } from 'react';

interface OpalInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'email' | 'password' | 'search';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  variant?: 'filled' | 'underlined' | 'minimal';
  disabled?: boolean;
  className?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  id?: string;
  showClearButton?: boolean;
  onClear?: () => void;
  shortcutHint?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  autoComplete?: string;
}

export function OpalInput({
  value,
  onChange,
  placeholder = '',
  type = 'text',
  size = 'md',
  icon,
  variant = 'filled',
  disabled = false,
  className = '',
  inputRef,
  id,
  showClearButton = false,
  onClear,
  shortcutHint,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  autoComplete,
}: OpalInputProps) {
  const sizeStyles = {
    sm: 'text-xs py-2',
    md: 'text-sm py-3',
    lg: 'text-base py-3.5',
  };

  const variantStyles = {
    filled:
      'rounded-xl border border-[#cbd8e3] bg-white/94 px-4 shadow-[0_3px_8px_rgba(17,42,63,0.06)] backdrop-blur-sm focus:border-[#33597f] focus:bg-white focus:ring-2 focus:ring-[#d9e4ef]',
    underlined: 'bg-transparent border-b border-slate-300 px-0 focus:border-[#33597f]',
    minimal: 'bg-transparent px-0',
  };

  const hasClearButton = showClearButton && value.length > 0;
  const hasTrailing = Boolean(shortcutHint) || hasClearButton;
  const iconPadding = icon ? (variant === 'filled' ? 'pl-11' : 'pl-8') : '';
  const trailingPadding = hasTrailing ? (variant === 'filled' ? 'pr-24' : 'pr-16') : '';

  return (
    <div className={`relative w-full ${className}`}>
      {icon && (
        <div className={`absolute ${variant === 'filled' ? 'left-4' : 'left-0'} top-1/2 -translate-y-1/2 text-slate-500`}>
          {icon}
        </div>
      )}
      <input
        id={id}
        ref={inputRef}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        autoComplete={autoComplete}
        className={`
          w-full
          ${sizeStyles[size]}
          ${variantStyles[variant]}
          ${iconPadding}
          ${trailingPadding}
          font-medium text-slate-900
          placeholder:text-slate-500
          focus:outline-none
          transition-all
          duration-300
          ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
        `}
      />
      {hasTrailing ? (
        <div
          className={`pointer-events-none absolute ${variant === 'filled' ? 'right-3' : 'right-0'} top-1/2 flex -translate-y-1/2 items-center gap-1.5`}
        >
          {shortcutHint ? (
            <span className="rounded-md border border-slate-200 bg-white/92 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 shadow-[0_2px_6px_rgba(16,38,58,0.08)]">
              {shortcutHint}
            </span>
          ) : null}
          {hasClearButton ? (
            <button
              type="button"
              onClick={() => (onClear ? onClear() : onChange(''))}
              className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="검색어 지우기"
            >
              <span className="text-sm leading-none">x</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
