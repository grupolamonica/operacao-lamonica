---
phase: 07-ranking-backend
plan: 01
subsystem: api
tags: [supabase, ride-rank, service-role, env, elysia, bun, proxy]

# Dependency graph
requires:
  - phase: 06-observability
    provides: padrão de client singleton de infra (redis/client.ts) reaproveitado para fail-fast
provides:
  - "Client Supabase server-side rankSupabase apontando para o ride-rank externo (service_role, bypassa RLS)"
  - "Dependência @supabase/supabase-js@2.106.2 no backend"
  - "4 envs RANK_* documentadas em api/.env.example (service_role vazio + aviso server-side only)"
affects: [07-03-ranking-reads, 07-04-ranking-endpoints, 08-ranking-ui]

# Tech tracking
tech-stack:
  added: ["@supabase/supabase-js@2.106.2"]
  patterns:
    - "Client Supabase singleton server-side com fail-fast no module-load (espelha redis/client.ts)"
    - "Segredo sensível lido só de process.env, nunca logado, nunca prefixado VITE_ (D-V2-01 / T-07-01)"

key-files:
  created:
    - api/src/modules/ranking/ranking.supabase.ts
  modified:
    - api/package.json
    - api/bun.lock
    - api/.env.example

key-decisions:
  - "ranking usa client @supabase/supabase-js separado (DB externo ride-rank), NÃO o Drizzle/postgres.js do Torre (DBs diferentes)"
  - "service_role (não anon) porque o RLS do ride-rank bloqueia o anon em 4 das 5 tabelas — bypass via service-side é inerente ao proxy (T-07-03 accept)"
  - "auth persistSession:false / autoRefreshToken:false — sem sessão de browser, uso 100% server-side"

patterns-established:
  - "Infra-client singleton: valida envs no topo do módulo com throw new Error (fail-fast), exporta instância + type"
  - "Segredo de terceiro (service_role) fica vazio no .env.example com comentário server-side; valor real só no .env do servidor (gitignored)"

requirements-completed: [PHASE7-RANKING-MODULE-SETUP]

# Metrics
duration: ~12min
completed: 2026-05-29
---

# Phase 7 Plan 01: Ranking Module Setup Summary

**Client Supabase server-side (`rankSupabase`) com `@supabase/supabase-js@2.106.2` apontando para o projeto externo do ride-rank via `service_role`, com fail-fast no load e 4 envs `RANK_*` documentadas — a porta de entrada única (proxy D-V2-01) para todas as leituras do ride-rank nos planos 03/04.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-29T19:38Z (aprox.)
- **Completed:** 2026-05-29T19:50:10Z
- **Tasks:** 3
- **Files modified:** 4 (3 modificados, 1 criado)

## Accomplishments
- Dependência `@supabase/supabase-js@2.106.2` adicionada via `bun add` (Bun 1.3.13), lockfile `bun.lock` atualizado.
- `api/src/modules/ranking/ranking.supabase.ts`: singleton `rankSupabase` que lê `RANK_SUPABASE_URL` + `RANK_SUPABASE_SERVICE_KEY` de env, faz fail-fast se faltar (sem logar a key), e cria o client com `auth: { persistSession:false, autoRefreshToken:false }`. Exporta `rankSupabase` + `type RankSupabase`.
- 4 envs `RANK_*` documentadas em `api/.env.example`: `RANK_SUPABASE_URL` (preenchida), `RANK_SUPABASE_SERVICE_KEY` (VAZIA + aviso "server-side only"), `RANK_SHEET_ID`/`RANK_SHEET_TAB` (valores públicos gviz).

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: Adicionar dependência @supabase/supabase-js** - `a3154e9` (chore)
2. **Task 2: Client Supabase ride-rank server-side (rankSupabase)** - `8086c89` (feat)
3. **Task 3: Documentar envs RANK_* no .env.example** - `250e9e7` (docs)

_Nota TDD: a Task 2 (`tdd="true"`) é um singleton de infra puro — a verificação de comportamento (fail-fast / init) é o teste runtime via `bun -e` definido nos acceptance_criteria do plano, não um arquivo de teste separado. Ambos passaram (THREW / INIT_OK). Ver "TDD Gate Compliance" abaixo._

**Plan metadata:** commit final docs (SUMMARY + deferred-items).

## Files Created/Modified
- `api/src/modules/ranking/ranking.supabase.ts` - **(criado)** singleton `rankSupabase` server-side para o Supabase do ride-rank (service_role, bypassa RLS), fail-fast no module-load.
- `api/package.json` - **(modificado)** `@supabase/supabase-js: ^2.106.2` em dependencies.
- `api/bun.lock` - **(modificado)** lockfile com a árvore do SDK Supabase (8 pacotes).
- `api/.env.example` - **(modificado)** seção `# Ranking (Phase 7 ...)` com as 4 envs `RANK_*`.

## Decisions Made
- **DB separado, client separado:** o ranking NÃO usa o Drizzle/postgres.js do Torre (`api/src/db/client.ts`, que aponta para `torre-controle-prod`). Usa um client `@supabase/supabase-js` próprio apontando para o ride-rank (`vrlhfgfyjvkzfnafibnc`) — são DBs distintos (D-V2-01).
- **service_role, não anon:** o RLS do ride-rank só libera `drivers` ao anon; as outras 4 tabelas (`evaluations`, `driver_blocks`, `evaluation_logs`, `route_scores`) exigem role autenticado/service. O bypass via service-side é inerente ao proxy (T-07-03 → accept; mitigado a jusante pelo `authGuard` no Plan 04).
- **Sem sessão de browser:** `persistSession:false` + `autoRefreshToken:false` — o client é só leitura server-side.

