# Phase 01b — UI Review

**Audited:** 2026-04-30
**Baseline:** Abstract 6-pillar standards + Argon Dashboard design language (no UI-SPEC.md)
**Screenshots:** Captured — desktop dashboard, torre de controle, motoristas, mobile dashboard (port 5173)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | CTAs are specific and Portuguese-localized; 3 toolbar buttons are stub-only (Ordenar/Filtros have no behavior) |
| 2. Visuals | 4/4 | Argon floating sidebar + gradient KPI icons + dark band — strong visual hierarchy, consistent with design north star |
| 3. Color | 3/4 | Token system excellent; one leaked `#ef4444` in sidebar badge and four non-token colors in KPICard/SLAGauge/MapPlaceholder |
| 4. Typography | 3/4 | Five Tailwind text sizes + 12 uses of arbitrary `text-[10px]` — minor scale fragmentation |
| 5. Spacing | 4/4 | Consistent Tailwind scale, `space-y-5` grid pattern repeated correctly, no arbitrary px/rem spacing |
| 6. Experience Design | 2/4 | Hooks return hardcoded `isLoading: false`; no skeleton/loading states rendered; no error boundary; notification bell missing aria-label |

**Overall: 19/24**

---

## Top 3 Priority Fixes

1. **No loading/skeleton states** — Users on slow connections (Phase 2 real API) will see empty tables with no feedback. When `isLoading` is true, render `<Skeleton>` rows in `DataTable` and `KPICard` shimmer placeholders. The `<Skeleton>` primitive is already installed via shadcn (`components/ui/skeleton.tsx`).

2. **Notification bell missing `aria-label`** — `Topbar.tsx:35-43` renders an icon-only `<button>` with no accessible name. Screen readers announce it as an unlabelled button. Fix: add `aria-label="Notificações"` to match the theme toggle button pattern on line 50.

3. **Sidebar alert badge uses hardcoded `#ef4444`** — `AppSidebar.tsx:173` uses `background: isActive ? 'rgba(255,255,255,0.25)' : '#ef4444'` for the Alertas nav badge. This is `--danger` in the design system but spelled out as raw hex. Replace with `'var(--danger)'` to keep it theme-aware (currently the active-state variant `rgba(255,255,255,0.25)` is already CSS-var-free so both branches should be consistent).

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

**Passing:**
- All page headers use descriptive Brazilian Portuguese: "Dashboard Operacional", "Fila priorizada de incidentes e operação ativa", etc.
- KPI card titles are domain-specific: "Entregas no prazo", "Motoristas em risco", "Atrasos críticos".
- Empty states are contextual: `emptyMessage="Nenhuma viagem em risco no momento."` (AtRiskTripsTable:72), `"Fila vazia."` (OperationalQueue:43), `"Nenhum alerta neste grupo."` (AlertGroupedList:53).
- CTAs are action-specific: "Assumir alerta", "Ligar para motorista", "Fechar painel" — no generic "Submit/OK/Cancel".

**Issues:**
- `ViagensTable.tsx:145-147` and `MotoristasTable.tsx:127-129`: "Ordenar", "Filtros", "Exportar" buttons are rendered but have no click handler beyond stopPropagation. They are discoverable UI elements that do nothing. Either connect behavior or mark as disabled with `disabled` prop + tooltip "Em breve".
- `DataTable.tsx:32` default `emptyMessage` is `'Nenhum resultado encontrado.'` — acceptable but generic. Tables that accept this default could benefit from caller-supplied contextual messages.
- Stub page phase labels like "Disponível em Phase 6" are developer-facing. If operators view these, a user-facing message like "Em desenvolvimento" would be more appropriate. Minor.

---

### Pillar 2: Visuals (4/4)

**Observed from screenshots and code:**
- Argon floating sidebar (white light / near-black dark) with gradient active state on nav items creates strong visual hierarchy. The 12px border-radius on the sidebar card matches Argon Dashboard exactly.
- Dark band (`linear-gradient(310deg, #0d2055 0%, #1a4fc4 100%)` light / near-black dark) at 280px height gives the premium Argon aesthetic visible in dashboard and torre screenshots.
- KPI cards use floating gradient icon boxes with `position: absolute; top: -1.25rem` — produces the signature Argon overlapping icon effect visible in all page screenshots.
- Color hierarchy is clear: white page headers on dark band → card content on `bg-card` → muted secondary data.
- Status badges (`StatusBadge`, `SeverityBadge`) use paired bg+fg tokens via inline style — visually distinct at a glance (green/orange/red/gray).
- Mobile screenshot reveals the fixed sidebar overlaps content at 375px (sidebar 250px wide + 12px margin = 262px, leaving only 113px for content). This is a known Phase 2 deferred item (responsive mobile). No score penalty as it is documented out-of-scope.
- `MoreVertical` action buttons in tables have `hover:bg-accent` feedback. Icon-only pattern is acceptable in table row context where the row itself is clickable.

