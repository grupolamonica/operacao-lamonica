---
phase: 1b
title: Page Integration — Apply Refined Components to All Pages
goal: Update all 6 main pages to use refactored Argon components, verify visual consistency
status: planning
wave: 3
task_count: 6
---

## Overview

Integrate refactored components into all page layouts. Verify visual consistency, spacing, alignment, and theme behavior across entire UI.

---

## Tasks

### T3.B.1 — Dashboard Page Integration

**File:** `src/app/pages/dashboard/DashboardPage.tsx`

**Changes:**
- KPI row: use refactored `KPICard` (shadow, theme colors)
- Map placeholder: styled `bg-secondary` with subtle border/shadow
- Trips table: refactored `DataTable` with Argon styling
- Alerts panel: themed background, badges with status colors
- Spacing: verify consistent padding/margins (md/lg scale)

**Verify:**
- [ ] KPI cards render with proper shadows
- [ ] Table header is distinct from rows
- [ ] Responsive layout (sidebar collapse doesn't break)
- [ ] Theme toggle works (light ↔ dark)

---

### T3.B.2 — Torre de Controle Page Integration

**File:** `src/app/pages/torre-de-controle/TorreDeControlePage.tsx`

**Changes:**
- KPI row: refactored cards
- Operational queue: use new `OperationalQueue` styling with border-left indicators
- At-risk trips: themed `DataTable`
- Operators queue: themed card list
- Actions: primary buttons with proper styling

**Verify:**
- [ ] Queue items have visual severity indicator (left border color)
- [ ] Buttons are clickable and themed
- [ ] Layout aligns with dashboard

---

### T3.B.3 — Viagens Page Integration

**File:** `src/app/pages/viagens/ViagensPage.tsx`

**Changes:**
- Tabs: refactored with Argon tab styling (underline or pill)
- Filters panel: themed form inputs, buttons
- Table: refactored `DataTable` with status badges
- Side panel: refactored `TripDetailPanel` with shadow, borders
- Timeline: events with colored dots, readable typography

**Verify:**
- [ ] Active tab is visually distinct
- [ ] Filters panel responsive (stacks on mobile)
- [ ] Side panel opens/closes smoothly
- [ ] Timeline events are readable

---

### T3.B.4 — Motoristas Page Integration

**File:** `src/app/pages/motoristas/MotoristasPage.tsx`

**Changes:**
- Table: refactored `DataTable` with avatars
- Side panel: refactored `DriverDetailPanel`
- Conformidade section: themed list, status indicators
- Action buttons: Ligar/Mensagem/E-mail with proper styling
- Driver score: visual indicator (gauge or progress bar)

**Verify:**
- [ ] Driver avatars render correctly
- [ ] Conformidade items are scannable
- [ ] Action buttons are accessible

---

### T3.B.5 — Alertas Page Integration

**File:** `src/app/pages/alertas/AlertasPage.tsx`

**Changes:**
- Alert groups: collapsible headers with proper styling
- Alert items: border-left color coding, themed backgrounds
- Alert detail panel: 5 action buttons with proper styling
- SLA gauge: colored arc matching severity
- Filters: themed form controls

**Verify:**
- [ ] Groups collapse/expand smoothly
- [ ] Alert colors distinct (critical/medium/low)
- [ ] Action buttons are primary/secondary properly
- [ ] SLA gauge is readable

---

### T3.B.6 — Stub Pages (Geofences, Insights, Configurações)

**Files:** `src/app/pages/geofences/GeofencesPage.tsx`, `src/app/pages/insights/InsightsPage.tsx`, `src/app/pages/configuracoes/ConfiguracoesPage.tsx`

> ⚠️ Review fix: All 8 routes must be themed. Stubs have hardcoded colors that break dark theme.

For each stub page:
- Replace hardcoded `bg-white` / `text-gray-*` with `bg-background`, `text-foreground`, `text-muted-foreground`
- Wrap stub content in a themed `<Card>` component with `border-border`
- Ensure heading typography uses design system tokens

**Verify:**
- [ ] Stubs render correctly in both themes

---

### T3.B.7 — Visual Consistency & Refinement Pass

**All 8 pages + layout:**

- [ ] Run final grep: `grep -rn 'bg-\[#\|text-\[#\|bg-white\|bg-gray-\|text-gray-\|border-gray-' src/ --include="*.tsx"` — verify zero matches outside allowlist
- [ ] Allowlist exceptions: `bg-[#1a1a2e]` only if purposeful override, document inline
- [ ] Verify all shadows consistent
- [ ] Verify border colors use `border-border` token
- [ ] Verify text colors respect theme (foreground/muted-foreground)
- [ ] Verify button sizes consistent
- [ ] Verify spacing uses scale (no arbitrary values)
- [ ] Verify hover states on all interactive elements
- [ ] Verify focus states (keyboard nav accessible)
- [ ] Run `npm run build` — must succeed with zero TypeScript errors
- [ ] Run `npm run lint` — zero ESLint errors
- [ ] Test light theme: white backgrounds, dark text, proper contrast
- [ ] Test dark theme: navy backgrounds, light text, proper contrast
- [ ] Test theme toggle: ALL 8 pages update immediately (no reload needed)
- [ ] Test theme persistence: reload page → theme stays
- [ ] Test first visit (no localStorage): respects `prefers-color-scheme`
- [ ] Screenshot all 8 pages × 2 themes = 16 screenshots (UAT reference)

**Acceptance:**
- [ ] All pages pass visual consistency check
- [ ] Theme toggle works across all pages
- [ ] No regressions from Phase 1 (all data, interactions work)
- [ ] Visual quality matches Argon (professional, cohesive)

---

## Wave Dependencies

⬆️ Depends on: T2.B.1–T2.B.8 (Refactored components)

No further blocks.

---

## Success Criteria

1. All 8 routes integrated with Argon components
2. Visual consistency across all pages (shadows, borders, spacing, colors)
3. Light theme clean and readable
4. Dark theme clean and readable
5. Theme toggle works without page reload
6. No functional regressions
7. Screenshots ready for UAT verification

---

## Estimate

**Effort:** 4–6 hours (integration + refinement + testing)

