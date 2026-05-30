---
phase: 08-ranking-ui
plan: 04
subsystem: ranking-ui
tags: [ranking, datatable, dialog, read-only, tanstack-table, mojibake]
requires:
  - "08-01: useRankingDrivers / useRankingTrips (Eden Treaty + TanStack Query)"
  - "08-02: fixMojibake (display helper)"
  - "08-03: RankingTab/ViagensTab stubs + RankingPage shell"
  - "DataTable, PanelCard (domain), Dialog/Badge (shadcn ui)"
provides:
  - "RankingTab: tabela ordenavel de RankedDriver (rank/nome/pontos/vinculo/viagens/ocorr./status + 6 metricas ETA)"
  - "DriverDetailsDialog: modal read-only (KPIs + ETA origem/destino + viagens do motorista)"
affects:
  - "torre-de-controle/src/app/pages/ranking/RankingPage.tsx (consome <RankingTab/> — nao editado)"
tech-stack:
  added: []
  patterns:
    - "Ordenacao client-side por estado local (sortKey/sortDir) + array pre-ordenado para a DataTable (DataTable compartilhada nao tem getSortedRowModel)"
    - "Badge de status custom via CSS vars Argon (--status-no-prazo-* / --status-atrasado-*) — Badge shadcn nao tem variant success"
    - "fixMojibake aplicado so na camada de view (nome/vinculo)"
key-files:
  created:
    - "torre-de-controle/src/app/pages/ranking/components/DriverDetailsDialog.tsx"
  modified:
    - "torre-de-controle/src/app/pages/ranking/components/RankingTab.tsx"
decisions:
  - "Ordenacao sem tocar a DataTable compartilhada: ordenar o array ANTES de passar, com sortKey/sortDir locais (3 estados: nova col->desc, reclick->asc, reclick->default pontuacao desc). BLOQUEADO (rank null) ancorado no fim no sort por rank."
  - "DriverDetailsDialog simplificado vs ride-rank: sem Accordion (inexistente no Torre), sem 'Analise da Lamonica'/resumo de avaliacoes (dependem de helpers fora de escopo + dados de escrita Phase 9), sem sub-abas Tabs internas — secoes empilhadas num corpo rolavel."
  - "Badge de status do motorista (ATIVO/BLOQUEADO) feito com CSS vars Argon ao inves do StatusBadge do Torre, que e exclusivo de SLA (no_prazo/em_risco/atrasado/sem_sinal)."
metrics:
  tasks: 2
  files_created: 1
  files_modified: 1
  duration: "~20min"
  completed: 2026-05-30
---

# Phase 8 Plan 04: Aba Ranking + DriverDetails (read) Summary

Aba Ranking recriada no design Torre: DataTable (TanStack Table) de `RankedDriver` ordenavel por colunas numericas (default pontuacao desc) com rank/nome/pontos/vinculo/viagens/ocorrencias/status e as 6 metricas ETA, consumindo `useRankingDrivers`; clicar numa linha abre o `DriverDetailsDialog` em modo somente-leitura (KPIs + ETA origem/destino + viagens do motorista filtradas de `useRankingTrips`). Zero escrita.

## What Was Built

### Task 1 — RankingTab (DataTable ordenavel)
- `useRankingDrivers()` -> array de `RankedDriver`; estados de loading/erro refletidos no `subtitle` e `emptyMessage` da `DataTable`.
- 13 colunas `ColumnDef<RankedDriver, unknown>`:
  - **rank** (`#`): `String(rank).padStart(2,'0')` ou `—` para BLOQUEADO; top-3 destacado em `text-primary`.
  - **nome** (`Motorista`): `fixMojibake(nome)`.
  - **pontuacao** (`Pontos`): mono, alinhado a direita.
  - **vinculo** (`Vínculo`): `fixMojibake(vinculo)`.
  - **totalViagens** (`Viagens`): mono numerico.
  - **ocorrencias** (`Ocorr.`): destaque vermelho + icone quando `> 0`.
  - **status** (`Status`): badge custom ATIVO (verde Argon) / BLOQUEADO (vermelho Argon).
  - **6 metricas ETA**: `etaOrigMetrics.{onTime,early,delay}` + `etaDestMetrics.{...}` via `accessorFn`, cell `value.toFixed(1)+'%'`, cores onTime=verde/early=azul/delay=vermelho.