---

### Pillar 3: Color (3/4)

**Token system (excellent):**
- `index.css` defines full oklch token set: `--primary`, `--background`, `--foreground`, `--card`, `--border`, paired status tokens, semantic tokens (success/warning/danger/info). All mapped in `@theme inline`.
- `.dark {}` block has complete overrides for all 22 semantic tokens.
- `StatusBadge` and `SeverityBadge` use `var(--status-*-bg)` / `var(--status-*-fg)` via inline style — correct pattern for alpha values unsupported in Tailwind v4.
- Primary token usage: 10 elements — well within the 10-unique-element guideline. Usage is appropriate (selected states, active links, progress indicators).

**Issues:**
- `AppSidebar.tsx:173`: `background: '#ef4444'` for the Alertas badge — should be `var(--danger)` (the token exists). Low impact since sidebar is always dark in both themes, but violates token discipline.
- `KPICard.tsx:7-23`: `colorMap` and `gradientMap` contain 6 hex palette entries (`#2dce89`, `#5e72e4`, `#fb6340`, etc.). These are Argon canonical palette colors passed to Chart.js/SparklineChart as hex strings — acceptable given the D-09 context decision (Chart.js cannot resolve CSS vars). However, `KPICard` itself uses these for inline gradient backgrounds on the icon box, which are not Chart.js contexts. These could be replaced with CSS var-based gradients using `var(--success)`, `var(--primary)`, etc.
- `SLAGauge.tsx:16`: `bgStroke = isDark ? '#3a3a52' : '#e3e3e3'` — SVG stroke colors reading `isDark` flag instead of CSS vars. `#e3e3e3` ≈ `var(--border)` and `#3a3a52` ≈ dark mode `--border`. Could reference CSS var via `getComputedStyle` for full token alignment. Documented as D-09 context (SVG cannot auto-resolve).
- `MapPlaceholder.tsx:16`: `background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)'` — intentional always-dark gradient for the map simulation. Documented allowlist. No fix needed.

**Hardcoded color count outside documented allowlist: 1** (`#ef4444` in sidebar badge).

---

### Pillar 4: Typography (3/4)

**Passing:**
- Font family: `"Open Sans"` loaded via Google Fonts + defined as `--font-sans`. Applied via `body { font-family: ... }`. Consistent with Argon Dashboard's Open Sans brand.
- Font size distribution (from grep):
  - `text-xs` — 122 uses (most common, table/badge/label data)
  - `text-sm` — 76 uses (body content, table cells)
  - `text-2xl` — 10 uses (KPI values, page titles)
  - `text-lg` — 4 uses (stub page headings)
  - `text-base` — 3 uses
  - Total: 5 distinct Tailwind sizes — within the 4-size guideline but marginally acceptable for a data-dense dashboard.
- Font weights: `font-medium` (34), `font-semibold` (25), `font-bold` (14) — 3 weights, appropriate for the density level.

**Issues:**
- `text-[10px]` arbitrary size used **12 times** across: `Topbar.tsx`, `AlertasFiltersBar.tsx`, `AlertasKPIRow.tsx`, `AlertDetailPanel.tsx`, `DriverDetailPanel.tsx`, `OperatorsQueue.tsx`, `TripDetailPanel.tsx`, `ViagensTable.tsx`. This is a 6th font size tier outside the declared scale. Recommendation: add `--text-micro: 0.625rem` to the `@theme inline` block and use a Tailwind utility class, or collapse into `text-xs` (0.75rem) for most label use cases.
- `AppSidebar.tsx:64,80`: `fontSize: '11px'` and `fontSize: '10px'` inline styles — same 6th-tier problem in inline style form. The sidebar logo area uses px values that bypass the typography scale.
- No declared `line-height` scale observed (index.css defines text sizes but not line-height pairs). Currently relying on Tailwind defaults, which is acceptable but not documented.

---

### Pillar 5: Spacing (4/4)

**Passing:**
- Dominant spacing pattern: `space-y-5` for page sections, `gap-5` for grid layouts, `gap-4` for table/panel splits, `gap-3` for inline toolbars, `gap-2` for inline element groups, `gap-1.5` for tight icon+text pairs.
- `p-4` for card interiors, `px-6 py-3` for topbar, `px-4 py-3` for table headers/cells — consistent across all pages.
- No arbitrary `[px]` or `[rem]` spacing values found in Tailwind classes.
- The `marginLeft: '274px'` in `AppLayout.tsx:25` is a hardcoded pixel offset matching the sidebar width (250px) + margin (12px left) + gap (12px) = 274px. Acceptable as a layout constant for the floating sidebar implementation, but fragile if sidebar width changes. Could be a CSS var (`--sidebar-width: 250px`).

