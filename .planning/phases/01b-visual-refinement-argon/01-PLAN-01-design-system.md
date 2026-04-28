---
phase: 1b
title: Design System — Argon Colors, Typography, Tokens
goal: Define Argon-aligned color palette, typography, spacing, and CSS variables for dark/light theme support
status: planning
wave: 1
task_count: 5
---

## Overview

Establish a complete design system matching Argon Dashboard quality with dual-theme support. All future Phase 1B tasks depend on these tokens.

---

## Tasks

### T1.B.1 — Colors & CSS Variables (Light + Dark Theme)

**File:** `src/index.css` (ALL tokens go here — NO tailwind.config.ts)

> ⚠️ Review fix: project uses Tailwind v4 with `@tailwindcss/vite`. There is no `tailwind.config.ts`. All tokens defined via `@theme inline` block in `src/index.css` only.

Create CSS custom properties for:

**Argon hex → oklch conversion (required for shadcn compat):**
| Argon Hex | oklch equivalent | Purpose |
|-----------|------------------|---------|
| #0f62fe | oklch(0.485 0.224 258.6) | Primary blue |
| #2dce89 | oklch(0.745 0.168 160.0) | Success green |
| #fb6340 | oklch(0.705 0.195 38.0) | Warning orange |
| #f5365c | oklch(0.605 0.235 12.0) | Danger red |
| #11cdef | oklch(0.810 0.145 205.0) | Info cyan |
| #f7fafc | oklch(0.982 0.004 210.0) | Background light |
| #32325d | oklch(0.265 0.065 265.0) | Text dark |
| #95959e | oklch(0.620 0.010 265.0) | Text muted |

**Light Theme (`:root` in `index.css`):**
Override shadcn vars with Argon equivalents (oklch format):
- `--primary` → Argon blue oklch
- `--background` → #f7fafc oklch
- `--card` → #ffffff oklch
- `--foreground` → #32325d oklch
- `--muted-foreground` → #95959e oklch
- `--border` → #e3e3e3 oklch
- `--success` (new) → #2dce89 oklch
- `--warning` (new) → #fb6340 oklch
- `--danger` (new) → #f5365c oklch
- `--info` (new) → #11cdef oklch

**Dark Theme (`.dark` in `index.css`):**
- `--primary` → same Argon blue
- `--background` → #1a1a2e (existing dark navy)
- `--card` → #262641
- `--foreground` → #ffffff oklch
- `--muted-foreground` → #b0b0c3 oklch
- `--border` → #3a3a52 oklch

**Status Colors (both themes, in `@theme inline` as Tailwind tokens):**
- `--status-no-prazo: oklch(0.745 0.168 160.0)` (green)
- `--status-em-risco: oklch(0.705 0.195 38.0)` (orange)
- `--status-atrasado: oklch(0.605 0.235 12.0)` (red)
- `--status-sem-sinal: oklch(0.620 0.010 265.0)` (gray)

Define all tokens in `@theme inline` block in `index.css`; shadcn vars in `:root` / `.dark` selectors.

**No `src/config/theme.ts` needed** — CSS vars + class toggle handles theming.
```typescript
export const lightTheme = { /* all light vars */ }
export const darkTheme = { /* all dark vars */ }
export const applyTheme = (isDark: boolean) => { /* apply to :root */ }
```

**Acceptance:** 
- [ ] All color variables defined in CSS + exported from theme.ts
- [ ] Light theme renders correctly (white backgrounds, dark text)
- [ ] Dark theme renders correctly (navy backgrounds, light text)
- [ ] Status colors consistent across themes

---

### T1.B.2 — Typography & Spacing System

**File:** `src/index.css`, `tailwind.config.ts`

Define in Tailwind `@theme`:

**Font stack:** `"Segoe UI", -apple-system, sans-serif` (Argon default, replace current)

**Font sizes (px → rem):**
- Display (h1): 2.5rem (40px)
- Heading (h2): 2rem (32px)
- Heading (h3): 1.5rem (24px)
- Body (p): 1rem (16px)
- Small: 0.875rem (14px)
- Tiny: 0.75rem (12px)

**Font weights:**
- Regular: 400
- Medium: 500
- Semibold: 600
- Bold: 700

