/**
 * Opal Design System - Foundation Tokens
 * 모든 디자인 결정의 기반이 되는 토큰 정의
 */

export const tokens = {
  // Color Tokens - 회색 계열만 사용
  colors: {
    background: {
      page: '#FAFBFC',
      surface: '#FFFFFF',
      elevated: '#FFFFFF',
    },
    text: {
      primary: '#111827',   // gray-900
      secondary: '#6B7280', // gray-600
      tertiary: '#9CA3AF',  // gray-400
      muted: '#D1D5DB',     // gray-300
    },
    border: {
      subtle: '#F3F4F6',    // gray-100
      default: '#E5E7EB',   // gray-200
    },
    interactive: {
      default: '#6B7280',   // gray-600
      hover: '#111827',     // gray-900
      disabled: '#D1D5DB',  // gray-300
    },
  },

  // Typography Scale - 크기로 위계 표현
  typography: {
    title: {
      hero: { size: 48, lineHeight: 1.2, weight: 500 },      // text-5xl
      section: { size: 32, lineHeight: 1.3, weight: 500 },   // text-3xl
      subsection: { size: 24, lineHeight: 1.4, weight: 500 }, // text-2xl
    },
    body: {
      large: { size: 18, lineHeight: 1.6, weight: 400 },     // text-lg
      default: { size: 15, lineHeight: 1.6, weight: 400 },   // text-[15px]
      small: { size: 14, lineHeight: 1.5, weight: 400 },     // text-sm
    },
    meta: {
      default: { size: 12, lineHeight: 1.5, weight: 400 },   // text-xs
      tiny: { size: 11, lineHeight: 1.4, weight: 400 },
    },
  },

  // Spacing Scale - 여백 중심 설계 (4px 기반)
  spacing: {
    xs: 4,   // 1
    s: 8,    // 2
    m: 16,   // 4
    l: 24,   // 6
    xl: 32,  // 8
    '2xl': 48,  // 12
    '3xl': 64,  // 16
    '4xl': 96,  // 24
  },

  // Elevation - 매우 약한 그림자
  elevation: {
    none: '0 0 0 rgba(0, 0, 0, 0)',
    minimal: '0 1px 2px rgba(0, 0, 0, 0.03)',
    low: '0 2px 4px rgba(0, 0, 0, 0.04)',
    medium: '0 4px 8px rgba(0, 0, 0, 0.06)',
  },

  // Border Radius
  radius: {
    none: 0,
    sm: 6,
    md: 8,
    lg: 12,
    xl: 16,
    '2xl': 20,
    full: 9999,
  },

  // Transitions
  transition: {
    fast: '100ms',
    normal: '150ms',
    slow: '300ms',
  },
} as const;

export type Tokens = typeof tokens;
