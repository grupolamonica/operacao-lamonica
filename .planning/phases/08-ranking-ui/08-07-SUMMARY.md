---
phase: 08-ranking-ui
plan: 07
subsystem: ranking-ui
tags: [ranking, bloqueios, rotas, datatable, panelcard, read-only]
wave: 3
requires:
  - "08-01: useRankingBlocks / useRankingRouteScores / useRankingTrips (hooks Eden Treaty + TanStack Query) + tipos DriverBlockRecord / RouteScoreRecord"
  - "08-02: fixMojibake (helper de display)"
  - "08-03: stubs BloqueiosTab + RotasTab + montagem da RankingPage (6 abas)"
provides:
  - "BloqueiosTab: aba Bloqueios preenchida (DataTable de bloqueios ATIVOS) com acao Desbloquear DESABILITADA (Phase 9)"
  - "RotasTab: aba Rotas preenchida (tabela read de route-scores) com CRUD ausente / botao Nova Pontuacao DESABILITADO (Phase 9)"
affects:
  - "torre-de-controle/src/app/pages/ranking/RankingPage.tsx (consome <BloqueiosTab/> + <RotasTab/>, NAO modificado)"
tech-stack:
  added: []
  patterns:
    - "DataTable<T extends {id:string}> compartilhada com ColumnDef[] memoizado + data mapeada para id estavel antes de passar (padrao RankingTab)"
    - "Badge shadcn (variant outline/default) + badge inline com CSS vars de status do tema (--status-atrasado-bg/fg) para o status BLOQUEADO"
    - "fixMojibake aplicado em driver_name / motivo / created_by / observacao na camada de view"
    - "Acoes de escrita renderizadas DESABILITADAS (disabled + title) e sem handler de API — nenhum onClick que chame mutacao"
key-files:
  created: []
  modified:
    - "torre-de-controle/src/app/pages/ranking/components/BloqueiosTab.tsx (stub 08-03 -> implementacao completa, ~165 linhas)"
    - "torre-de-controle/src/app/pages/ranking/components/RotasTab.tsx (stub 08-03 -> implementacao completa, ~170 linhas)"
decisions:
  - "Status BLOQUEADO usa Badge inline com CSS vars do tema (--status-atrasado-bg/fg), NAO o StatusBadge compartilhado: o StatusBadge do Torre so tipa as chaves de SLA (no_prazo/em_risco/atrasado/sem_sinal) e nao comporta o label BLOQUEADO. Editar o StatusBadge esta fora do escopo desta wave. Mesmo padrao visual do DriverStatusBadge da RankingTab (consistencia)."
  - "READ-ONLY (D-V2-03): acao Desbloquear (Bloqueios) e botao Nova Pontuacao (Rotas) renderizam DESABILITADOS com title='Disponivel na Phase 9' e SEM handler de API. CRUD/dialog de historico do ride-rank (RouteScores) OMITIDOS — sao escrita = Phase 9 (D-V2-06)."
  - "id estavel: DriverBlockRecord.id e RouteScoreRecord.id sao opcionais (id?). Como a DataTable exige {id:string}, mapeamos para id deterministico antes de passar (block: `driver_id`-indice; rota: `origin`-`destino`-`data_inicio`)."
  - "Coluna Viagens (RotasTab, opcional no plano) INCLUIDA: contagem cruzada com useRankingTrips() agrupando origin_code->destination_code (mesma derivacao do ride-rank uniqueRoutes); rotas sem viagem mostram 0. Barato e memoizado."
metrics:
  duration: ~9min
  completed: 2026-05-30
  tasks: 2
  files: 2
---

# Phase 8 Plan 07: Abas Bloqueios + Rotas (read) Summary

Abas Bloqueios e Rotas do /ranking recriadas no design Torre (DataTable/PanelCard), consumindo `/api/ranking/blocks` (ativos) e `/api/ranking/route-scores` em modo leitura. As acoes de escrita do ride-rank (desbloquear motorista; criar/editar/remover pontuacao de rota) aparecem desabilitadas com aviso de Phase 9 ou sao omitidas — zero POST/PATCH/DELETE.

## What Was Built

- **BloqueiosTab** (`torre-de-controle/src/app/pages/ranking/components/BloqueiosTab.tsx`): substitui o stub do 08-03. Read-only. Recria a `BlocksList` do ride-rank.
  - Consome `useRankingBlocks()` (`DriverBlockRecord[]`, ja so ativos pelo endpoint).
  - Map para shape com id estavel: `id: b.id ?? `${b.driver_id}-${i}``.
  - Colunas: **Motorista** (`driver_name` + fixMojibake, font-medium), **Tipo** (Badge outline mono NO_SHOW/MANUAL), **Motivo** (fixMojibake, truncado max-w-[220px] + title, "—" quando vazio), **Início** (`data_inicio` mono), **Status** (badge inline BLOQUEADO vermelho com icone ShieldAlert — todas as linhas sao ativas), **Criado por** (`created_by` + fixMojibake), **Ação** (Button "Desbloquear" `disabled` + `title="Disponível na Phase 9"`, SEM onClick).
  - `title="Bloqueios"`, `subtitle` reativo (`Carregando…` / `Falha ao carregar` / `${n} ativos`). Estado vazio: "Nenhum bloqueio ativo".