**Observations:**
- `FixedPanel` and `TableWithSidePanel` use inline `style` for width constraints — appropriate for dynamic values.
- `overflow-x-auto` on toolbar wrapper in DataTable allows toolbar to scroll horizontally on smaller viewports — good defensive spacing.

---

### Pillar 6: Experience Design (2/4)

**Passing:**
- Empty states: all major data lists have contextual empty messages (DataTable default + per-table overrides, OperationalQueue "Fila vazia.", AlertGroupedList per-group).
- Disabled states on pagination: `DataTable.tsx:160,168` — `disabled={!table.getCanPreviousPage()}` correctly disables navigation buttons.
- Confirmation pattern: N/A for Phase 1b scope (no destructive actions implemented yet — actions are console.log stubs).
- Theme toggle: `aria-label="Alternar tema"` present on Topbar toggle button.
- Close button: `aria-label="Fechar painel"` present on SidePanelLayout.
- Keyboard interaction: shadcn primitives (Select, Button, Input) are keyboard-accessible by default.

**Issues:**

1. **No loading states rendered anywhere** — All hooks return `isLoading: false` hardcoded (Phase 2 stub contract). However, no component renders a loading skeleton even when `isLoading` is truthy. When Phase 2 wires real TanStack Query, `isLoading` will be `true` during fetches and the UI will show empty tables. The `<Skeleton>` component is installed. `DataTable`, `KPICard`, and `OperationalQueue` need loading branches.

2. **No error states rendered** — All hooks return `isError: false`. No component has an error fallback branch. When Phase 2 API calls fail, users will see empty states with no explanation. `DataTable` should accept an `isError` prop and render an error message row.

3. **No top-level ErrorBoundary** — `App.tsx` or `router.tsx` has no `ErrorBoundary` wrapper. A render crash in any component will produce a blank white screen with no recovery path.

4. **Notification bell missing `aria-label`** — `Topbar.tsx:35`: `<button className="relative p-2 ...">`  renders `<Bell className="h-4 w-4" />` with no accessible name. The `aria-label="Notificações"` pattern used on the adjacent theme toggle button should be applied here.

5. **"Ordenar", "Filtros", "Exportar" buttons are non-functional** — Present in ViagensTable toolbar and MotoristasTable toolbar. They render without `disabled` prop and have no click handlers. Users will click them and nothing will happen — a confusing interaction. Should be `disabled` with a tooltip or omitted until Phase 2+.

---

## Registry Audit

Registry audit: shadcn initialized, `components.json` registry is `"default"` (official shadcn only). No third-party registries found. Audit skipped.

---

## Files Audited

**Layout:**
- `torre-de-controle/src/index.css`
- `torre-de-controle/src/app/layout/AppLayout.tsx`
- `torre-de-controle/src/app/layout/AppSidebar.tsx`
- `torre-de-controle/src/app/layout/Topbar.tsx`

**Domain Components:**
- `torre-de-controle/src/components/domain/DataTable.tsx`
- `torre-de-controle/src/components/domain/KPICard.tsx`
- `torre-de-controle/src/components/domain/StatusBadge.tsx`
- `torre-de-controle/src/components/domain/SeverityBadge.tsx`
- `torre-de-controle/src/components/domain/AlertItem.tsx`
- `torre-de-controle/src/components/domain/SidePanelLayout.tsx`
- `torre-de-controle/src/components/domain/TableWithSidePanel.tsx`

**Pages:**
- `torre-de-controle/src/app/pages/dashboard/DashboardPage.tsx`
- `torre-de-controle/src/app/pages/torre-de-controle/TorreDeControlePage.tsx`
- `torre-de-controle/src/app/pages/motoristas/MotoristasPage.tsx`
- `torre-de-controle/src/app/pages/motoristas/components/MotoristasTable.tsx`
- `torre-de-controle/src/app/pages/viagens/components/ViagensTable.tsx`
- `torre-de-controle/src/app/pages/torre-de-controle/components/AtRiskTripsTable.tsx`
- `torre-de-controle/src/app/pages/torre-de-controle/components/OperationalQueue.tsx`
- `torre-de-controle/src/app/pages/torre-de-controle/components/OperatorsQueue.tsx`
- `torre-de-controle/src/app/pages/configuracoes/ConfiguracoesPage.tsx`
- `torre-de-controle/src/app/pages/geofences/GeofencesPage.tsx`
- `torre-de-controle/src/app/pages/insights/InsightsPage.tsx`

**Screenshots captured:** `.planning/ui-reviews/01b-20260430-154948/`
- `desktop-dashboard.png` (1440x900)
- `desktop-torre.png` (1440x900)
- `desktop-motoristas.png` (1440x900)
- `mobile-dashboard.png` (375x812)
