---
phase: 08-ranking-ui
plan: 03
subsystem: ui
tags: [ranking, react-router, lazy, shadcn-tabs, kpicard, argon, read-only]
requires:
  - phase: 08-01
    provides: "useRankingStats hook (RankingStats: activeDrivers/top3Avg/totalTrips/activeBlocks)"
provides:
  - "Rota lazy autenticada /ranking (padrão 06-07) + item 'Ranking' no sidebar Argon"
  - "RankingPage: casca header + StatsCards + shadcn Tabs com 6 abas (Ranking/Viagens/Qualidade/Bloqueios/Rotas/Logs)"
  - "StatsCards: 4 KPICards reais alimentados por useRankingStats"
  - "6 stubs de aba isolados (1 arquivo cada) — contratos de arquivo fixados para a Wave 3 paralela"
affects:
  - "08-04 (RankingTab), 08-05 (ViagensTab), 08-06 (QualidadeTab), 08-07 (Bloqueios/RotasTab), 08-08 (LogsTab) — cada um preenche seu stub sem tocar RankingPage"
tech-stack:
  added: []
  patterns:
    - "Rota lazy via React.lazy + .then(m => ({ default: m.X })) dentro do AppLayout (padrão router.tsx existente)"
    - "Página Torre: <div space-y-5> + header text-white + grid KPIs Argon (mesmo DashboardKPIRow)"
    - "Isolamento 1-arquivo-por-aba: shell monta os 6 componentes; conteúdo vive em arquivos próprios para paralelismo sem conflito de merge"
key-files:
  created:
    - "torre-de-controle/src/app/pages/ranking/RankingPage.tsx"
    - "torre-de-controle/src/app/pages/ranking/components/StatsCards.tsx"
    - "torre-de-controle/src/app/pages/ranking/components/RankingTab.tsx"
    - "torre-de-controle/src/app/pages/ranking/components/ViagensTab.tsx"
    - "torre-de-controle/src/app/pages/ranking/components/QualidadeTab.tsx"
    - "torre-de-controle/src/app/pages/ranking/components/BloqueiosTab.tsx"
    - "torre-de-controle/src/app/pages/ranking/components/RotasTab.tsx"
    - "torre-de-controle/src/app/pages/ranking/components/LogsTab.tsx"
  modified:
    - "torre-de-controle/src/app/router.tsx"
    - "torre-de-controle/src/app/layout/AppSidebar.tsx"
key-decisions:
  - "StatsCards: enquanto isLoading, KPICard.value = em-dash '—' (padrão calmo do dashboard) — sem skeleton extra"
  - "TabsList estilizado no tom Argon (bg-card + hairline var(--border)) e esticado em grid de 6 colunas (responsivo 2/3/6), sobrescrevendo o w-fit default do shadcn"
  - "Ícones das abas seguem o ride-rank: Ranking/Trophy, Viagens/FileText, Qualidade/BarChart3, Bloqueios/ShieldAlert, Rotas/Route, Logs/ScrollText"
  - "Stubs mínimos com export nomeado homônimo + PanelCard 'Aba em construção' — props sem args para não quebrar a montagem quando a Wave 3 preencher"
patterns-established:
  - "Contrato de arquivo por aba: RankingPage é a ÚNICA edição do shell; waves 3 só editam seu próprio *Tab.tsx"
requirements-completed: [PHASE8-RANKING-ROUTE-NAV, PHASE8-STATSCARDS]
duration: 5min
completed: 2026-05-30
---

# Phase 8 Plan 03: /ranking Route + Sidebar + RankingPage Shell + StatsCards Summary

Casca navegável da feature de ranking — rota lazy `/ranking` no sidebar Argon, RankingPage com 4 KPIs reais (useRankingStats) e shell de 6 abas shadcn, mais os 6 stubs de aba isolados que fixam os contratos de arquivo para a Wave 3 paralela.

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-30T11:59:27Z
- **Completed:** 2026-05-30T12:04:48Z
- **Tasks:** 3
- **Files modified:** 10 (8 criados, 2 modificados)

