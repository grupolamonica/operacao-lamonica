# Phase 1B: Visual Refinement & Argon Design System — Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Refactor the Torre de Controle frontend UI to match Argon Dashboard visual quality. The phase adds dark/light theme support and elevates the design system. Scope is **visual only** — no new routes, no new data, no API integration. Phase 1 functionality is preserved 100%.

**What this phase delivers:**
- Argon-aligned color palette (oklch-converted) applied via CSS vars
- Dark/light theme toggle with FOUC prevention
- All 12 domain + 5 layout components refactored with Argon design tokens
- All 8 routes themed consistently (including Geofences/Insights/Configurações stubs)
- shadcn primitives extended (not replaced) where needed
- Visual consistency pass + UAT screenshots for all pages × 2 themes

**What this phase does NOT deliver:**
- New page functionality (Phase 2+)
- API integration (Phase 2)
- Animations/micro-interactions (Phase 4+)
- Full accessibility audit (separate effort)
- Responsive mobile refinement (Phase 2+)

</domain>

<decisions>
## Implementation Decisions

### D-01: Design Scope
User confirmed: **all visual aspects** — colors, typography, spacing, shadows, icons. Not just CSS tweaks.

### D-02: Theme Support
Both **dark AND light theme** with toggle. Not one-or-the-other. Toggle visible in topbar.

### D-03: Refactor Depth
**Visual + components** refactor. Not just CSS changes — component structure updated where needed to support theming.

### D-04: Color System — No tailwind.config.ts
Project uses Tailwind v4 with `@tailwindcss/vite`. There is **no** `tailwind.config.ts` and one should NOT be created. All tokens go in `src/index.css` via `@theme inline` block. Confirmed by Codex code scan.

### D-05: Color Space — Argon Hex → oklch Conversion Required
shadcn/ui components reference CSS vars in `oklch()` format (confirmed in current `index.css`). Argon design colors are hex. Before writing CSS vars, convert all Argon hex to oklch:

| Argon Hex | oklch | Purpose |
|-----------|-------|---------|
| #0f62fe | oklch(0.485 0.224 258.6) | Primary blue |
| #2dce89 | oklch(0.745 0.168 160.0) | Success green |
| #fb6340 | oklch(0.705 0.195 38.0) | Warning orange |
| #f5365c | oklch(0.605 0.235 12.0) | Danger red |
| #11cdef | oklch(0.810 0.145 205.0) | Info cyan |
| #f7fafc | oklch(0.982 0.004 210.0) | Background light |
| #32325d | oklch(0.265 0.065 265.0) | Text dark |
| #95959e | oklch(0.620 0.010 265.0) | Text muted |

Override `--primary`, `--background`, `--foreground` etc. in `:root` with oklch values.

### D-06: FOUC Prevention — Anti-Flash Script Required
Theme must be set **before React renders** to prevent white flash on dark-mode reload. Add inline script to `index.html` before `<script>` tags:

```html
<script>
  const saved = localStorage.getItem('theme')
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  if (saved === 'dark' || (!saved && prefersDark)) {
    document.documentElement.classList.add('dark')
  }
</script>
```

Also: add `color-scheme` meta/CSS to align scrollbars and system UI with active theme.

### D-07: Theme Mechanism — Single Source of Truth
One mechanism only: `.dark` class toggled on `<html>` element. No `applyTheme()` function. No `theme.ts` config file duplicating the palette. The `@custom-variant dark (&:is(.dark *))` already in `index.css` handles the cascade.

**useThemeStore design:**
```typescript
isDark: document.documentElement.classList.contains('dark')  // init from DOM (not localStorage)
toggleTheme: () => toggle .dark class on html + update localStorage
```

### D-08: Hardcoded Color Inventory — Pre-Execution Required
Codex scan found **152+ hardcoded color references** across `src/`. Before refactoring any component, executor must run:
```bash
grep -rn 'bg-\[#\|text-\[#\|border-\[#\|bg-white\|bg-gray-\|text-gray-\|border-gray-' src/ --include="*.tsx"
```
Every occurrence must be mapped to a CSS token before the wave closes.

### D-09: Chart.js / SVG — No CSS Var Auto-Resolution
Chart.js does NOT read CSS vars. SparklineChart, SLAGauge, and ProgressBar receive colors via props as hex strings. These must be made theme-aware by:
- Reading `isDark` from `useThemeStore`
- Passing explicit color values based on theme (light vs dark palette)
- Triggering chart re-render when theme changes

### D-10: shadcn Button Extension
Extend the existing shadcn button CVA config to add `success` and `info` variants. Do NOT replace or rewrite `src/components/ui/button.tsx`. shadcn owns that file.

### D-11: Status Color Tokens — Paired (bg + fg)
Status and severity colors should be defined as pairs for proper dark mode support:
- `--status-warning-bg` + `--status-warning-fg`
- `--status-danger-bg` + `--status-danger-fg`
- etc.
This replaces single status color tokens. Avoids runtime contrast calculation in components.

### D-12: Scope is 8 Routes
All 8 routes must be themed: Dashboard, Torre de Controle, Viagens, Motoristas, Alertas, Geofences, Insights, Configurações. The three stub pages must use themed backgrounds (not hardcoded `bg-white`/`text-gray-*`).

### D-13: Exit Criteria — Build + Lint + Grep
Phase is NOT done until:
1. `npm run build` passes (zero TypeScript errors)
2. `npm run lint` passes (zero ESLint errors)
3. Final grep shows zero hardcoded colors outside documented allowlist
4. Theme toggle tested in all 8 pages
5. Theme persists on reload
6. Screenshots generated (8 pages × 2 themes = 16 screenshots)

