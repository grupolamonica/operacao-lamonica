---
phase: 1
reviewers: [gemini, codex]
reviewed_at: 2026-04-28T16:30:00-03:00
plans_reviewed:
  - 01-PLAN-01-project-setup.md
  - 01-PLAN-02-layout-design-system.md
  - 01-PLAN-03-types-mock-data.md
  - 01-PLAN-04-dashboard-torre.md
  - 01-PLAN-05-viagens-motoristas.md
  - 01-PLAN-06-alertas-stubs.md
self_cli_skipped: claude (running inside Claude Code)
---

# Cross-AI Plan Review — Phase 1: UI Shell + Design System

---

## Gemini Review

### 1. Resumo (Summary)
O conjunto de planos é de altíssima qualidade, demonstrando uma abordagem metódica de engenharia "Research-First". A escolha da stack é moderna e equilibrada (Vite 5, React 18, Tailwind v4, Zustand), com um foco louvável na estabilidade através do pin de versões exatas. A estratégia de "Wave Dependency" está bem estruturada, permitindo que a fundação (Wave 1) prepare o terreno para a implementação das telas complexas (Wave 2) sem retrabalho. O uso de hooks como camada de abstração para os dados mockados é uma decisão arquitetural excelente, que reduzirá significativamente o esforço de integração com o backend na Fase 2.

### 2. Pontos Fortes (Strengths)
- **Abstração de Dados via Hooks:** A interface `{ data, isLoading, error }` nos hooks de mock antecipa o padrão do TanStack Query, permitindo uma transição indolor para dados reais no futuro.
- **Layout via CSS Grid:** O uso de `grid-template-columns` dinâmico para o padrão "Tabela + Painel Lateral" é mais performático e robusto do que o uso de modais ou posicionamento absoluto, mantendo a responsividade do layout.
- **Gestão de Dependências:** O pin de versões exatas (ex: `react@18.3.1`) evita surpresas com o React 19 ou Vite 6, garantindo que o ambiente de desenvolvimento seja idêntico entre os agentes.
- **Consistência de Design:** A definição antecipada de variáveis CSS para cores de status e sidebar garante que o sistema de design seja aplicado uniformemente em todos os componentes de domínio.
- **Componentização Granular:** A separação entre componentes de UI (shadcn) e componentes de Domínio (KPICard, StatusBadge) facilita a manutenção e testes.

### 3. Preocupações e Riscos (Concerns)
- **MEDIUM** — Consistência de Espaço de Cor: O PLAN-01 define variáveis shadcn em OKLCH (padrão do Tailwind v4), mas usa Hexadecimais para cores de status e sidebar. Embora o Tailwind v4 suporte ambos, a mistura pode dificultar ajustes finos de opacidade ou temas futuros.
- **LOW** — Volume de Mock Data: 15 viagens e 15 alertas são suficientes para validar o layout, mas podem ser poucos para testar o comportamento real da paginação e o "scroll feel" da `DataTable` com TanStack Table.
- **LOW** — Registro Global do Chart.js: O registro de módulos do Chart.js no componente `SparklineChart` é seguro, mas se múltiplos gráficos diferentes forem adicionados em outras fases, pode haver redundância.
- **LOW** — Check de Build vs. Check Visual: O critério de aceitação `npm run build` garante integridade sintática, mas não captura problemas de z-index ou overflow comuns em layouts de "painel lateral" em telas menores.

### 4. Sugestões (Suggestions)
- **Normalização de Cores:** Converter as cores de status (verde, laranja, vermelho) para variáveis OKLCH no `index.css` para manter a consistência com o sistema do shadcn/ui.
- **Filtros Centralizados:** Considerar a criação de um hook `useFilterState` ou utilitário para padronizar como os filtros do `DataTable` interagem com a URL (opcional para Phase 1, mas recomendado para UX).
- **Aumento de Mock Data:** Adicionar um loop simples nos arquivos de mock para gerar +20 registros genéricos (totalizando ~40-50) para validar visualmente a paginação e o comportamento de sticky header nas tabelas.
- **Verificação de Layout:** Adicionar um passo de verificação manual para testar o comportamento do split panel em resoluções de 1366px (padrão de notebooks corporativos).

### 5. Avaliação de Risco (Risk Assessment)
**Nível de Risco: BAIXO (LOW)**