## Accomplishments

- Rota lazy autenticada `/ranking` (chunk próprio `RankingPage-*.js`, 5.18 kB) montada como filha do AuthGuard + AppLayout — herda a proteção de sessão (T-08-05 mitigada, nenhum bypass).
- Item "Ranking" (ícone `Trophy`) no `navItems` do sidebar Argon flutuante, posicionado entre Insights e Configurações.
- `RankingPage`: header Torre (`text-white`) + `StatsCards` + `<Tabs defaultValue="ranking">` com as 6 abas na ordem do ride-rank, cada `TabsContent` montando o stub correspondente.
- `StatsCards`: 4 `KPICard` reais (Motoristas Ativos / Média Top 3 / Total Viagens / Bloqueios) alimentados por `useRankingStats()` — números prontos de `/api/ranking/stats`, sem recomputo (T-08-06 accept, só agregados).
- 6 stubs de aba (`RankingTab`/`ViagensTab`/`QualidadeTab`/`BloqueiosTab`/`RotasTab`/`LogsTab`), cada um em arquivo próprio com export nomeado — Wave 3 (08-04..08) preenche cada um sem tocar RankingPage.

## Task Commits

As 3 tasks formam uma entrega coesa de Wave 2 (shell navegável), commitada atomicamente em um único commit:

1. **Task 1: Rota lazy /ranking + item AppSidebar** — `7ffb40d` (feat)
2. **Task 2: StatsCards (4 KPIs reais) + 6 stubs de aba** — `7ffb40d` (feat)
3. **Task 3: RankingPage shell (header + StatsCards + Tabs)** — `7ffb40d` (feat)

**Plan metadata:** pendente (commit docs separado com SUMMARY + STATE + ROADMAP).

## Files Created/Modified

- `torre-de-controle/src/app/router.tsx` — lazy chunk `RankingPage` + rota `{ path: 'ranking', element: <L><RankingPage /></L> }`
- `torre-de-controle/src/app/layout/AppSidebar.tsx` — import `Trophy` + entrada `{ to: '/ranking', label: 'Ranking', icon: Trophy }`
- `torre-de-controle/src/app/pages/ranking/RankingPage.tsx` — shell: header + `<StatsCards />` + Tabs com 6 abas montando os stubs
- `torre-de-controle/src/app/pages/ranking/components/StatsCards.tsx` — 4 KPICards via `useRankingStats`, grid Argon `lg:grid-cols-4`
- `torre-de-controle/src/app/pages/ranking/components/RankingTab.tsx` — stub (→ 08-04)
- `torre-de-controle/src/app/pages/ranking/components/ViagensTab.tsx` — stub (→ 08-05)
- `torre-de-controle/src/app/pages/ranking/components/QualidadeTab.tsx` — stub (→ 08-06)
- `torre-de-controle/src/app/pages/ranking/components/BloqueiosTab.tsx` — stub (→ 08-07)
- `torre-de-controle/src/app/pages/ranking/components/RotasTab.tsx` — stub (→ 08-07)
- `torre-de-controle/src/app/pages/ranking/components/LogsTab.tsx` — stub (→ 08-08)

## Decisions Made

- **Loading state dos KPIs:** em-dash `'—'` no value enquanto `isLoading` (mesmo padrão calmo já usado no Torre), em vez de skeleton — mantém o layout estável e mínimo.
- **TabsList Argon:** `grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 h-auto bg-card` + hairline `var(--border)` — estica os 6 triggers em colunas iguais e adota a superfície card do Torre, em vez do `w-fit`/`bg-muted` default do shadcn (não copiei classes do ride-rank, conforme CONTEXT).
- **pt-2 no grid de StatsCards:** dá folga ao ícone flutuante do KPICard (`top: -1.25rem`) já que o `space-y-5` sozinho deixaria o ícone colado ao header.
- **Ordem + ícones das abas** seguem o ride-rank (`Index.tsx`): Ranking/Trophy, Viagens/FileText, Qualidade/BarChart3, Bloqueios/ShieldAlert, Rotas/Route, Logs/ScrollText.

