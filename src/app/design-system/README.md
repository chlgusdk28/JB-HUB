# Opal Design System

Figma 컴포넌트 트리 구조를 코드로 구현한 체계적인 디자인 시스템입니다.

## 🏗️ 컴포넌트 트리 구조

```
Opal Design System
│
├── 1. Foundations (디자인 토큰)
│   ├── Color Tokens
│   │   ├── Background (page, surface, elevated)
│   │   ├── Text (primary, secondary, tertiary, muted)
│   │   ├── Border (subtle, default)
│   │   └── Interactive (default, hover, disabled)
│   │
│   ├── Typography Scale
│   │   ├── Title (hero, section, subsection)
│   │   ├── Body (large, default, small)
│   │   └── Meta (default, tiny)
│   │
│   ├── Spacing Scale
│   │   └── xs, s, m, l, xl, 2xl, 3xl, 4xl
│   │
│   ├── Elevation (그림자)
│   │   └── none, minimal, low, medium
│   │
│   └── Border Radius
│       └── sm, md, lg, xl, 2xl, full
│
├── 2. Atoms (기본 요소)
│   ├── Text (variant, color, align)
│   ├── Icon (size, color)
│   ├── Divider (variant, orientation)
│   ├── Tag (size, variant)
│   └── Button (size, emphasis, icon)
│
├── 3. Molecules (조합 요소)
│   ├── ProjectMetaBlock (stars, forks, comments)
│   ├── UserInfoBlock (avatar, name, subtitle)
│   └── ActionGroup (star, fork, download)
│
├── 4. Organisms (복잡한 컴포넌트)
│   ├── ProjectCard
│   ├── NavigationBar
│   ├── SidebarMenu
│   └── SearchBar
│
├── 5. Templates (레이아웃)
│   ├── HomeLayout
│   ├── ExploreLayout
│   └── ProjectDetailLayout
│
└── 6. Pages (완성된 페이지)
    ├── Home
    ├── Explore
    └── Project Detail
```

## 📐 Foundations

### Color Tokens
```typescript
tokens.colors.text.primary    // #111827 (gray-900)
tokens.colors.text.secondary  // #6B7280 (gray-600)
tokens.colors.text.tertiary   // #9CA3AF (gray-400)
tokens.colors.text.muted      // #D1D5DB (gray-300)
```

### Typography Scale
```typescript
// Title
hero:       48px / line-height 1.2 / weight 500
section:    32px / line-height 1.3 / weight 500
subsection: 24px / line-height 1.4 / weight 500

// Body
large:   18px / line-height 1.6 / weight 400
default: 15px / line-height 1.6 / weight 400
small:   14px / line-height 1.5 / weight 400

// Meta
default: 12px / line-height 1.5 / weight 400
tiny:    11px / line-height 1.4 / weight 400
```

### Spacing Scale (4px 기반)
```typescript
xs:  4px   // 1
s:   8px   // 2
m:   16px  // 4
l:   24px  // 6
xl:  32px  // 8
2xl: 48px  // 12
3xl: 64px  // 16
4xl: 96px  // 24
```

## 🧩 사용 예시

### Atoms 사용
```tsx
import { Text, Icon, Button } from '@/app/design-system';

<Text variant="hero" color="primary">제목</Text>
<Icon icon={<Star />} size="md" color="tertiary" />
<Button size="md" emphasis="medium">클릭</Button>
```

### Molecules 사용
```tsx
import { ProjectMetaBlock, UserInfoBlock } from '@/app/design-system';

<ProjectMetaBlock stars={42} forks={12} comments={8} />
<UserInfoBlock name="김지현" subtitle="2시간 전" />
```

### Organisms 사용
```tsx
import { ProjectCard, SearchBar } from '@/app/design-system';

<ProjectCard
  title="AI 챗봇"
  description="자동 응답 시스템"
  author="김지현"
  tags={['Python', 'AI']}
/>

<SearchBar
  value={query}
  onChange={setQuery}
  variant="filled"
/>
```

### Templates 사용
```tsx
import { HomeLayout } from '@/app/design-system';

<HomeLayout
  header={<NavigationBar />}
  sidebar={<SidebarMenu />}
  content={<ProjectList />}
/>
```

## 🎨 Auto Layout 원칙

모든 컴포넌트는 Auto Layout(Flexbox)을 사용합니다:

```tsx
// Horizontal Auto Layout
<div className="flex items-center gap-3">

// Vertical Auto Layout
<div className="flex flex-col gap-4">

// Space Between
<div className="flex items-center justify-between">
```

## 🔄 Variant 패턴

각 컴포넌트는 Props로 변형을 제어합니다:

```tsx
// Size Variants
size: 'sm' | 'md' | 'lg'

// Color Variants
color: 'primary' | 'secondary' | 'tertiary' | 'muted'

// Emphasis Variants
emphasis: 'high' | 'medium' | 'low'

// Style Variants
variant: 'filled' | 'underlined' | 'minimal'
```

## 📦 디렉토리 구조

```
design-system/
├── foundations/
│   └── tokens.ts
├── atoms/
│   ├── Text.tsx
│   ├── Icon.tsx
│   ├── Divider.tsx
│   ├── Tag.tsx
│   └── Button.tsx
├── molecules/
│   ├── ProjectMetaBlock.tsx
│   ├── UserInfoBlock.tsx
│   └── ActionGroup.tsx
├── organisms/
│   ├── ProjectCard.tsx
│   ├── NavigationBar.tsx
│   ├── SidebarMenu.tsx
│   └── SearchBar.tsx
├── templates/
│   ├── HomeLayout.tsx
│   ├── ExploreLayout.tsx
│   └── ProjectDetailLayout.tsx
├── index.ts
└── README.md
```

## ✨ Opal 스타일 원칙

1. **테두리 없음** - border를 기본으로 사용하지 않음
2. **최소 대비** - 회색 계열만 사용
3. **약한 그림자** - 거의 인지되지 않을 정도
4. **크기로 강조** - 색상 대신 크기와 여백
5. **조용한 디자인** - 눈에 띄지 않게
