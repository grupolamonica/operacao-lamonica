---
phase: 1b
title: Components — Refactor to Argon Design + Dark/Light Support
goal: Redesign all domain and layout components for Argon visual quality with theme support
status: planning
wave: 2
task_count: 8
---

## Overview

Refactor 12 domain components + 5 layout components to use Argon design tokens and support dark/light theme. Maintain 100% functional compatibility.

---

## Tasks

### T2.B.0 — Pre-Execution: Hardcoded Color Inventory

> ⚠️ Review fix: Codex identified 152+ hardcoded color references across src/. Before refactoring, run:
>
> ```bash
> grep -rn 'bg-\[#\|text-\[#\|border-\[#\|bg-white\|bg-gray-\|text-gray-\|border-gray-\|bg-\[#f\|bg-\[#1\|bg-\[#0' torre-de-controle/src --include="*.tsx" > /tmp/hardcoded-colors.txt
> wc -l /tmp/hardcoded-colors.txt
> ```
>
> Review `/tmp/hardcoded-colors.txt` — every occurrence must be mapped to a CSS token before the wave ends.
> Add any files NOT covered by T2.B.1–T2.B.8 to a supplementary fix list.

**Acceptance:**
- [ ] Inventory complete (count known)
- [ ] Every hardcoded color has a corresponding token replacement planned

---

### T2.B.1 — Layout Components (AppSidebar, AppLayout, Topbar)

**Files:** `src/app/layout/AppSidebar.tsx`, `AppLayout.tsx`, `Topbar.tsx`