## Deviations from Plan

None - plan executed exactly as written.

(As 3 tasks seguiram action/verify/acceptance do plano. A única falha de verificação observada na rodada final de tsc full-project é de arquivo de OUTRO plano — ver "Issues Encountered" + Scope.)

## Issues Encountered

- **tsc full-project falha em `ranking.scoring.test.ts` (07-02, fora de escopo).** Na verificação final, `bun --bun tsc --noEmit` (glob do projeto) saiu com exit 2 por erros `TS2307`/`TS6133` em `src/modules/ranking/ranking.scoring.test.ts` — arquivo **propriedade do Plan 07-02** (commit `c538b54 test(07-02) ... (RED)`), que está em fase TDD-RED e ainda não implementou `./ranking.scoring` nem os exports de `./ranking.routes`. O worktree do 07-01 foi ramificado após o commit RED do 07-02, então o arquivo WIP do 07-02 está presente na árvore.
  - **Por que não corrigido:** boundary do 07-01 ("NÃO toca ranking.routes.ts/scoring.ts/types.ts"). É RED-phase esperado do 07-02 — será resolvido no GREEN do 07-02. SCOPE BOUNDARY → registrado em `deferred-items.md`, não corrigido.
  - **Verificação scoped do 07-01 (passou):** `ranking.supabase.ts` NÃO importa nenhum arquivo do 07-02 (grep: `NO_0702_DEP_OK`); tsc do projeto **excluindo** `ranking.scoring.test.ts` → **exit 0**; testes de comportamento do 07-01 (`THREW` no fail-fast, `INIT_OK` no init com envs) passaram; a verificação por-task do plano (Task 2 tsc com envs) saiu 0 quando o WIP do 07-02 não estava na árvore de checagem.

## TDD Gate Compliance

A Task 2 é marcada `tdd="true"`, mas é um **singleton de infra puro** (sem lógica de negócio testável por unidade). O plano define a verificação de comportamento como testes de runtime nos `acceptance_criteria`, não como arquivo `*.test.ts` separado:
- **RED-equivalente (fail-fast):** `bun -e "... RANK_*='' ; import(...) ..."` -> imprimiu `THREW`, exit 0. (PASS)
- **GREEN-equivalente (init):** `RANK_*=... bun -e "import(...).then(m => m.rankSupabase.from ...)"` -> imprimiu `INIT_OK`, exit 0. (PASS)
- **tsc:** exit 0 (escopo 07-01). (PASS)

Como o comportamento é cobertura runtime (não unit-test em arquivo), não há commit `test(07-01)` separado; os critérios verificáveis do plano foram todos satisfeitos antes do commit `feat(07-01)` (`8086c89`).

## Known Stubs

None - nenhum stub. O client é funcional; a única ausência é o **valor real do `RANK_SUPABASE_SERVICE_KEY`**, que é segredo de user-setup (ver abaixo).

## User Setup Required

**O `RANK_SUPABASE_SERVICE_KEY` real é prereq do checkpoint do Plan 07-04** (não disponível agora). O client `rankSupabase` **inicializa** a partir do env e o `bun --bun tsc --noEmit` passa **sem** conectar — a key real só é necessária quando os endpoints de leitura (Plan 03/04) forem efetivamente bater no ride-rank.

Quando disponível, definir em `api/.env` (dev) e `/opt/apps/torre/.env` (VPS):
- `RANK_SUPABASE_URL=https://vrlhfgfyjvkzfnafibnc.supabase.co` (já conhecido)
- `RANK_SUPABASE_SERVICE_KEY=<service_role do ride-rank>` (Dashboard ride-rank -> Settings -> API -> service_role; **SERVER-SIDE ONLY**, nunca em `VITE_*`/logs)
- `RANK_SHEET_ID=1MWTiaXU3HXW_iVn-n70WSk3o8rcHTRrQP2ac07W9cCU` (público)
- `RANK_SHEET_TAB=DBLHHISTORICO` (público)

## Next Phase Readiness
- Base do módulo `ranking` pronta: `rankSupabase` exportado e disponível para os reads do **Plan 07-03** (`fetchEvaluations`, `fetchDriverBlocks`, `fetchDrivers`, `fetchRouteScores`) consumirem via `rankSupabase.from('<tabela>').select(...)`.
- Wave 1 paralela ao 07-02 respeitada: 07-01 só tocou `package.json`, `bun.lock`, `.env.example`, `ranking.supabase.ts` — nenhum arquivo do 07-02 (`ranking.types.ts`/`routes.ts`/`scoring.ts`) foi modificado.
- **Bloqueio futuro (não desta fase):** `RANK_SUPABASE_SERVICE_KEY` real é prereq do checkpoint do 07-04.

## Self-Check: PASSED

- FOUND: api/src/modules/ranking/ranking.supabase.ts
- FOUND: .planning/phases/07-ranking-backend/07-01-SUMMARY.md (worktree)
- FOUND: .planning/phases/07-ranking-backend/deferred-items.md (worktree)
- FOUND: @supabase/supabase-js em api/package.json
- FOUND: RANK_SUPABASE_SERVICE_KEY em api/.env.example
- FOUND commit a3154e9 (Task 1), 8086c89 (Task 2), 250e9e7 (Task 3)

---
*Phase: 07-ranking-backend*
*Completed: 2026-05-29*