A fundamentação técnica é sólida. Os maiores riscos identificados (inconsistência de tokens de cor e volume de dados) são de fácil remediação e não bloqueiam o progresso das ondas subsequentes. A estrutura de dependências entre PLAN-01 e os demais é clara e segura. A estratégia de utilizar o `SidebarProvider` do shadcn desde o início mitiga um dos "pitfalls" mais comuns dessa biblioteca.

**Veredito:** Planos **APROVADOS** para execução.

---

## Codex Review

### Summary
The plan set is directionally strong: scope is well-bounded, page decomposition matches the operator workflow, and the team is thinking in reusable primitives, typed mock data, and a later backend swap. The main weaknesses are contract-related, not scope-related: acceptance criteria are too build-centric for a visual SPA, the `TableWithSidePanel` behavior is underspecified, mock data volume is too low for realistic control-tower UX, and a few library/state boundaries need to be tightened before execution.

### Strengths
- Clear Phase 1 boundary: UI shell, navigation, mock data, no backend creep.
- Good dependency discipline: exact version pinning, React 18 override, Tailwind v4 CSS-first setup, no `tailwind.config.js`.
- Strong component decomposition in PLAN-02; `DataTable`, `TableWithSidePanel`, `TripTimeline`, and badge/KPI primitives are the right reusable units.
- PLAN-03 is architecturally sound: types, mock data, and swappable hooks are the right separation for a Phase 2 backend.
- Page scopes in PLAN-04/05/06 are concrete and map well to operational use cases.
- Explicit notes like stable `getRowId`, `SidebarProvider`, and Chart.js registration show awareness of common implementation pitfalls.

### Concerns
- **HIGH** — `npm run build` is not a sufficient acceptance gate. Vite's build does not type-check TypeScript; strict TS can still be broken while build passes. Should also run `tsc --noEmit`.
- **HIGH** — `TableWithSidePanel` is underdefined. Without explicit breakpoint and overflow behavior, likely failures are double scrollbars, stale selected rows, clipped side-panel content, and unusable layouts on narrower screens.
- **MEDIUM** — PLAN-02 and PLAN-03 are only partially parallelizable after PLAN-01. Component props, store shape, and mock types can drift if shared contracts are not frozen first.
- **MEDIUM** — Mock volume is enough to render screens, but not enough to test operational density. 15 trips across 4 statuses and 15 alerts across 3 severities leaves many states with only 3–5 rows/items.
- **MEDIUM** — Sidebar state is duplicated. shadcn's `SidebarProvider` already owns collapse/open state; adding `isSidebarCollapsed` in Zustand creates two sources of truth.
- **MEDIUM** — React 18 + shadcn + Tailwind v4 is workable but slightly off the current default path. shadcn's Tailwind v4 docs are centered on React 19.
- **MEDIUM** — Phase 2 data contracts are still implicit. "Same interface Phase 2 will use with TanStack Query" is good intent, but hook return shape, filter params, loading/error states, and pagination ownership are not defined.
- **LOW** — PLAN-02 says "React Router 8 routes" which reads as a version mismatch against locked `react-router-dom@6.30.3`. If it means "8 routes," rephrase it.
- **LOW** — Security constraints (no real PII, no secrets, no `dangerouslySetInnerHTML`) are not in acceptance criteria for mock-only phase.
- **LOW** — Sparkline performance: registering all Chart.js modules is unnecessary for KPI sparklines.

### Suggestions
- Replace the Phase 1 gate with: `npm run build` + `tsc --noEmit` + `npm run dev` smoke test + navigation across all 8 routes + no console errors + visual check against reference images on desktop and 1366px.
- Add a thin "shared contracts" artifact before parallelizing PLAN-02 and PLAN-03: route IDs, entity IDs, selection model, KPI prop shapes, token names, and hook signatures.
- Expand mock coverage to ~25–30 drivers, 40–60 trips, 30–50 alerts, plus explicit edge-case fixtures: empty states, long names, expired documents, missing GPS, multiple alerts per trip, stale signal cases.
- Specify `TableWithSidePanel` behavior precisely: `minmax(0,1fr)` for table area, clamped panel width, independent scroll regions, selection reset rules when filtered items disappear, and a stacked/drawer fallback below a breakpoint.
- Either control `SidebarProvider` from Zustand or remove `isSidebarCollapsed` from Zustand entirely.
- Define hooks now as query-like contracts even for mock data: `data`, `isLoading`, `isError`, `error`, `refetch`, and typed filter inputs.
- Add backend-relevant fields now to prevent Phase 2 type churn: `id`, `driverId`, `tripId`, `lastGpsAt`, `etaAt`, `slaDeadlineAt`, `riskLevel`, `signalStatus`, `lat`, `lng`, `updatedAt`.
- Put Chart.js registration in one module imported by `SparklineChart`, register only controllers/elements/plugins actually used.
- Add explicit security acceptance line: all mock contacts use reserved fake data, no tokens, no real plates/IDs, no HTML injection.