- **Ordenacao** (ver Decisoes): headers numericos sao botoes que alternam o sort; array ordenado em `useMemo` antes de ir para a `DataTable` (que nao tem `getSortedRowModel`). Default `pontuacao` desc.
- `onRowClick` -> `setSelectedDriver`; `selectedId` ligado; `<DriverDetailsDialog>` montado com `open`/`onOpenChange`.

### Task 2 — DriverDetailsDialog (modal read-only)
- Props `{ driver: RankedDriver | null; open; onOpenChange }`; `null` -> retorna `null` (apos os hooks, respeitando regras de hooks).
- Header: `fixMojibake(nome)` + `DialogDescription` + badges (status Argon, `ID {id}`, vinculo, `Rank {rank ?? '—'}`).
- Grid de 4 KPIs: Rank, Pontuacao, Viagens, Ocorrencias (ocorr. em vermelho quando `>0`).
- Dois blocos ETA (Origem/Destino) com On Time / Early / Delay em `%`.
- Tabela de viagens do motorista: `useRankingTrips()` filtrado por `trip.driver_id === driver.id`, ordenado por data desc; colunas ID/Data/Rota(origem→destino)/ETA Origem/ETA Destino/Score; mensagem neutra quando vazio.
- `DialogContent` ampliado (`max-w-4xl`) com corpo rolavel (`max-h-[80vh] overflow-y-auto`).

## Deviations from Plan

None — plan executado conforme escrito. As simplificacoes do modal (sem Accordion / sem "Analise da Lamonica" / sem Tabs internas) e a estrategia de ordenacao client-side ja estavam previstas e autorizadas na `<action>` do plano; documentadas em Decisoes acima.

### Cross-wave note (nao e desvio do 08-04)
Durante o primeiro `tsc -b`, o `ViagensTab.tsx` (08-05, wave paralela) quebrava a arvore (`Cannot find module './EvaluationFormDialog'` + um `any` implicito). Por SCOPE BOUNDARY nao foi tocado. Na reexecucao do comando de verify a arvore ja estava verde (08-05 concluiu nesse intervalo) — `tsc -b && vite build` passou inteiro. Nenhum dos erros transitorios estava nos arquivos do 08-04.

## Read-Only / Security (T-08-10)

- Nenhuma chamada de escrita (`.post`/`.patch`/`.delete`/`upsert`/`evaluateTrip`/`createRouteScore`) e nenhum `onSubmit` nos dois arquivos.
- Nome/vinculo renderizados sempre via interpolacao JSX (`{value}`) — auto-escape do React; `fixMojibake` retorna texto puro. **Zero `dangerouslySetInnerHTML`** (mitigacao T-08-10 atendida).

## Verification

- `cd torre-de-controle && npx tsc -b --noEmit && npm run build` -> **exit 0** (3160 modulos transformados; `dist/assets/RankingPage-*.js` 39.68 kB gerado).
- Acceptance criteria (grep) confirmados:
  - RankingTab: `useRankingDrivers` >=1, `fixMojibake` >=1, `DataTable` >=1, `etaOrigMetrics|etaDestMetrics` >=2, `DriverDetailsDialog` >=1; escrita = 0.
  - DriverDetailsDialog: `DialogContent` >=1, `export function DriverDetailsDialog` = 1, `etaOrigMetrics|etaDestMetrics` >=2; escrita/onSubmit = 0.

## Known Stubs

Nenhum. Ambos os componentes consomem dados reais dos hooks 08-01 (`useRankingDrivers`, `useRankingTrips`). Nenhum valor hardcoded/placeholder flui para render.

## Self-Check: PASSED

- FOUND: torre-de-controle/src/app/pages/ranking/components/RankingTab.tsx
- FOUND: torre-de-controle/src/app/pages/ranking/components/DriverDetailsDialog.tsx
- Build exit 0 (tsc -b && vite build) confirma compilacao + bundling dos dois arquivos.
- Commit: pendente — ver nota de bloqueio abaixo.