### Claude's Discretion
- Exact oklch values may need minor adjustment for perceptual accuracy — executor can tune
- Typography scale details (line-heights, letter-spacing) can be set to taste within Argon style
- Shadow system values (sm/md/lg/xl) can be adjusted for visual depth
- Status badge bg opacity (10% vs 15%) can be adjusted for contrast

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Plans
- `.planning/phases/01b-visual-refinement-argon/01-PLAN-01-design-system.md` — Wave 1: design tokens, color system, theme store, FOUC prevention
- `.planning/phases/01b-visual-refinement-argon/01-PLAN-02-component-refactor.md` — Wave 2: component refactor (includes T2.B.0 hardcoded color inventory)
- `.planning/phases/01b-visual-refinement-argon/01-PLAN-03-page-integration.md` — Wave 3: page integration (8 routes), visual consistency pass, exit criteria

### Code Review Findings
- `.planning/phases/01b-visual-refinement-argon/01b-REVIEWS.md` — Codex (gpt-5.4) + self-review. Contains corrected decisions and consensus concerns. MUST read.

### Current Codebase State
- `torre-de-controle/src/index.css` — Current CSS vars. Uses oklch for shadcn vars. Has `@custom-variant dark (&:is(.dark *))` already configured. Status colors are hex (need updating).
- `torre-de-controle/src/stores/useUIStore.ts` — Existing Zustand store pattern to follow for useThemeStore
- `torre-de-controle/src/components/ui/button.tsx` — shadcn button with CVA. Extend, don't replace.

### Phase 1 Context (upstream)
- `.planning/phases/01-ui-shell-design-system/CONTEXT.md` — Phase 1 decisions (sidebar dark navy, blue primary, hook contract)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/stores/useUIStore.ts` — Zustand store pattern. useThemeStore should follow the same pattern (no persist middleware, just localStorage in toggleTheme action)
- `src/index.css` — Already has `@theme inline` block with `--color-*` mappings. Extend this, don't rewrite from scratch
- `src/components/ui/button.tsx` — CVA-based shadcn button. Add `success` and `info` to variants object
- `src/components/domain/StatusBadge.tsx` — Uses hardcoded `bg-green-100 text-green-700` etc. Replace with status token pairs
- `src/components/domain/SparklineChart.tsx` — Uses Chart.js. Takes `color` prop as hex string. Needs `isDark` awareness
- `src/app/pages/alertas/components/SLAGauge.tsx` — SVG with hardcoded stroke colors. Needs theme-aware stroke values

### Established Patterns
- CSS vars in `:root` (shadcn standard) + `@theme inline` (Tailwind v4 standard) — both already present in `index.css`
- Zustand stores: `create<StoreType>((set) => ({ ... }))` — no middleware, simple state
- Tailwind v4 utility classes: `bg-card`, `text-foreground`, `border-border` already used in some shadcn components
- `@custom-variant dark (&:is(.dark *))` propagates dark class from `html.dark` through the tree

### Integration Points
- `torre-de-controle/index.html` — Add FOUC prevention script here (before React bundle loads)
- `torre-de-controle/src/app/layout/Topbar.tsx` — Theme toggle button goes here
- `torre-de-controle/src/main.tsx` — May need to read theme state after FOUC script sets it
- All page components — Replace hardcoded bg/text/border classes with CSS token utilities

### Known Hardcoded Locations (from Codex scan)
- `src/components/domain/DataTable.tsx` — `bg-white`, `bg-gray-50`, `border-gray-200`, `text-gray-600`
- `src/app/layout/AppSidebar.tsx` — `bg-[#1a1a2e]`, `bg-[#0f62fe]`, `text-[#8892b0]` (46 occurrences in layout)
- `src/app/layout/AppLayout.tsx` — `bg-[#f4f6f9]`
- `src/app/layout/Topbar.tsx` — `bg-white`, `border-gray-200`, `text-gray-400/600/900`
- All page components — unscanned; T2.B.0 inventory step will quantify

</code_context>

<specifics>
## Specific Ideas

- **Argon Dashboard reference**: User wants to match the quality of Argon Dashboard (the design system this project is named after). This is the visual north star.
- **Status colors update**: Current status colors are `#2ecc71 / #f39c12 / #e74c3c / #95a5a6` (Phase 1). Argon equivalents are `#2dce89 / #fb6340 / #f5365c / #95959e` — slight update needed.
- **Theme toggle placement**: In topbar (top-right area, before user avatar)
- **Both themes must be production-ready**: User said "dark AND light" — not dark-primary with light fallback. Both must look polished.
- **No new dependencies**: Use Lucide (already installed) for sun/moon icons. No icon library changes.

</specifics>

<deferred>
## Deferred Ideas

- **Animation/micro-interactions** — hover transitions, page transitions → Phase 4+
- **Full accessibility audit** — color contrast WCAG AA across all components → separate effort
- **Responsive/mobile design refinement** — sidebar sheet behavior on mobile, topbar compact → Phase 2+
- **Design system page** (Storybook-like preview page) — mentioned by Codex as nice-to-have for QA → Phase 4+ or standalone effort
- **5 button variants** — Codex flagged as potentially too many for the product. Review in Phase 4 when real usage patterns emerge.

</deferred>

---

*Phase: 01b-visual-refinement-argon*
*Context gathered: 2026-04-28*
