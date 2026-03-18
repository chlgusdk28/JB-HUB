import { ReactNode } from 'react';

interface OpalButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
}

export function OpalButton({
  children,
  onClick,
  variant = 'secondary',
  size = 'md',
  icon,
  disabled = false,
  type = 'button',
  className = '',
}: OpalButtonProps) {
  const baseStyles =
    'inline-flex items-center justify-center gap-2 rounded-xl border font-semibold tracking-tight transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7f9ab6] focus-visible:ring-offset-2';
  
  const variantStyles = {
    primary:
      'border-[#264969] bg-[#264969] text-white shadow-[0_5px_12px_rgba(16,40,62,0.18)] hover:border-[#1f3e5a] hover:bg-[#1f3e5a]',
    secondary:
      'border-slate-300 bg-white text-slate-700 shadow-[0_2px_6px_rgba(20,42,60,0.08)] hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900',
    ghost: 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  };

  const sizeStyles = {
    sm: 'px-3.5 py-2 text-xs',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-5 py-3 text-[15px]',
  };

  const disabledStyles = disabled
    ? 'opacity-45 cursor-not-allowed pointer-events-none saturate-50'
    : 'cursor-pointer';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${disabledStyles} ${className}`}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span>{children}</span>
    </button>
  );
}
