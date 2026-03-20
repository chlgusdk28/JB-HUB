# Components Layout

This folder is organized by usage scope first.

## Subfolders

- `admin/`: admin console and admin-only panels
- `signup/`: signup platform screens
- `user/`: user profile and user-facing personal panels
- `common/`: shared layout pieces and reusable section wrappers
- `ui/`: small low-level UI building blocks
- `opal/`: Opal-styled components
- `figma/`: Figma-inspired or imported component variants
- `app/`: app shell and top-level composition helpers

## Root-level files

Files left directly in `components/` are usually one of these:

- page components
- large feature shells
- legacy shared screens not grouped yet

## Placement rule for new files

- One feature only: place it in the closest feature folder.
- Shared view logic: move it to `common/`.
- Small generic UI: move it to `ui/`.
- Theme-specific UI: move it to `opal/` or `figma/`.