### Risk Assessment
**Overall risk: MEDIUM**

The plan is fundamentally good and should succeed, but carries avoidable rework risk. The biggest issues are late-discovery problems: visual/layout problems in the split-panel pattern, sparse mock data hiding UX issues, and incomplete Phase 2 contracts forcing refactors. Tightening acceptance criteria, shared contracts, and side-panel behavior would reduce this to low-medium risk.

---

## Consensus Summary

### Agreed Strengths (mentioned by both reviewers)
- **Hook abstraction pattern:** Both reviewers praised the `{ data, isLoading, error }` interface that anticipates TanStack Query — critical for Phase 2 migration.
- **Exact version pinning:** React 18.3.1, react-router-dom@6, Tailwind v4 — both flagged this as a major strength preventing environment drift.
- **Component decomposition:** Both approved separating shadcn/ui primitives from domain components (KPICard, StatusBadge, DataTable). Right granularity.
- **Dependency ordering:** Wave 1 → Wave 2 structure was validated by both as sound.
- **Pitfall awareness:** Both noted that encoding SidebarProvider, Chart.js registration, and getRowId pitfalls directly in tasks is good practice.

### Agreed Concerns (raised by both, highest priority)
1. **Mock data volume is insufficient** (Gemini: LOW, Codex: MEDIUM) — 15 trips / 15 alerts is not enough to test pagination behavior, scroll density, or operational UX realism. Expand to 40–60 trips and 30–50 alerts.
2. **Color space inconsistency** (both flagged) — mixing hex (`#1a1a2e`) and OKLCH in CSS vars is workable but creates maintenance friction. Ideally normalize to OKLCH, or at minimum document the intentional hybrid approach.
3. **`npm run build` alone is insufficient** (Codex: HIGH) — must add `tsc --noEmit` since Vite build skips TypeScript type checking.
4. **TableWithSidePanel underspecified** (Codex: HIGH) — missing: breakpoint behavior, scroll containment, selection reset on filter, overflow handling. Must be specified before Wave 2 pages implement it.
5. **Phase 2 contracts implicit** (Codex: MEDIUM) — hook signatures, pagination interface, filter types need to be explicit now to avoid type churn when real API is connected.

### Divergent Views
- **Risk level:** Gemini rates overall risk as **LOW**, Codex as **MEDIUM**. Codex identified two HIGH issues (build gate, TableWithSidePanel spec) that Gemini did not raise. Recommendation: treat as MEDIUM and address the two HIGH concerns before or during Wave 2.
- **Sidebar state:** Codex flagged `isSidebarCollapsed` in Zustand as a conflict with `SidebarProvider`'s internal state. Gemini did not mention this. Worth resolving before PLAN-02 execution — either use shadcn's provider state or sync both.

### Priority Actions Before Execution

| Priority | Action | Source |
|----------|--------|--------|
| P1 | Add `tsc --noEmit` to all acceptance criteria that use `npm run build` | Codex HIGH |
| P1 | Specify `TableWithSidePanel` behavior: breakpoints, scroll containment, overflow, selection reset | Codex HIGH |
| P2 | Expand mock data: 40–60 trips, 30–50 alerts, 20–25 drivers | Both MEDIUM |
| P2 | Resolve sidebar state: `isSidebarCollapsed` in Zustand vs SidebarProvider | Codex MEDIUM |
| P2 | Define explicit Phase 2 hook contracts: pagination, sort, error, refetch interfaces | Codex MEDIUM |
| P3 | Add security acceptance criteria to PLAN-03: no real PII, no tokens, no dangerouslySetInnerHTML | Codex LOW |
| P3 | Add 1366px layout check to Phase 1 success criteria | Gemini LOW |
