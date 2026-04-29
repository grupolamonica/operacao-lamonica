---
quick_id: 260429-csm
slug: viagens-filter-refactor
status: complete
date: 2026-04-29
commit: 0531d97
---

## What was done

Refactored the Viagens page filter UX to match the Motoristas table pattern:

1. **ViagensTable.tsx** — complete rewrite. Inline toolbar with search + 5 Select dropdowns (Status, Cliente, Rota, Prioridade, SLA) + 3 action buttons (Ordenar, Filtros, Exportar). Status Select shows live counts per status. All filter state internalized (removed external `filters`/`onChange` props).

2. **ViagensPage.tsx** — simplified. Removed `ViagensFiltersPanel`, `ViagensTabs`, 12-col grid, and local filters state. Table now full-width under KPI row.

## Files changed

- `torre-de-controle/src/app/pages/viagens/components/ViagensTable.tsx`
- `torre-de-controle/src/app/pages/viagens/ViagensPage.tsx`
