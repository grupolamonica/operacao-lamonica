---
phase: 1b
plan: "01"
subsystem: design-system
tags: [css-tokens, tailwind-v4, oklch, dark-mode, zustand, fouc]
dependency_graph:
  requires: []
  provides: [argon-color-tokens, dark-theme-vars, theme-store, fouc-prevention]
  affects: [all-components, all-pages]
tech_stack:
  added: []
  patterns: [css-custom-properties, oklch-color-space, zustand-store, tailwind-v4-theme-inline]
key_files:
  created:
    - torre-de-controle/src/stores/useThemeStore.ts
  modified:
    - torre-de-controle/src/index.css
    - torre-de-controle/index.html
decisions:
  - "Argon hex colors converted to oklch for shadcn compatibility (D-05)"
  - "All tokens in @theme inline — no tailwind.config.ts (D-04)"
  - "Single theme mechanism: .dark class on html, no applyTheme() (D-07)"
  - "Status tokens defined as paired bg+fg for contrast-safe dark mode (D-11)"
  - "Sidebar vars kept as Argon dark navy in both themes (always dark sidebar)"
metrics:
  duration: "~15min"
  completed: "2026-04-28T17:58:27Z"
  tasks_completed: 4
  files_modified: 3
---

# Phase 1B Plan 01: Design System — Argon Colors, Typography, Tokens Summary

Argon Dashboard color palette applied to `index.css` via oklch-converted CSS vars, full dark theme block, paired status tokens, typography/shadow tokens, FOUC prevention script, and Zustand theme store.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| T1.B.1 | Colors & CSS Variables | 9474253 | src/index.css |
| T1.B.2 | Typography & Spacing | 9474253 | src/index.css |
| T1.B.3 | Component Tokens (shadows) | 9474253 | src/index.css |
| T1.B.4 | FOUC Prevention + Theme Store | 627d2e8 | index.html, src/stores/useThemeStore.ts |

## What Was Built

### `src/index.css`
- `:root` overrides: shadcn vars replaced with Argon oklch equivalents (`--primary`, `--background`, `--foreground`, `--card`, `--muted-foreground`, `--border`, `--input`, `--ring`)
- New semantic tokens: `--success`, `--warning`, `--danger`, `--info`
- Status pairs: `--status-{name}`, `--status-{name}-bg`, `--status-{name}-fg` for all 4 statuses
- `.dark` block: full dark theme (navy bg `oklch(0.145 0.025 265.0)`, white text, dark borders, dark cards)
- `@theme inline`: all new tokens mapped as `--color-*` Tailwind utilities
- Typography: `--font-sans` (Segoe UI stack), `--text-display/heading/subheading/body/small/tiny`
- Shadows: `--shadow-sm/md/lg/xl` in oklch format

### `index.html`
- Inline anti-FOUC script reads `localStorage('theme')` and `prefers-color-scheme`, sets `html.dark` before React bundle loads

### `src/stores/useThemeStore.ts`
- Zustand store: `isDark` initialized from `document.documentElement.classList.contains('dark')`
- `toggleTheme()` toggles `.dark` class on `<html>` + syncs to `localStorage`
- No persist middleware (intentional — FOUC script handles SSR-equivalent init)

## Acceptance Criteria

- [x] `src/index.css` has Argon colors in oklch in `:root`
- [x] `.dark {}` block has full dark theme vars
- [x] `@theme inline` maps all new tokens
- [x] `src/stores/useThemeStore.ts` created
- [x] `index.html` has FOUC prevention script
- [x] `npm run build` passes

## Deviations from Plan

None — plan executed exactly as written.

T1.B.5 (Design System Documentation) is scoped to `.planning/` docs — deferred to after Wave 3 per plan note that it is documentation-only with no code dependency.

## Known Stubs

None. This plan is CSS tokens + store only — no UI rendering or data binding.

## Threat Flags

None. This plan introduces no network endpoints, auth paths, or trust boundary changes.

## Self-Check: PASSED

- `torre-de-controle/src/index.css` — present (modified)
- `torre-de-controle/src/stores/useThemeStore.ts` — present (created)
- `torre-de-controle/index.html` — present (modified)
- Commit `9474253` — exists
- Commit `627d2e8` — exists
- `npm run build` — passed (0 TypeScript errors, 0 CSS errors)
