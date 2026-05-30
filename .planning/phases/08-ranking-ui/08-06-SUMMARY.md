---
phase: 08-ranking-ui
plan: 06
subsystem: ranking-ui
tags: [ranking, qualidade, chartjs, panelcard, read-only]
wave: 3
requires:
  - "08-01: useRankingTrips / useRankingDrivers (hooks Eden Treaty + TanStack Query)"
  - "08-02: PanelCard / Skeleton / useThemeStore / fixMojibake (infra de UI)"
  - "08-03: stub QualidadeTab + montagem da RankingPage (6 abas)"
provides:
  - "QualidadeTab: aba Qualidade preenchida (2 charts Chart.js + listas de rota + listas de motorista) com dados reais"
affects:
  - "torre-de-controle/src/app/pages/ranking/RankingPage.tsx (consome <QualidadeTab/>, NAO modificado)"
tech-stack:
  added: []
  patterns:
    - "Chart.js (react-chartjs-2 Bar) com re-mount por tema via key={`${isDark}-...`} + tickColor/gridColor condicionais (padrao MotoristasRankingChart)"
    - "Calculo de display puro no cliente (useMemo) a partir de Trip[]/RankedDriver[] — sem helpers de qualityInsights do ride-rank"
    - "fixMojibake aplicado em nomes de motorista na camada de view"
key-files:
  created: []
  modified:
    - "torre-de-controle/src/app/pages/ranking/components/QualidadeTab.tsx (stub 08-03 -> implementacao completa, ~360 linhas)"
decisions:
  - "Recharts -> Chart.js (D-V2-03): recriado o comportamento do QualityChart do ride-rank em react-chartjs-2 Bar; zero import de recharts."
  - "Helpers de qualityInsights (reliabilityIndex/attentionIndex/evaluations) ficaram FORA de escopo — dependem de `evaluations`, que o contrato Torre /api/ranking nao expoe. Substituidos por derivacao direta de campos ja computados do RankedDriver (pontuacao, ocorrencias, totalViagens, etaDestMetrics.delay)."
  - "Motoristas destaque = ordenacao por (menor ocorrencias, depois maior pontuacao) filtrando totalViagens>0; Atencao = (mais ocorrencias, depois maior delay no destino). Top 5 cada."
  - "Listas de rota early/delay MANTIDAS (cabiam no budget) — derivadas de Trip.origin_code/destination_code + status_eta_destino. Lista de no-show OMITIDA (dependia de helper summarizeSheetNoShowRoutes + dado no_show de planilha fora do contrato consumido)."
  - "Tabela de comportamento/comunicacao do ride-rank OMITIDA — depende inteiramente de evaluations (Phase 9)."
metrics:
  duration: ~13min
  completed: 2026-05-30
  tasks: 1
  files: 1
---

# Phase 8 Plan 06: Aba Qualidade (Chart.js) Summary

Aba Qualidade do /ranking recriada no design Torre com Chart.js (substituindo Recharts do ride-rank): dois graficos de barras (penalidade % por KPI e distribuicao de pontuacao em 5 buckets) mais listas de rotas (delay/early) e de motoristas (destaque/atencao), tudo em PanelCard com tema isDark e dados reais de `/api/ranking/{trips,drivers}`.

## What Was Built

- **QualidadeTab** (`torre-de-controle/src/app/pages/ranking/components/QualidadeTab.tsx`): substitui o stub do 08-03. Read-only.
  - Registro Chart.js unico no topo do modulo: `ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)`.
  - Consome `useRankingTrips()` (Trip[] FECHADA) e `useRankingDrivers()` (RankedDriver[]).
  - **Chart 1 — Penalidade por KPI**: `Bar` horizontal (`indexAxis: 'y'`), escala 0..100 com sufixo `%`. 3 barras: % trips com `status_eta`=='DELAY', % com `status_eta_destino`=='DELAY', % com `ocorrencia===true` (sobre total de trips). Cor por faixa (`penaltyColor`: verde <=15, laranja <=30, vermelho >30 — hex Argon).
  - **Chart 2 — Distribuicao de pontuacao**: `Bar` vertical, 5 buckets de `driver.pontuacao` (`bucketSize = ceil(maxPts/5)`), cor primary `#5e72e4`, ticks `precision: 0`.
  - **Rotas em destaque**: agrupa trips por `origin_code->destination_code`, conta `status_eta_destino` delay/early; duas listas (Mais delay / Mais early), top 5, com contagem + taxa %.
  - **Listas de motorista**: "Motoristas destaque" e "Motoristas que pedem atencao" em PanelCard, com `fixMojibake(nome)`, pontuacao, viagens, ocorrencias e delay no destino. Top 5 cada.
  - **Tema**: `const { isDark } = useThemeStore()`; cada `<Bar key={`${isDark}-...`} />` com `tickColor`/`gridColor` condicionais (re-mount em troca de tema — padrao MotoristasRankingChart).
  - **Loading**: `Skeleton` dentro de cada PanelCard enquanto `isLoading` (trips e drivers separados).
  - **Layout**: grid Argon responsivo (`grid grid-cols-1 lg:grid-cols-2 gap-5` para os 2 charts e para as listas de motorista; `md:grid-cols-2` para rotas), envelopados em `space-y-5`.

