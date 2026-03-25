interface MetricCardProps {
  label: string
  value: string | number
  className?: string
  valueClassName?: string
}

export function MetricCard({ label, value, className = '', valueClassName = '' }: MetricCardProps) {
  return (
    <div className={`metric-card surface-soft fade-up ${className}`}>
      <p className="metric-card-label">{label}</p>
      <p className={`metric-card-value ${valueClassName}`}>{value}</p>
    </div>
  )
}
