import { getApiBase } from './api-base'

const API_V1_BASE = getApiBase('/api/v1')

export interface PublicSiteContent {
  [key: string]: string
}

export async function fetchPublicSiteContent(): Promise<PublicSiteContent> {
  const response = await fetch(`${API_V1_BASE}/site-content`)
  if (!response.ok) {
    throw new Error(`사이트 문구를 불러오지 못했습니다. (${response.status})`)
  }

  const payload = (await response.json()) as { content?: unknown }
  if (!payload.content || typeof payload.content !== 'object') {
    return {}
  }

  return payload.content as PublicSiteContent
}

export function readSiteContentValue(
  content: PublicSiteContent | null | undefined,
  key: string,
  fallback: string,
) {
  const value = content?.[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}