## Deviations from Plan

Nenhuma deviation de codigo (Rules 1-4 nao acionadas). As omissoes abaixo sao escolhas previstas pelo proprio plano ("se exceder, omitir... documentar") e pelo escopo do contrato consumido, nao bugs:

- **Lista de no-show por rota**: omitida — dependia de `summarizeSheetNoShowRoutes` + flag de no-show da planilha DBLH, fora do contrato `/api/ranking/trips` consumido. As duas listas de rota mantidas (delay/early) usam apenas campos do contrato.
- **Tabela comportamento/comunicacao + totais de avaliacao**: omitida — 100% dependente de `evaluations` (comunicacao/postura/no-show por avaliacao), que e Phase 9 (escrita/avaliacoes). O contrato read-only de Phase 8 nao expoe esse dado.
- **Helpers `qualityInsights`** (reliabilityIndex/attentionIndex/punctualityRate): nao portados (fora de escopo). Listas de motorista derivadas dos campos ja computados do `RankedDriver` conforme `<action>` do plano.

## Authentication Gates

Nenhum. Aba consome endpoints ja autorizados pelo authGuard do Torre (cookie de sessao); sem login/2FA/secret.

## Verification Results

- `cd torre-de-controle && npx tsc -b --noEmit` -> exit 0 (sem erros).
- `cd torre-de-controle && npm run build` -> exit 0 (3160 modulos, chunk `RankingPage` gerado, `chart-vendor` presente). Aviso de chunk >500kB e pre-existente (`map-vendor`), fora de escopo.
- grep acceptance_criteria (em QualidadeTab.tsx):
  - `react-chartjs-2` = 1 (>=1 OK)
  - `recharts` = 0 (==0 OK)
  - `ChartJS.register` = 1 (>=1 OK)
  - `isDark` = 6 (>=1 OK)
  - `useRankingTrips|useRankingDrivers` = 5 (>=2 OK)
  - `PanelCard` = 12 (>=2 OK)
  - `fixMojibake` = 2 (>=1 OK)
- min_lines artifact: ~360 linhas (>=90 OK).

## Known Stubs

Nenhum. Todos os dados vem dos hooks reais; fallbacks `?? 0` / `?? '?'` sao null-safety, nao placeholders. Listas/charts renderizam estado vazio explicito ("Sem viagens" / "Sem motoristas" / empty labels) quando o dataset e vazio.

## Scope Boundary

Tocado apenas `QualidadeTab.tsx`. `RankingPage.tsx` e demais abas (RankingTab/ViagensTab/BloqueiosTab/RotasTab/LogsTab) NAO foram modificados (Wave 3 isolada — sem conflito de paralelismo).

## Self-Check: PASSED

- Arquivo modificado existe e abre (Read autoritativo): `torre-de-controle/src/app/pages/ranking/components/QualidadeTab.tsx` (linha 1 `import { useMemo } from 'react'`).
- SUMMARY existe: `.planning/phases/08-ranking-ui/08-06-SUMMARY.md`.
- Build (`npm run build`) transformou 3160 modulos com chunk `RankingPage` regenerado — prova que QualidadeTab compila e e importado pela arvore.
- Verificacao de commits NAO executavel: git (add/commit e read rev-parse/status) negado por permissao neste ambiente.

## Commit Status: PENDENTE (git bloqueado por permissao)

As operacoes git foram negadas pelo ambiente de execucao (tanto `git add`/`git commit` quanto `git rev-parse`/`git status` read-only). Por isso o per-task commit e o metadata commit NAO foram criados, e as guardas obrigatorias de pre-commit (#2924 HEAD-safety / #3097 cwd-drift), que dependem de `git rev-parse`/`git symbolic-ref`, nao puderam ser validadas. O codigo + docs estao no disco e verificados.

Acao manual para finalizar (branch `claude/elastic-napier-5559df`, worktree confirmado via `.git` -> `.git/worktrees/elastic-napier-5559df`):

```
git add torre-de-controle/src/app/pages/ranking/components/QualidadeTab.tsx
git commit -m "feat(08-06): aba Qualidade (Chart.js) — Wave 3"
git add .planning/phases/08-ranking-ui/08-06-SUMMARY.md .planning/STATE.md .planning/ROADMAP.md
git commit -m "docs(08-06): complete aba Qualidade plan"
```
