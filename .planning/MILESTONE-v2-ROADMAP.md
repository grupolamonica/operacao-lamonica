### Phase 8 — Ranking: UI (6 abas, design Torre)
**Goal:** rota `/ranking` no Torre com as 6 abas funcionando (leitura), consumindo `/api/ranking/*` via Eden Treaty + TanStack Query.
**Entregas:**
- Item "Ranking" no sidebar Argon flutuante + rota lazy `/ranking`.
- Hooks `useRanking*()` (Eden Treaty → `/api/ranking/*`, mesmo padrão de `useTrips`).
- Layout com Tabs (shadcn `tabs.tsx`) + `StatsCards` (4 KPIs no padrão KPICard).
- Abas: **Ranking** (DataTable ordenável), **Viagens** (DataTable + botão avaliar), **Qualidade** (Chart.js bar + listas), **Bloqueios** (DataTable + ação), **Rotas** (form/tabela), **Logs** (DataTable + diff).
- Filtros: data (DateRangePicker reuso), vínculo, rota, ocorrência, import de motoristas.
- Modais `DriverDetails` + `EvaluationForm` (shadcn Dialog + Form já no Torre).
- Todos os cards via **PanelCard** (padrão v1.0). Recharts→Chart.js.
**Sucesso:** as 6 abas renderizam dados reais no design Torre; filtros funcionam; zero erros console.
**Depende de:** Phase 7.
**Plans:** 8 plans em 3 waves (planejado 2026-05-30 — READ-ONLY; escrita/avaliação/bloqueio/CRUD rota e leitura de evaluation_logs ficam para Phase 9)
- Wave 1 (paralelo):
  - [ ] 08-01-PLAN.md — 5 hooks `useRanking*` (Eden Treaty + TanStack Query) + re-export dos tipos do contrato Phase 7 [PHASE8-RANKING-HOOKS]
  - [ ] 08-02-PLAN.md — helper de display `fixMojibake` (corrige mojibake só na view, backend byte-a-byte) [PHASE8-MOJIBAKE-DISPLAY]
- Wave 2:
  - [ ] 08-03-PLAN.md — rota lazy `/ranking` + item sidebar Argon + RankingPage (shell de 6 abas) + StatsCards (4 KPIs reais) + 6 stubs de aba [PHASE8-RANKING-ROUTE-NAV, PHASE8-STATSCARDS]
- Wave 3 (paralelo, cada aba em arquivo próprio):
  - [ ] 08-04-PLAN.md — aba Ranking (DataTable ordenável: rank/nome/pontuação/vínculo/viagens/ocorrências/status/ETA) + DriverDetailsDialog read-only [PHASE8-TAB-RANKING, PHASE8-MODAIS-SHELL]
  - [ ] 08-05-PLAN.md — aba Viagens (DataTable FECHADA) + EvaluationFormDialog shell (submit/bloqueio disabled, Phase 9) [PHASE8-TAB-VIAGENS, PHASE8-MODAIS-SHELL]
  - [ ] 08-06-PLAN.md — aba Qualidade (Chart.js bar: penalidade por KPI + distribuição de pontuação + listas destaque/atenção) [PHASE8-TAB-QUALIDADE]
  - [ ] 08-07-PLAN.md — aba Bloqueios (DataTable ativos, desbloquear disabled) + aba Rotas (tabela read de route-scores) [PHASE8-TAB-BLOQUEIOS, PHASE8-TAB-ROTAS]
  - [ ] 08-08-PLAN.md — aba Logs (shell de auditoria: colunas + diff JSON, estado vazio + aviso Phase 9 — endpoint `/logs` é Phase 9) [PHASE8-TAB-LOGS]

### Phase 9 — Ranking: escrita + auditoria