**Line heights:**
- Headings: 1.2
- Body: 1.5
- Compact: 1.3

**Spacing scale (8px base):**
- xs: 4px
- sm: 8px
- md: 16px
- lg: 24px
- xl: 32px
- 2xl: 48px
- 3xl: 64px

Add these values to `src/index.css` under `@theme inline` block (no tailwind.config.ts in this project).

**Acceptance:**
- [ ] Typography renders consistently across all pages
- [ ] Spacing matches Argon (card gaps, section margins, padding)
- [ ] Line heights are readable (headings compact, body relaxed)

---

### T1.B.3 — Component Design Tokens

**File:** `src/config/components.ts` (new)

Define shadow, radius, transition tokens matching Argon:

```typescript
export const shadows = {
  sm: '0 1px 3px rgba(0,0,0,0.08)',
  md: '0 4px 6px rgba(0,0,0,0.1)',
  lg: '0 10px 25px rgba(0,0,0,0.15)',
  xl: '0 20px 40px rgba(0,0,0,0.2)',
}

export const borderRadius = {
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
}

export const transitions = {
  fast: '150ms ease-in-out',
  base: '300ms ease-in-out',
  slow: '500ms ease-in-out',
}
```

Add to `index.css` as `@theme` block.

**Acceptance:**
- [ ] Shadows applied to cards, dropdowns, popovers (visual depth)
- [ ] Border radius consistent (buttons, inputs, cards, alerts)
- [ ] Transitions smooth on hover/active states

---

### T1.B.4 — Dark/Light Theme Toggle System

**Files:** `src/stores/useThemeStore.ts` (new), `src/app/layout/AppLayout.tsx`, `index.html`

> ⚠️ Review fix: FOUC prevention required — theme must be set BEFORE React renders.

**Step 1 — Anti-FOUC script in `index.html`** (before any `<script>` tag):
```html
<script>
  const saved = localStorage.getItem('theme')
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  if (saved === 'dark' || (!saved && prefersDark)) {
    document.documentElement.classList.add('dark')
  }
</script>
```

**Step 2 — Zustand store** `src/stores/useThemeStore.ts`:
```typescript
interface ThemeStore {
  isDark: boolean
  toggleTheme: () => void
}

export const useThemeStore = create<ThemeStore>((set) => ({
  isDark: document.documentElement.classList.contains('dark'),
  toggleTheme: () => set((s) => {
    const next = !s.isDark
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
    return { isDark: next }
  }),
}))
```

Note: No `applyTheme()` function. Single mechanism: toggle `.dark` class on `<html>`. CSS vars + `@custom-variant dark` handle the rest.

**Step 3 — Theme toggle button in `Topbar.tsx`** (not AppLayout):
- Sun icon when dark, Moon icon when light
- Click → `useThemeStore.toggleTheme()`

**Acceptance:**
- [ ] No flash of unstyled theme on page reload
- [ ] Theme toggle appears in topbar (sun/moon icon)
- [ ] Click toggles light ↔ dark
- [ ] Theme persists on page reload (localStorage)
- [ ] `prefers-color-scheme` respected for first visit
- [ ] All components respect active theme

---

### T1.B.5 — Design System Documentation

**File:** `.planning/phases/01b-visual-refinement-argon/DESIGN-SYSTEM.md`

Document for developers:
- Color palette (purpose of each color)
- Typography guide (when to use h1 vs h2, etc.)
- Spacing rules (card padding, section gaps)
- Component patterns (button sizes, card layouts)
- Theme usage examples

**Acceptance:**
- [ ] Document complete and clear
- [ ] Examples show light/dark variants
- [ ] New contributors can implement components consistently

---

## Wave Dependencies

✅ No upstream dependencies. This is Wave 1 foundation.

Blocks: T2.B.1 (component refactor depends on these tokens).

---

## Success Criteria

1. All Argon colors + Tailwind theme values defined and accessible
2. Light theme renders with white/light backgrounds, dark text
3. Dark theme renders with navy/dark backgrounds, light text
4. Theme toggle works and persists
5. Typography is consistent across all pages
6. Spacing/shadows match Argon design quality

---

## Estimate

**Effort:** 2–3 hours (token definition + store setup + documentation)