## Deviations from Plan

None - plan executed exactly as written.

A verify `tsc -b --noEmit` da Task 1 (isolada) dependia da `RankingPage` que só nasce na Task 3 (o `import()` lazy do router resolve o módulo). Por isso as 3 tasks foram implementadas em sequência e a verificação de compilação/build rodou ao final — comportamento esperado para um plano que cria a casca + os arquivos referenciados num mesmo passo. Não é desvio de escopo; nenhum arquivo fora dos 10 do plano foi tocado.

## Verification

- `cd torre-de-controle && npx tsc -b --noEmit` → **exit 0**
- `cd torre-de-controle && npm run build` (`tsc -b && vite build`) → **exit 0**, 3156 módulos, chunk lazy `assets/RankingPage-CZ-1_LqO.js` (5.18 kB) gerado — confirma code-splitting da rota.
- Acceptance grep:
  - `ranking/RankingPage` no router com `lazy(` → ✓
  - `path: 'ranking'` → 1 ✓ · `to: '/ranking'` no sidebar → 1 ✓ · `Trophy` importado → ✓
  - StatsCards: `useRankingStats` presente ✓ · `KPICard` usado 4× ✓ · 4 títulos (Motoristas Ativos / Média Top 3 / Total Viagens / Bloqueios) ✓
  - 6 stubs com `export function <X>Tab` → todos OK ✓
  - RankingPage: 6 `TabsTrigger` + 6 `TabsContent` reais ✓ · `<StatsCards />` montado ✓ · 6 componentes de aba referenciados (`<RankingTab`…`<LogsTab`) ✓
- Encoding dos 8 arquivos novos: sem mojibake (acentos UTF-8 corretos em "Média"/"Avaliação"/"construção" — literais estáticos, `fixMojibake` é só para dados do backend).

## Known Stubs

Os 6 componentes de aba são **stubs intencionais** (cada um renderiza `PanelCard` "Aba em construção"). Não bloqueiam o objetivo deste plano (entregar a casca navegável + KPIs reais + contratos de arquivo). Cada stub será **substituído integralmente** na Wave 3:

| Stub | Arquivo | Resolvido por |
|------|---------|---------------|
| RankingTab | `components/RankingTab.tsx` | 08-04 |
| ViagensTab | `components/ViagensTab.tsx` | 08-05 |
| QualidadeTab | `components/QualidadeTab.tsx` | 08-06 |
| BloqueiosTab | `components/BloqueiosTab.tsx` | 08-07 |
| RotasTab | `components/RotasTab.tsx` | 08-07 |
| LogsTab | `components/LogsTab.tsx` | 08-08 |

Os 4 KPIs do StatsCards **não** são stubs — consomem dados reais de `/api/ranking/stats`.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Casca navegável funcional: clicar em "Ranking" no sidebar abre `/ranking` (lazy) com 4 KPIs reais e 6 abas no design Torre.
- Contratos de arquivo das abas **fixados**: a Wave 3 (08-04 a 08-08) pode rodar em paralelo, cada plano editando apenas seu próprio `*Tab.tsx` sem conflito com `RankingPage.tsx`.
- `RankingPage.tsx` está congelado — nenhuma wave seguinte deve reescrevê-lo (só os stubs).

## Self-Check: PASSED

- FOUND: torre-de-controle/src/app/pages/ranking/RankingPage.tsx
- FOUND: torre-de-controle/src/app/pages/ranking/components/StatsCards.tsx
- FOUND: 6 stubs de aba (Ranking/Viagens/Qualidade/Bloqueios/Rotas/Logs)
- FOUND: .planning/phases/08-ranking-ui/08-03-SUMMARY.md
- FOUND: commit 7ffb40d (feat(08-03): /ranking shell — Wave 2)

---
*Phase: 08-ranking-ui*
*Completed: 2026-05-30*
