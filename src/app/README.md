# App Layout

Use this directory map when adding or finding frontend code.

## Core folders

- `components/`: screens, sections, and composite UI
- `lib/`: API calls, helpers, browser storage, formatting
- `hooks/`: reusable React hooks
- `constants/`: fixed labels and filter definitions
- `data/`: frontend seed data such as project and discussion fixtures
- `types/`: shared frontend types
- `utils/`: small pure helpers
- `design-system/`: reusable design primitives

## Components folder rule of thumb

- `components/admin/`: admin console only
- `components/signup/`: signup platform only
- `components/user/`: user profile and user-facing panels
- `components/common/`: layout primitives reused across screens
- `components/ui/`: small generic UI wrappers
- `components/opal/` and `components/figma/`: theme- or variant-specific UI
- `components/` root: page-level containers and larger feature shells

## Good placement rule

If a file is used by one screen only, keep it next to that screen's folder.
If it is shared across multiple screens, move it to `common/`, `ui/`, `lib/`, or `hooks/`.

## Good reading order

1. `App.tsx`
2. `components/RestoredHubApp.tsx`
3. `components/`
4. `lib/`
