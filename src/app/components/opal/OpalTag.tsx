import type { ReactNode } from 'react'

interface OpalTagProps {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  category?: string
}

const toneMap = [
  {
    keywords: ['ai', 'rag', 'llama', 'haystack', 'search', 'nlp', 'analytics', 'bi', 'visualization'],
    className: 'border-[#d8e3ef] bg-[#f1f6fb] text-[#2c4f71]',
  },
  {
    keywords: ['monitoring', 'logs', 'grafana', 'prometheus', 'elk', 'observability'],
    className: 'border-[#d8e5ea] bg-[#f2f7fa] text-[#2b5868]',
  },
  {
    keywords: ['security', 'sso', 'vault', 'auth', 'keycloak', 'siem', 'e2e'],
    className: 'border-[#dbe2ec] bg-[#f4f7fb] text-[#324a67]',
  },
  {
    keywords: ['devops', 'git', 'docker', 'ci/cd', 'registry', 'artifact'],
    className: 'border-[#d6dfeb] bg-[#f1f5fa] text-[#2b4f74]',
  },
  {
    keywords: ['workflow', 'automation', 'rpa', 'n8n', 'airflow', 'process'],
    className: 'border-[#e0e5ec] bg-[#f6f8fb] text-[#4b5f77]',
  },
  {
    keywords: ['wiki', 'doc', 'knowledge', 'file', 'cloud', 'collaboration', 'messenger'],
    className: 'border-[#dbe3ef] bg-[#f3f6fc] text-[#3f5370]',
  },
]

function resolveCategoryColor(category?: string) {
  if (!category) {
    return null
  }

  const normalized = category.toLowerCase()
  const matched = toneMap.find((tone) => tone.keywords.some((keyword) => normalized.includes(keyword)))
  return matched ? matched.className : null
}

export function OpalTag({ children, variant = 'primary', size = 'md', category }: OpalTagProps) {
  const sizeClasses = {
    sm: 'px-2.5 py-1 text-[11px]',
    md: 'px-3 py-1.5 text-xs',
    lg: 'px-4 py-2 text-sm',
  }

  const variantClasses = {
    primary: 'border-slate-300 bg-slate-100 text-slate-700',
    secondary: 'border-slate-200 bg-white text-slate-700',
    success: 'border-sky-200 bg-sky-100/75 text-sky-800',
    warning: 'border-blue-200 bg-blue-100/75 text-blue-800',
    danger: 'border-rose-200 bg-rose-100/75 text-rose-800',
  }

  const categoryClass = resolveCategoryColor(category)
  const colorClass = categoryClass ?? variantClasses[variant]

  return (
    <span className={`inline-flex items-center rounded-full border font-semibold tracking-wide ${colorClass} ${sizeClasses[size]}`}>
      {children}
    </span>
  )
}

