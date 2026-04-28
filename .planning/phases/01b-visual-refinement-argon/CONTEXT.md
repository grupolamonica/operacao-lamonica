---
phase: 1b
title: Visual Refinement & Argon Design System
objective: Refactor Torre de Controle UI to match Argon Dashboard visual quality with dark/light theme support
status: planning
created: 2026-04-28
---

## Problem

Phase 1 delivered functional UI with basic styling. User wants to elevate visual quality to match Argon Dashboard standard with:
- Professional color palette (Argon colors: blues, greens, oranges, reds)
- Consistent typography and spacing (Argon system)
- Dark/light theme toggle (no current theme switching)
- Component polish (shadows, borders, hover states)

## Scope

### In Scope
- Design system definition (colors, typography, spacing, shadows)
- Component refactor (12 domain + 5 layout components)
- Page integration (all 6 main pages)
- Dark/light theme support (Zustand store + CSS vars)
- Visual refinement pass (shadows, borders, spacing)
- UAT screenshots for visual verification

### Out of Scope
- Animation/micro-interactions (Phase 4+)
- New components (Phase 2+)
- Accessibility audit (separate effort)
- Responsive design refinement (Phase 2+)

## Approach

**3 waves of execution:**

1. **Wave 1: Design System (2–3 hours)**
   - Define Argon colors + CSS variables (light & dark)
   - Define typography + spacing system
   - Create theme store + toggle system
   - Document design system for developers

2. **Wave 2: Component Refactor (6–8 hours)**
   - Refactor 8 domain components (KPICard, StatusBadge, etc.)
   - Refactor 5 layout components (AppSidebar, Topbar, etc.)
   - Apply design tokens
   - Test dark/light theme in each component

3. **Wave 3: Page Integration (4–6 hours)**
   - Integrate refactored components into 6 pages
   - Visual consistency pass (shadows, spacing, colors)
   - Theme toggle testing
   - Generate UAT screenshots

**Total estimate:** 12–17 hours

## Design System Overview

### Colors (Argon-aligned)
- **Primary:** `#0f62fe` (blue)
- **Success:** `#2dce89` (green)
- **Warning:** `#fb6340` (orange)
- **Danger:** `#f5365c` (red)
- **Info:** `#11cdef` (cyan)
- **Background (light):** `#f7fafc` (light), `#ffffff` (white)
- **Background (dark):** `#1a1a2e` (navy), `#262641` (card)
- **Text (light):** `#32325d` (dark), `#95959e` (muted)
- **Text (dark):** `#ffffff` (white), `#b0b0c3` (muted)

### Typography
- **Font:** Segoe UI, system fonts
- **Sizes:** 2.5rem (h1), 2rem (h2), 1.5rem (h3), 1rem (body), 0.875rem (small), 0.75rem (tiny)
- **Weights:** 400 (regular), 500 (medium), 600 (semibold), 700 (bold)

### Spacing
- Base: 8px
- Scale: xs (4px), sm (8px), md (16px), lg (24px), xl (32px), 2xl (48px), 3xl (64px)

### Shadows
- sm: `0 1px 3px rgba(0,0,0,0.08)`
- md: `0 4px 6px rgba(0,0,0,0.1)`
- lg: `0 10px 25px rgba(0,0,0,0.15)`
- xl: `0 20px 40px rgba(0,0,0,0.2)`

### Components
- **Buttons:** 3 sizes (sm/md/lg), 5 variants (primary/secondary/danger/success/info)
- **Inputs:** single style, 40px height, themed borders
- **Cards:** shadow-md, border-border, bg-card
- **Tables:** striped rows, hover highlight, themed headers
- **Badges:** pill-shaped, status colored, soft backgrounds

## Dependencies

- **Phase 1 outcome:** Phase 1B uses all Phase 1 functionality (no breaking changes)
- **Phase 2 start:** Phase 2 (Backend) independent; can run in parallel if needed

## Success Criteria

✅ Design system fully defined and documented
✅ All components refactored with Argon tokens
✅ Dark/light theme toggle working across all pages
✅ Visual consistency pass complete (no mixed styles)
✅ Light theme readable and professional
✅ Dark theme readable and professional
✅ UAT screenshots ready (light & dark for all pages)
✅ No functional regressions from Phase 1

## Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Color choices don't match user's Argon reference | High | Verify with user during Wave 1; adjust if needed |
| Component refactor introduces bugs | Medium | Test in browser; Phase 1 smoke tests still pass |
| Theme toggle flickers or doesn't persist | Medium | Use localStorage + CSS root vars; test thoroughly |
| Spacing changes break page layouts | Medium | Test responsive design; CSS Grid/Flex layouts stable |

## Timeline

- **Wave 1:** 2–3 hours (Mon)
- **Wave 2:** 6–8 hours (Tue–Wed)
- **Wave 3:** 4–6 hours (Thu)
- **UAT:** User verifies light/dark themes in all pages
- **Phase 1 UAT:** Resumes after Phase 1B visual pass

