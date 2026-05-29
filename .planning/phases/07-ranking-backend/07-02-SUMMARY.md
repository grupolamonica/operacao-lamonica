---
phase: 07-ranking-backend
plan: 02
subsystem: api
tags: [ranking, scoring, ride-rank-port, bun-test, tdd, parity, elysia]

# Dependency graph
requires:
  - phase: 07-ranking-backend (07-CONTEXT)
    provides: decisões D-V2-04 (scoring reusado sem reescrever), fontes ride-rank a portar
provides:
  - "ranking.types.ts — tipos do ranking (Driver, Trip, Block, SheetTrip, RouteScoreRecord + *Record de leitura) exportáveis para Plans 03/04 e Eden Treaty"
  - "ranking.routes.ts — getRouteBasePoints (função pura, FONTE ÚNICA da pontuação-base de rota)"
  - "ranking.scoring.ts — scoring puro (calculateTripScore, transformTrips, transformSheetNoShowTrips, deriveDrivers, calcStatusMetrics + helpers) com paridade byte-a-byte ao ride-rank"
  - "ranking.scoring.test.ts — 16 testes de paridade (sintéticos + golden-sample REAL + NO SHOW)"
affects: [07-03-ranking-reads, 07-04-ranking-service-endpoints, 08-ranking-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Camada pura sem I/O isolada em ranking.scoring.ts (testável com paridade, zero supabase/fetch/redis)"
    - "Fonte única de getRouteBasePoints em ranking.routes.ts — scoring importa, nunca duplica (anti-drift)"
    - "Imports relativos ./ranking.* dentro do módulo (robusto para bun test, não depende de path alias @/*)"
    - "Paridade byte-a-byte de literais de fallback via injeção de bytes UTF-8 explícitos (fase read-only; encoding fix é Phase 8)"
    - "bun test nativo (bun:test) — sem vitest/jest; verificação por exit code"

key-files:
  created:
    - api/src/modules/ranking/ranking.types.ts
    - api/src/modules/ranking/ranking.routes.ts
    - api/src/modules/ranking/ranking.scoring.ts
    - api/src/modules/ranking/ranking.scoring.test.ts
  modified: []

key-decisions:
  - "Scoring portado 1:1 de dataAdapter.ts — algoritmo REUSADO, não reescrito (D-V2-04)"
  - "getRouteBasePoints é FONTE ÚNICA em ranking.routes.ts; ranking.scoring.ts importa (sem cópia) — previne drift de paridade (T-07-13)"
  - "Literais de fallback preservados byte-a-byte: mojibake 'â€\"' (U+00E2 U+20AC U+201D) em transformTrips (x3) e deriveDrivers.vinculo (x1); em-dash limpo '—' (U+2014) em transformSheetNoShowTrips (x3); 'Nao atribuido' ASCII (x2) — assimetria do original mantida (T-07-04)"
  - "calcStatusMetrics exportado (no original era privado) para permitir teste unitário direto"
  - "deriveBlocks NÃO portado (retorna [] no original; sem valor + evitaria noUnusedLocals)"
  - "Golden-sample com status preset (resolveStatus verbatim) + datas BR auto-canceladas no diff — determinístico independente de timezone do runner"

patterns-established:
  - "Pure scoring layer: módulo testável sem mocks de rede/DB"
  - "Single-source helper imports para evitar duplicação de regras de negócio"

requirements-completed: [PHASE7-PORT-SCORING, PHASE7-PORT-ROUTESCORES, PHASE7-SCORING-PARITY, PHASE7-EDEN-TYPES]

# Metrics
duration: ~12min
completed: 2026-05-29
---

# Phase 7 Plan 02: Ranking Types + Scoring (Paridade) Summary

**Camada pura do ranking portada do ride-rank — tipos, getRouteBasePoints (fonte única) e scoring (calculateTripScore/transformTrips/deriveDrivers) com paridade byte-a-byte comprovada por 16 testes bun (sintéticos + golden-sample REAL + NO SHOW).**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-29 (sessão de execução Wave 1)
- **Completed:** 2026-05-29
- **Tasks:** 1 plano TDD (RED → GREEN)
- **Files modified:** 4 (todos criados)

## Accomplishments

- `ranking.scoring.ts`: scoring puro portado 1:1 de `dataAdapter.ts` (normalizeStatusAgrupado, isSheetNoShowStatus, parseDateBR, parseFlexibleDate, calculateDateDiffMinutes, calculateStatusFromDates, resolveStatus, statusPointOrigem, statusPointDestino, calculateTripScore, isOcorrenciaValida, extractUniqueOccurrences, transformTrips, transformSheetNoShowTrips, calcStatusMetrics, deriveDrivers).
- `ranking.routes.ts`: `getRouteBasePoints` como FONTE ÚNICA (portado de `routeScoreService.ts`); scoring importa de `./ranking.routes` sem duplicar.
- `ranking.types.ts`: interfaces de `mockData.ts` (Driver, Trip, Block, StatusMetrics, OperatorEvaluation + enums) + `SheetTrip` + `RouteScoreRecord` + os *Record de leitura (EvaluationRecord, DriverBlockRecord, EvaluationLogRecord, DriverRecord). Só tipos — sem mock/UI helpers.
- `ranking.scoring.test.ts`: 16 testes, incluindo golden-sample de SheetTrip REAL FECHADA com `score_final`/`pontuacao` travados em valores numéricos exatos + linha NO SHOW (score 0).

## Task Commits

Plano TDD (RED → GREEN):

1. **RED — teste de paridade (8 casos + golden-sample)** - `c538b54` (test)
2. **GREEN — tipos + getRouteBasePoints + scoring puro** - `16b4752` (feat)

_O fix de lint do test (TS6133 `noUnusedParameters` no `.map((s,i)`) foi incorporado no commit GREEN antes de marcar verde._

## Files Created/Modified

- `api/src/modules/ranking/ranking.types.ts` — Tipos portados do ride-rank (mockData + SheetTrip + RouteScoreRecord + *Record de leitura), exportáveis para Plans 03/04 e Eden Treaty.
- `api/src/modules/ranking/ranking.routes.ts` — `getRouteBasePoints` (função pura, fonte única da pontuação-base de rota).
- `api/src/modules/ranking/ranking.scoring.ts` — Funções puras de scoring (sem I/O); importa `getRouteBasePoints` de `./ranking.routes`.
- `api/src/modules/ranking/ranking.scoring.test.ts` — Teste de paridade `bun test` (sintéticos + golden-sample real + NO SHOW).

## Golden-sample usado (paridade ponta-a-ponta)

Dois trips FECHADA do mesmo motorista `D100` ("MOTORISTA REAL"), rota `CWB1→SAO5`, datas BR `DD/MM/AAAA HH:MM:SS`, sem `route_scores` (base default = 1):

| Trip | status_eta | status_eta_destino | Resolução | score_final |
|------|-----------|--------------------|-----------|-------------|
| TRIP-A-001 | `ON TIME` (preset) | `EARLY` (preset) | resolveStatus retorna verbatim | base 1 + origem(+1) + destino(−1) = **1** |
| TRIP-B-002 | `''` (vazio) | `''` (vazio) | resolveStatus calcula de datas BR; agendado==realizado em ambos → diff 0 → ON TIME | base 1 + origem(+1) + destino(+1) = **3** |

- `deriveDrivers` → driver `D100`: nome `"MOTORISTA REAL (D100)"`, `pontuacao = 1 + 3 = 4`, `totalViagens = 2` (asserts numéricos exatos).
- Linha NO SHOW (`status_agrupado='NO SHOW'`, `TRIP-NS-003`): `transformSheetNoShowTrips` → `score_final === 0`, `no_show_from_sheet === true`. FECHADA é excluída do transform de NO SHOW.
- O Trip B exercita `parseDateBR` + diff de timezone (agendado e realizado na mesma string de data → offset se cancela), tornando o assert determinístico em qualquer fuso do runner.

## Verificação de paridade (byte-a-byte)

Comparação do blob commitado (`git show HEAD:...ranking.scoring.ts`) vs `dataAdapter.ts` original, contando apenas literais em CÓDIGO (comentários excluídos):

- mojibake `â€"` (bytes `c3 a2 e2 82 ac e2 80 9d`): **4** ocorrências (3 em `transformTrips` status_eta/destino/cpt + 1 em `deriveDrivers.vinculo`) — igual ao original.
- em-dash limpo `—` (bytes `e2 80 94`): **3** ocorrências (`transformSheetNoShowTrips` status_eta/destino/cpt) — igual ao original.
- `Nao atribuido` (ASCII, sem til): **2** ocorrências (driverName fallback nas duas funções de transform) — igual ao original.
- Blob commitado usa LF (sem CRLF) — bytes UTF-8 preservados no repositório.

Nenhuma normalização de encoding aplicada (correção fica para a Phase 8 / UI).

## Decisions Made

- Scoring REUSADO 1:1 (D-V2-04), não reescrito.
- `getRouteBasePoints` como fonte única (anti-drift T-07-13).
- `calcStatusMetrics` exportado (era privado) para teste direto; `deriveBlocks` não portado (stub `[]` sem valor).
- Imports relativos `./ranking.*` (robusto para `bun test`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removido parâmetro de índice não usado no test (TS6133)**
- **Found during:** GREEN (verificação `tsc --noEmit`)
- **Issue:** `noUnusedParameters` do tsconfig acusou `'i' is declared but its value is never read` no `sample.map((s, i) => ...)` do Test 6; `tsc` saía com exit 2 (bloqueava o acceptance).
- **Fix:** Trocado para `sample.map((s) => ...)` — o índice não era usado.
- **Files modified:** api/src/modules/ranking/ranking.scoring.test.ts
- **Verification:** `bun --bun tsc --noEmit` exit 0; `bun test src/modules/ranking/` 16 pass.
- **Committed in:** 16b4752 (commit GREEN)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Ajuste mínimo de lint no arquivo de teste para satisfazer `noUnusedParameters`. Sem mudança de lógica, sem scope creep. Paridade do código portado intacta.

## Issues Encountered

- O Read do `dataAdapter.ts` exibia visualmente `—` nas linhas 185-187, mas a inspeção byte-a-byte revelou mojibake `â€"` (`c3a2 e282ac e2809d`) — DIFERENTE do em-dash limpo (`e28094`) usado nas linhas 226-228 do mesmo arquivo. Resolvido injetando os bytes exatos via UTF-8 explícito (não confiando no encoding do editor), preservando a assimetria do original.

## Threat Model Compliance

- **T-07-04 (Tampering — scoring diverge):** mitigado — teste de paridade com casos numéricos fixos + golden-sample de dados REAIS trava o algoritmo.
- **T-07-13 (Tampering — drift por cópia duplicada):** mitigado — `getRouteBasePoints` em fonte única (`ranking.routes.ts`); acceptance verifica ausência de definição local em `ranking.scoring.ts` (grep). Confirmado: import presente, sem `function getRouteBasePoints` local.
- Nenhuma trust boundary nova (camada 100% pura, sem I/O/rede/credencial).

## User Setup Required

None — camada pura, sem configuração de serviço externo.

## Next Phase Readiness

- Camada pura pronta. Plan 03 (reads) consome `ranking.types.ts` (RouteScoreRecord, *Record) e poderá usar `getRouteBasePoints` de `ranking.routes.ts`.
- Plan 04 (service + endpoints) compõe `transformTrips`/`transformSheetNoShowTrips`/`deriveDrivers` com os reads.
- Wave 1 paralela ao Plan 01: não tocou `package.json`, `.env.example` nem `ranking.supabase.ts` (sem conflito).

## Self-Check: PASSED

- ranking.types.ts — FOUND
- ranking.routes.ts — FOUND
- ranking.scoring.ts — FOUND
- ranking.scoring.test.ts — FOUND
- Commit c538b54 (RED) — FOUND
- Commit 16b4752 (GREEN) — FOUND
- bun test src/modules/ranking/ → 16 pass, exit 0
- bun --bun tsc --noEmit → exit 0
- Paridade byte-a-byte (blob commitado): mojibake x4, em-dash x3, 'Nao atribuido' x2

---
*Phase: 07-ranking-backend*
*Completed: 2026-05-29*
