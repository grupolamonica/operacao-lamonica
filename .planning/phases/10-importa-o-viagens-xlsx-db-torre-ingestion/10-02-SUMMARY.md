---
phase: 10-importa-o-viagens-xlsx-db-torre-ingestion
plan: "02"
subsystem: api/positions
tags: [parser, xlsx, sheetjs, normalizer, tdd, phase10]
dependency_graph:
  requires: []
  provides: [parseViagensXlsx, normalizeMotorista, ParsedPosition]
  affects: [api/src/modules/positions]
tech_stack:
  added: [xlsx@0.18.5]
  patterns: [pure-function parser, in-memory fixture test, NFD accent strip, fixed-offset TZ parse]
key_files:
  created:
    - api/src/modules/positions/viagens.parser.ts
    - api/src/modules/positions/viagens.parser.test.ts
  modified:
    - api/package.json
    - api/bun.lock
decisions:
  - "SheetJS xlsx@0.18.5 pinned (no caret) — matches project pin convention"
  - "Fixed UTC-03 offset for America/Sao_Paulo (Brazil abolished DST in 2019 — safe for current data)"
  - "normalizeMotorista order: trim -> collapse spaces -> NFD strip -> upper (matches Driver.nome in ranking)"
  - "Invalid-date rows silently skipped (best-effort per D-10-05); no throw, no log (T5)"
metrics:
  duration: "~15 min"
  completed: "2026-06-01"
  tasks_completed: 2
  files_created: 2
  files_modified: 2
  tests_passed: 15
---

# Phase 10 Plan 02: Viagens.xlsx Parser (xlsx dep + parser + tests) Summary

**One-liner:** SheetJS parser extracting 125 motorista rows from Viagens.xlsx — cellFormula:false, UTC-03 date parse, NFD motorista_norm — 15 hermetic tests passing.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add xlsx dep + viagens.parser.ts | 5d863b4 | api/package.json, api/bun.lock, api/src/modules/positions/viagens.parser.ts |
| 2 | Hermetic unit tests for parser | 04c1c08 | api/src/modules/positions/viagens.parser.test.ts |

## What Was Built

### api/src/modules/positions/viagens.parser.ts

Exports three public symbols:

- `interface ParsedPosition { motorista, motoristaNorm, dataPosicao, posicaoRaw, veiculo }`
- `normalizeMotorista(nome: string): string` — trim → collapse spaces (`\s+` → ` `) → NFD strip (`normalize('NFD').replace(/[̀-ͯ]/g,'')`) → upper. Produces same form as `Driver.nome` in ranking.types.ts.
- `parseViagensXlsx(buffer: Buffer | ArrayBuffer): ParsedPosition[]` — reads first sheet, skips header (row 0), reads columns 11/14/15/17 (0-based), filters out rows with empty motorista, discards rows with unparseable date, returns rest.

**Security (T2):** `XLSX.read(buffer, { type:'buffer', cellFormula: false, cellHTML: false })` — no formula evaluation, no HTML.
**Security (T5):** no row-value logging anywhere in the parser.

### api/src/modules/positions/viagens.parser.test.ts

15 tests across 5 describe blocks. All use in-memory fixtures via `XLSX.utils.aoa_to_sheet` + `XLSX.write({ type:'buffer' })`. No file system, no network, no DB.

Fixture: 68-column rows with values at indices 11/14/15/17; header + mix of valid motorista, empty/whitespace motorista, invalid-date rows.

Cases proven:
- only-motorista: 3 returned from fixture with 5 rows (2 without motorista excluded)
- motoristaNorm: `'  Adáuto   santos COSTA '` → `'ADAUTO SANTOS COSTA'`
- date TZ: `'31/05/2026 14:30:00'` → `'2026-05-31T17:30:00.000Z'` (UTC-03 applied)
- posicaoRaw: preserved exactly
- veiculo: extracted or null when empty
- invalid date: discards without throwing

## Verification Results

| Check | Result |
|-------|--------|
| `bunx tsc --noEmit` | 0 errors |
| `bun test viagens.parser.test.ts` | 15 pass / 0 fail |
| `grep cellFormula viagens.parser.ts` | Found at line 98 (`cellFormula: false`) |
| `normalizeMotorista` exported | Yes |
| `parseViagensXlsx` exported | Yes |
| `ParsedPosition` exported | Yes |
| No conflict with 10-01 (driver-positions.ts) | Confirmed — only positions/ files touched |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. Parser is complete and ready for the endpoint (Plan 04) to call `parseViagensXlsx(buffer)`.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. Parser is a pure function receiving a buffer. cellFormula:false + cellHTML:false mitigate T-10-02. No row values logged (T-10-05 accepted). T-10-02b (DoS via large file) deferred to endpoint layer (Plan 04) as designed.

## Self-Check: PASSED

- api/src/modules/positions/viagens.parser.ts: EXISTS
- api/src/modules/positions/viagens.parser.test.ts: EXISTS
- Commit 5d863b4: EXISTS (feat(10-02))
- Commit 04c1c08: EXISTS (test(10-02))
