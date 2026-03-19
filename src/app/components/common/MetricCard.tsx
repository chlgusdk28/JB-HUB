interface MetricCardProps {
  label: string
  value: string | number
  className?: string
  valueClassName?: string
}

export function MetricCard({ label, value, className = '', valueClassName = '' }: MetricCardProps) {
  return (
    <div className={`metric-card surface-soft fade-up ${className}`}>
      <div className="metric-card-head">
        <p className="metric-card-label">{label}</p>
        <span className="metric-card-dot" aria-hidden="true" />
      </div>
      <p className={`metric-card-value ${valueClassName}`}>{value}</p>
      <div className="metric-card-foot" aria-hidden="true">
        <span className="metric-card-footline" />
        <span className="metric-card-footline metric-card-footline-short" />
      </div>
    </div>
  )
}
