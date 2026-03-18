interface MetricCardProps {
  label: string
  value: string | number
  className?: string
  valueClassName?: string
}

export function MetricCard({ label, value, className = '', valueClassName = '' }: MetricCardProps) {
  return (
    <div className={`surface-soft fade-up rounded-2xl px-4 py-4 ${className}`}>
      <p className="text-[11px] font-semibold tracking-[0.06em] text-slate-500">{label}</p>
      <p className={`mt-1 truncate text-2xl font-bold text-slate-900 ${valueClassName}`}>{value}</p>
    </div>
  )
}