- **RotasTab** (`torre-de-controle/src/app/pages/ranking/components/RotasTab.tsx`): substitui o stub do 08-03. Read-only. Recria a `RouteScores` do ride-rank (sem CRUD).
  - Consome `useRankingRouteScores()` (`RouteScoreRecord[]`) e `useRankingTrips()` (para contar viagens por rota).
  - Map para shape com id estavel: `id: rs.id ?? `${rs.origin_code}-${rs.destination_code}-${rs.data_inicio}``.
  - `tripCountByRoute`: `useMemo` que agrupa trips por `origin_code→destination_code` -> count.
  - Colunas: **Origem** (mono), **Destino** (mono), **Viagens** (contagem do mapa, 0 se sem viagem), **Pontuação** (Badge default `${pontuacao} pt`), **Período** (`data_inicio` + `→ data_fim` ou `→ atual`), **Obs.** (fixMojibake, truncado + title, "—" quando vazio).
  - **Toolbar**: Button "Nova Pontuação" `disabled` + `title="Disponível na Phase 9"` (unico vestigio da escrita; sem handler).
  - `title="Rotas"`, `subtitle` reativo (`${n} rotas`). Estado vazio: "Nenhuma pontuação de rota cadastrada.".

## Deviations from Plan

- **[Rule 3 - Tipo incompativel] Status BLOQUEADO via Badge inline em vez de StatusBadge.** O plano (Task 1) pediu `StatusBadge "BLOQUEADO"`, mas o `StatusBadge` compartilhado (`torre-de-controle/src/components/domain/StatusBadge.tsx`) e tipado apenas para as 4 chaves de SLA (`no_prazo|em_risco|atrasado|sem_sinal`) — passar "BLOQUEADO" e erro de tipo. Como editar o StatusBadge esta fora do escopo desta wave, usei um badge inline com as mesmas CSS vars de status do tema (`--status-atrasado-bg/fg`), identico ao `DriverStatusBadge` da RankingTab. Resultado visual e semantico equivalente. Arquivo: `BloqueiosTab.tsx`.
- **Coluna "Viagens" (RotasTab) incluida** (era opcional no plano): mantida por ser fiel ao ride-rank e barata (useMemo cruzando trips). Sem custo de escrita.

Nenhuma das demais Rules (1, 2, 4) foi acionada. CRUD + dialog de historico do `RouteScores` do ride-rank foram OMITIDOS por design (escrita = Phase 9), conforme o `<action>` do plano.

## Authentication Gates

Nenhum. Ambas as abas consomem endpoints `/api/ranking/*` ja autorizados pelo authGuard do Torre (cookie de sessao); sem login/2FA/secret.

## Verification Results

- `cd torre-de-controle && npx tsc -b --noEmit` -> exit 0 (sem erros).
- `cd torre-de-controle && npm run build` -> exit 0 (3160 modulos transformados, chunk `RankingPage-*.js` gerado, `✓ built in 37.48s`). Aviso de chunk >500kB e pre-existente (`map-vendor` / Leaflet), fora de escopo.
- grep acceptance_criteria:
  - BloqueiosTab: `useRankingBlocks` >=1 OK; `disabled` >=1 OK; aviso `Phase 9` presente OK; READ-ONLY `\.(post|patch|delete)\(|unblockDriver` = **0** OK.
  - RotasTab: `useRankingRouteScores` >=1 OK; `DataTable|PanelCard` >=1 OK; `export function RotasTab` = 1 OK; READ-ONLY `\.(post|patch|delete)\(|createRouteScore|updateRouteScore|deleteRouteScore` = **0** OK.
- min_lines artifacts: BloqueiosTab ~165 linhas (>=50 OK); RotasTab ~170 linhas (>=45 OK).
- key_links: BloqueiosTab importa `useRankingBlocks` OK; RotasTab importa `useRankingRouteScores` OK.

## Known Stubs

Nenhum. Todos os dados vem dos hooks reais (`useRankingBlocks`, `useRankingRouteScores`, `useRankingTrips`). Os botoes desabilitados (Desbloquear / Nova Pontuacao) sao vestigios INTENCIONAIS da escrita, explicitamente diferidos para a Phase 9 (D-V2-06) — nao stubs de dado. Fallbacks `|| '—'` e `?? 0` sao null-safety, nao placeholders. Estados vazios renderizam mensagem explicita.

## Scope Boundary

Tocados apenas `BloqueiosTab.tsx` e `RotasTab.tsx`. `RankingPage.tsx` e demais abas (RankingTab/ViagensTab/QualidadeTab/LogsTab) NAO foram modificados (Wave 3 isolada — sem conflito de paralelismo).

Durante a verificacao inicial, o `tsc -b` reportou 2 erros transitorios em `ViagensTab.tsx` (modulo `./EvaluationFormDialog` ausente + param implicit any) — pertencentes a outra wave (08-05) em execucao paralela. NAO foram corrigidos (fora de escopo, SCOPE BOUNDARY); resolveram-se sozinhos quando a wave 08-05 concluiu, e o build final passou limpo (exit 0).
