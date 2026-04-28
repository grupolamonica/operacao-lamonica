---
phase: 01-ui-shell-design-system
plan: "06"
subsystem: frontend-pages
tags:
  - frontend
  - alertas
  - stubs
  - pages
dependency_graph:
  requires:
    - 01-02 (KPICard, AlertItem, SeverityBadge, SidePanelLayout, DriverAvatar)
    - 01-03 (useAlerts, useAlert, useAlertasKPIs, types, mocks)
  provides:
    - AlertasPage completa com KPIs, filtros, grupos, painel
    - SLAGauge componente reutilizável
    - 3 stubs explicativos (Geofences, Insights, Configurações)
  affects:
    - /alertas route (era stub vazio, agora completo)
    - /geofences, /insights, /configuracoes (era stub "em construção", agora informativo)
tech_stack:
  added: []
  patterns:
    - SVG circular gauge sem libs externas (strokeDasharray/strokeDashoffset)
    - Grid dinâmico CSS para side panel slide-in
    - Grouped list colapsável por severidade com estado local
key_files:
  created:
    - torre-de-controle/src/app/pages/alertas/components/SLAGauge.tsx
    - torre-de-controle/src/app/pages/alertas/components/AlertasKPIRow.tsx
    - torre-de-controle/src/app/pages/alertas/components/AlertasFiltersBar.tsx
    - torre-de-controle/src/app/pages/alertas/components/AlertGroupedList.tsx
    - torre-de-controle/src/app/pages/alertas/components/AlertDetailPanel.tsx
  modified:
    - torre-de-controle/src/app/pages/alertas/AlertasPage.tsx
    - torre-de-controle/src/app/pages/geofences/GeofencesPage.tsx
    - torre-de-controle/src/app/pages/insights/InsightsPage.tsx
    - torre-de-controle/src/app/pages/configuracoes/ConfiguracoesPage.tsx
decisions:
  - "SLAGauge implementado com SVG puro — sem dependência de charting library para Phase 1"
  - "AlertGroupedList usa estado local (não store) para controle de colapso — preferência de UI local"
  - "Stub pages usam Card com lista de features por phase — permite ao usuário entender roadmap"
  - "AlertDetailPanel usa console.log para ações em Phase 1 — persistência chega na Phase 4"
metrics:
  duration: "~15min"
  completed: "2026-04-28"
  tasks: 2
  files_changed: 9
---

# Phase 1 Plan 06: Alertas + Stubs Summary

**One-liner:** Página Alertas completa com gauge SVG, 5 filtros, lista colapsável por severidade e side panel com 5 ações; 3 páginas stub informativas (Geofences, Insights, Configurações) com badge de phase prevista e lista de features.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | AlertasPage + 5 sub-componentes (SLAGauge, KPIRow, FiltersBar, GroupedList, DetailPanel) | 7cafbf2 |
| 2 | Stubs GeofencesPage, InsightsPage, ConfiguracoesPage | 2998ed1 |

## Components Created

### AlertasPage (`/alertas`)
- **AlertasKPIRow** — 4 KPIs: Críticos (red), Abertos (orange), Resolvidos hoje (green), SLA das tratativas com gauge
- **SLAGauge** — gauge circular SVG (`<circle>` + `strokeDasharray`/`strokeDashoffset`), sem libs externas, animação CSS
- **AlertasFiltersBar** — 5 filtros: Tipo de alerta, Cliente, Rota, Responsável, Período (shadcn Select)
- **AlertGroupedList** — 3 grupos colapsáveis em ordem: Críticos > Médios > Baixos, cada um mostra contagem `(N)`, usa `AlertItem` do design system
- **AlertDetailPanel** — side panel via `SidePanelLayout` com: badges de severidade/status/source, grid de metadados, seção Detalhes, seção Motorista, SLA deadline box + **5 botões de ação**: Assumir alerta, Registrar tratativa, Ligar para motorista, Escalar alerta, Marcar como resolvido

### AlertasPage layout
- Grid dinâmico `gridTemplateColumns: isOpen ? '1fr 440px' : '1fr 0px'` para slide-in do painel lateral
- Integra `useAlerts(filters)` + `useAlert(selectedAlertId)` + `useUIStore` (selectedAlertId)

## Stub Pages Created

| Página | Phase prevista | Features listadas |
|--------|---------------|-------------------|
| GeofencesPage (`/geofences`) | Phase 5 | polígono, círculo, histórico entradas/saídas, alertas automáticos |
| InsightsPage (`/insights`) | Phase 6 | métricas históricas, Tendências de SLA, ranking motoristas, export CSV |
| ConfiguracoesPage (`/configuracoes`) | Phase 6 | usuários (Phase 2), regras alerta (Phase 4), geofences padrão (Phase 5), GPS providers (Phase 6) |

## Build Verification

```
npm run build → exit 0
tsc -b → exit 0 (incluído no build)
2652 modules transformed
dist/assets/index-BdejyQlB.js 702.37 kB (gzip: 214.67 kB) — apenas warning de chunk size (não é erro)
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

Nenhum stub de dados. As ações no AlertDetailPanel (`Assumir`, `Registrar tratativa`, etc.) fazem `console.log` intencionalmente — documentado no threat model (T-01-12: accept, auditoria na Phase 4). Não impede o objetivo da página que é ter o design e UX corretos para Phase 4.

## Threat Flags

Nenhuma nova superfície de segurança introduzida. Coordenadas lat/lng expostas no AlertDetailPanel — aceito (T-01-13, mock data sem residências reais).

## Self-Check: PASSED

- torre-de-controle/src/app/pages/alertas/AlertasPage.tsx — FOUND
- torre-de-controle/src/app/pages/alertas/components/SLAGauge.tsx — FOUND
- torre-de-controle/src/app/pages/alertas/components/AlertasKPIRow.tsx — FOUND
- torre-de-controle/src/app/pages/alertas/components/AlertasFiltersBar.tsx — FOUND
- torre-de-controle/src/app/pages/alertas/components/AlertGroupedList.tsx — FOUND
- torre-de-controle/src/app/pages/alertas/components/AlertDetailPanel.tsx — FOUND
- torre-de-controle/src/app/pages/geofences/GeofencesPage.tsx — FOUND
- torre-de-controle/src/app/pages/insights/InsightsPage.tsx — FOUND
- torre-de-controle/src/app/pages/configuracoes/ConfiguracoesPage.tsx — FOUND
- Commit 7cafbf2 — FOUND
- Commit 2998ed1 — FOUND
