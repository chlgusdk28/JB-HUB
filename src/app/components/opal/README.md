# Opal Design System

Google Opal 스타일을 엄격히 따르는 UI 컴포넌트 라이브러리입니다.

## 핵심 원칙

### 1. 테두리 없음 (No Borders)
- 기본적으로 border를 사용하지 않습니다
- 영역 구분은 여백과 배경색으로만 처리합니다

### 2. 최소한의 대비 (Minimal Contrast)
- 배경색 차이를 거의 두지 않습니다
- 회색 계열만 사용합니다 (No accent colors)

### 3. 매우 약한 그림자 (Subtle Shadows)
```css
minimal: 0 1px 2px rgba(0, 0, 0, 0.03)
low: 0 2px 4px rgba(0, 0, 0, 0.04)
```

### 4. 크기와 여백으로 강조 (Size & Spacing)
- 색상이 아닌 크기로 중요도를 표현합니다
- 넉넉한 여백으로 호흡감을 만듭니다

### 5. 조용한 디자인 (Quiet Design)
- 컴포넌트가 눈에 띄지 않아야 합니다
- 사용자는 내용에 집중해야 합니다

## 컴포넌트

### OpalButton
기본 버튼은 거의 텍스트처럼 보입니다.

```tsx
<OpalButton variant="primary" size="md">
  클릭
</OpalButton>
```

**Variants:**
- `primary` - 진한 회색 (text-gray-900)
- `secondary` - 중간 회색 (text-gray-600)
- `ghost` - 연한 회색 (text-gray-400)

**Sizes:** `sm` | `md` | `lg`

### OpalInput
테두리 없는 입력 필드입니다.

```tsx
<OpalInput
  value={value}
  onChange={setValue}
  variant="filled"
  icon={<Search className="w-4 h-4" />}
/>
```

**Variants:**
- `filled` - 연한 배경 (bg-gray-50)
- `underlined` - 하단 border만
- `minimal` - 배경 없음

### OpalTag
배경색 없는 텍스트 기반 태그입니다.

```tsx
<OpalTag size="sm" variant="subtle">
  Python
</OpalTag>
```

### OpalCard
매우 약한 그림자를 가진 카드입니다.

```tsx
<OpalCard padding="comfortable" elevation="minimal">
  {children}
</OpalCard>
```

**Padding:** `compact` | `comfortable` | `spacious`
**Elevation:** `none` | `minimal` | `low`

### OpalProjectCard
프로젝트 정보를 표시하는 특화 카드입니다.

```tsx
<OpalProjectCard
  title="프로젝트 제목"
  description="설명"
  author="작성자"
  stars={42}
  tags={['Python', 'AI']}
  onClick={handleClick}
/>
```

### OpalNavBar
낮은 존재감의 상단 네비게이션입니다.

```tsx
<OpalNavBar
  logoText="서비스명"
  searchSlot={<OpalInput ... />}
  rightItems={<UserProfile />}
/>
```

### OpalSidebarMenu
구분선 없는 사이드바 메뉴입니다.

```tsx
<OpalSidebarMenu
  sections={[
    {
      title: "메인",
      items: [
        { id: 'home', label: '홈', icon: <Home /> }
      ]
    }
  ]}
  activeItemId="home"
  onItemClick={handleClick}
/>
```

## 색상 팔레트

```
배경: #FAFBFC
카드: #FFFFFF
텍스트 주요: #111827 (gray-900)
텍스트 보조: #6B7280 (gray-600)
텍스트 약함: #9CA3AF (gray-400)
텍스트 최약: #D1D5DB (gray-300)
Border: #E5E7EB (gray-200)
```

## 타이포그래피

```
Hero: 3rem (48px) - text-5xl
Heading 1: 2rem (32px) - text-3xl
Heading 2: 1.5rem (24px) - text-2xl
Heading 3: 1.25rem (20px) - text-xl
Body: 0.9375rem (15px) - text-[15px]
Small: 0.875rem (14px) - text-sm
Tiny: 0.75rem (12px) - text-xs
```

## 간격 체계

```
4px   - gap-1
8px   - gap-2
12px  - gap-3
16px  - gap-4
24px  - gap-6
32px  - gap-8
48px  - gap-12
64px  - gap-16
```