**AppSidebar:**
- Replace `bg-[#1a1a2e]` with Tailwind class `bg-sidebar` (from theme tokens)
- Active nav item: `bg-primary` (#0f62fe)
- Inactive: `text-muted-foreground`
- Hover state: background opacity increase
- Icons: use Lucide with proper sizing

**AppLayout:**
- Main area: `bg-background` (light theme: #f7fafc, dark: #1a1a2e)
- Sidebar container: fixed width 280px (Argon standard)
- Main content: padding consistent (md/lg)

**Topbar:**
- Background: white (light theme) / dark (dark theme)
- Border bottom: subtle (light border in light, dark border in dark)
- Theme toggle button: sun/moon icon, positioned top-right
- Breadcrumb/title: typography matching Argon

**Acceptance:**
- [ ] Sidebar renders with Argon navy in light theme
- [ ] Sidebar respects dark theme (darker navy)
- [ ] Active nav item blue in both themes
- [ ] Topbar has theme toggle working
- [ ] No visual regressions (alignment, spacing)

---

### T2.B.2 — KPI Card Component

**File:** `src/components/domain/KPICard.tsx`

**Current issues:**
- Color hardcoded, no theme support
- Shadow minimal, needs Argon depth

**Refactor:**
- Background: `bg-card` (white light, dark gray dark)
- Border: `border-1 border-border` (subtle)
- Shadow: `shadow-md` (Argon style from design system)
- Title: `text-sm font-medium text-muted-foreground`
- Value: `text-2xl font-bold text-foreground`
- Icon: color from status/context (success/warning/danger)
- Hover: slight lift (`shadow-lg`, scale subtle)

**Acceptance:**
- [ ] Card renders with proper shadow in both themes
- [ ] Background color switches with theme
- [ ] Text hierarchy visible
- [ ] No visual glitches

---

### T2.B.3 — Badge Components (StatusBadge, SeverityBadge)

**Files:** `src/components/domain/StatusBadge.tsx`, `SeverityBadge.tsx`

**StatusBadge:**
- Use Argon status colors from theme tokens
- "No prazo": green (#2dce89)
- "Em risco": orange (#fb6340)
- "Atrasado": red (#f5365c)
- "Sem sinal": gray (#95959e)
- Style: rounded pill, text color auto (dark text on light bg, light text on dark)
- Background: 10% opacity of status color (softer in light theme)

**SeverityBadge:**
- Crítico: red
- Médio: orange
- Baixo: gray
- Same pattern as StatusBadge

**Acceptance:**
- [ ] All status colors render correctly
- [ ] Text contrast passes WCAG AA
- [ ] Badges theme-aware (light/dark)

---

### T2.B.4 — Table Components (DataTable, OperationalQueue)

**Files:** `src/components/domain/DataTable.tsx`, `OperationalQueue.tsx`

**DataTable:**
- Header background: `bg-secondary` (light gray light, slightly darker dark)
- Header text: `text-sm font-semibold text-foreground`
- Row borders: `border-b border-border`
- Row hover: `bg-accent` (highlight on hover)
- Striped rows (optional): alternating subtle background
- Padding: `px-4 py-3` (md from spacing system)

**OperationalQueue:**
- Card style with shadow
- Item background: `bg-card`
- Item border left: `4px solid` with status color (visual indicator)
- Item padding: `p-4`
- Actions: buttons with Argon primary color

**Acceptance:**
- [ ] Tables render with proper header styling
- [ ] Rows are scannable (good contrast, spacing)
- [ ] Hover states visible
- [ ] Queue items theme-aware

---

### T2.B.5 — Button & Input Components

**Files:** `src/components/ui/button.tsx`, `input.tsx` (shadcn overrides or new Argon variants)

**Buttons:**
- Primary: `bg-primary` (#0f62fe) with white text, `shadow-md`
- Secondary: `bg-secondary` with gray text
- Danger: `bg-danger` (#f5365c)
- Success: `bg-success` (#2dce89)
- Sizes: sm (32px), md (40px), lg (48px)
- Border radius: `rounded-md` (8px from design system)
- Transitions: `transition-all duration-base` (smooth)
- Disabled: opacity 50%, cursor not-allowed

**Inputs:**
- Border: `border-border`
- Background: `bg-background`
- Placeholder: `text-muted-foreground`
- Focus: `border-primary ring-primary`
- Padding: `px-3 py-2` (md spacing)
- Height: 40px (Argon standard)

**Acceptance:**
- [ ] Buttons render with proper shadows
- [ ] Focus states visible (accessibility)
- [ ] Inputs are readable in both themes
- [ ] States (hover, active, disabled) clear

---

### T2.B.6 — Card & Panel Components (SidePanelLayout, TableWithSidePanel)

**Files:** `src/components/domain/SidePanelLayout.tsx`, `TableWithSidePanel.tsx`, `TripDetailPanel.tsx`, `DriverDetailPanel.tsx`, `AlertDetailPanel.tsx`

**SidePanelLayout:**
- Panel background: `bg-card`
- Panel border: `border-l border-border`
- Panel shadow: `shadow-lg` (comes from left)
- Header: `border-b border-border`, padding `p-4`
- Content: padding `p-4`, overflow scrollable

**DetailPanels:**
- Section headers: `text-sm font-semibold text-muted-foreground`
- Section content: `mt-3 space-y-2`
- Metric rows: flex, space-between, text colors themed
- Action buttons: at bottom, `sticky`, shadow above

**Acceptance:**
- [ ] Panels have depth (shadow visible)
- [ ] Content is scannable (section hierarchy)
- [ ] Buttons sticky at bottom (accessibility)
- [ ] Panel borders visible in both themes

---

### T2.B.7 — Chart & Visualization Components

**Files:** `src/components/domain/SparklineChart.tsx`, `SLAGauge.tsx`, `ProgressBar.tsx`

**SparklineChart:**
> ⚠️ Review fix: Chart.js does NOT read CSS vars — colors must be set explicitly in JS.
- Read `isDark` from `useThemeStore`
- Light theme: line `#0f62fe`, fill gradient `rgba(15,98,254,0.15)`
- Dark theme: line `#4d94ff`, fill gradient `rgba(77,148,255,0.15)`
- Background: transparent (no box)
- Border: none (clean)
- Re-render chart when `isDark` changes (update dataset colors + call chart.update())

**SLAGauge (SVG circular):**
> ⚠️ Review fix: SVG inline colors don't follow CSS vars — use JavaScript to set stroke values.
- Background circle stroke: `#e3e3e3` (light) / `#3a3a52` (dark) — read from `isDark`
- Fill circle: status color constant (same in both themes — #2dce89/#fb6340/#f5365c)
- Text: centered, bold, status colored

**ProgressBar:**
- Background: `bg-secondary`
- Fill: status color (or primary if generic)
- Height: 8px (slender, Argon style)
- Border radius: `rounded-full`

**Acceptance:**
- [ ] Charts render with proper colors
- [ ] Gauges are clear (labels visible)
- [ ] Progress bars smooth
- [ ] Legends/labels visible

---

### T2.B.8 — Alert & List Components (AlertItem, AlertGroupedList, Timeline)

**Files:** `src/components/domain/AlertItem.tsx`, `AlertGroupedList.tsx`, `TripTimeline.tsx`

**AlertItem:**
- Background: `bg-card`
- Border left: 4px status color (critical/medium/low)
- Padding: `p-3`
- Title: `font-semibold`, status color
- Description: `text-sm text-muted-foreground`
- Timestamp: `text-xs text-muted-foreground`
- Hover: `bg-accent`

**AlertGroupedList:**
- Group header: `font-semibold text-primary`, uppercase small
- Divider: `border-t border-border` between groups
- Spacing: `space-y-2` within group

**TripTimeline:**
- Vertical line: `border-l-2 border-border`
- Event dots: `4px radius`, colored by event type
- Event text: `text-sm`, timestamp in muted
- Event box: subtle background `bg-secondary` on hover

**Acceptance:**
- [ ] Groups are visually separated
- [ ] Timeline is readable (good contrast, alignment)
- [ ] Items highlight on hover
- [ ] Colors indicate status/severity

---

## Wave Dependencies

⬆️ Depends on: T1.B.1 (Design System tokens) + T1.B.4 (Theme store)

Blocks: T3.B.1 (Page integration)

---

## Success Criteria

1. All 12 domain + 5 layout components redesigned with Argon tokens
2. Dark/light theme support in all components
3. Visual hierarchy (typography, spacing, shadows) matches Argon
4. No functional regressions (same data, same interactions)
5. Accessibility maintained (contrast, focus states)

---

## Estimate

**Effort:** 6–8 hours (refactor + testing + refinement)

