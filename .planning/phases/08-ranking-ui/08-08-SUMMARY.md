---
phase: 08-ranking-ui
plan: 08
subsystem: ui
tags: [react, ranking, audit-log, datatable, tanstack-table, shadcn, eden-treaty]

# Dependency graph
requires:
  - phase: 08-ranking-ui (08-01)
    provides: hooks useRanking + re-export dos tipos do contrato Phase 7
  - phase: 08-ranking-ui (08-02)
    provides: fixMojibake (helper de display)
  - phase: 08-ranking-ui (08-03)
    provides: shell /ranking + shadcn Tabs montando o stub LogsTab
  - phase: 07-ranking-backend (07-04)
    provides: contrato fixado (5 endpoints, EvaluationLogRecord) — confirma ausencia de /logs
provides:
  - "Aba Logs (PHASE8-TAB-LOGS) como shell de auditoria no design Torre: DataTable com Data/Hora, Acao, Viagem, Motorista, Operador, Detalhes (diff antes/depois)"
  - "renderDiff() pronto para os dados reais da Phase 9 (texto JSX auto-escapado, sem dangerouslySetInnerHTML)"
  - "Estado vazio informativo + aviso de habilitacao na Phase 9 (leitura de evaluation_logs)"
affects: [09-ranking-write, phase-9-audit-logs]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tab-shell honesto: tabela + render PRONTOS alimentados por array vazio quando o endpoint ainda nao existe (sem inventar hook/fetch); Phase 9 troca 1 linha (const logs = []) por um hook"
    - "ActionBadge com cor inline (tom Argon via vars + tailwind) porque a Badge shadcn nao tem variante success — mesmo padrao do DriverStatusBadge (RankingTab)"
    - "Mapeamento de id estavel (log.id ?? `${trip_id}-${i}`) para satisfazer o constraint T extends { id: string } da DataTable compartilhada"

key-files:
  created: []
  modified:
    - torre-de-controle/src/app/pages/ranking/components/LogsTab.tsx

key-decisions:
  - "EvaluationLogRecord importado por path relativo do contrato (../../../../../../api/.../ranking.types) com import type — mesmo padrao tipo-do-contrato de useRanking.ts; NAO re-exportei em useRanking.ts (08-01) para manter o escopo Wave 3 estrito (so LogsTab.tsx)"
  - "logs = [] fixo nesta fase — endpoint de leitura de evaluation_logs e Phase 9 (MILESTONE-v2-ROADMAP); aba NAO chama API, NAO cria useRankingLogs, NAO faz fetch"
  - "renderDiff calcula uniao das chaves de dados_antes/dados_depois, omite trip_id/driver_id/driver_name/operador (mostradas em colunas proprias), e exibe `chave: antes -> depois` (line-through vermelho -> verde) ou `chave: valor` quando so ha depois"

patterns-established:
  - "Shell de aba alimentado por dado vazio + aviso de fase futura: entrega a UI completa de forma honesta com o contrato disponivel sem stubs de dado mock"

requirements-completed: [PHASE8-TAB-LOGS]

# Metrics
duration: ~8min
completed: 2026-05-30
---

# Phase 8 Plan 08: aba Logs (shell de auditoria) Summary

**Aba Logs recriada no design Torre como shell honesto — DataTable de auditoria (Data/Hora, Acao, Viagem, Motorista, Operador, Detalhes com diff antes/depois) e renderDiff prontos, alimentados por array vazio com aviso de que a leitura de evaluation_logs chega na Phase 9; sem inventar endpoint, hook ou fetch.**

## Performance

- **Duration:** ~8 min
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Substituido o stub do 08-03 por uma DataTable de auditoria no padrao Torre (PanelCard via DataTable, ColumnDef do TanStack Table), recriando as 6 colunas do EvaluationLogList do ride-rank.
- `renderDiff(dados_antes, dados_depois)` implementado e pronto para a Phase 9: render como texto JSX (auto-escape do React), uniao de chaves, omissao das chaves de identificacao, formato `antes -> depois` ou `valor`.
- `ActionBadge` recriado no tom Argon (CRIACAO verde / EDICAO azul / DESBLOQUEIO ambar / default outline), aceitando variantes com e sem acento.
- Estado vazio explicito + subtitle avisando que a auditoria sera habilitada na Phase 9 (evaluation_logs).
- Mantida a honestidade do contrato: nenhuma chamada a `/api/ranking/logs` (inexistente no Phase 7), nenhum `useRankingLogs`, nenhum `fetch`.

## Task Commits

1. **Task 1: LogsTab — shell de auditoria (colunas + diff) com estado vazio + aviso Phase 9** - `f9f74a9` (feat)

**Plan metadata:** `<pending>` (docs: complete plan)

## Files Created/Modified
- `torre-de-controle/src/app/pages/ranking/components/LogsTab.tsx` - Shell de auditoria: DataTable (6 colunas), ActionBadge tom Argon, renderDiff antes/depois, estado vazio + aviso Phase 9. Read-only por natureza.

## Decisions Made
- **Import do tipo por path relativo (nao re-export):** o plano permitia re-exportar `EvaluationLogRecord` em useRanking.ts (08-01) "se conveniente", mas o escopo declarado da Wave 3 (`files_modified`) lista apenas `LogsTab.tsx` e a instrucao foi "nao tocar outras abas/arquivos". Optei pelo `import type` relativo do contrato (`../../../../../../api/src/modules/ranking/ranking.types`) — mesmo padrao tipo-do-contrato ja usado por `useRanking.ts` — mantendo o escopo estrito e zero runtime (type-only).
- **logs = [] fixo:** o modulo ranking do Phase 7 expoe so 5 endpoints (drivers/trips/blocks/route-scores/stats — confirmado em useRanking.ts e 07-04). A leitura de `evaluation_logs` e Phase 9. A aba monta tudo e alimenta vazio; a Phase 9 troca 1 linha por um hook.
- **ActionBadge cor inline:** a Badge shadcn do Torre nao tem variante `success`; reusei a abordagem de cor inline (CSS vars + tailwind) do DriverStatusBadge (RankingTab) em vez de criar variantes novas.

## Deviations from Plan

None - plan executed exactly as written. (Escopo READ-ONLY respeitado: sem POST/PATCH/DELETE, sem fetch, sem endpoint inventado.)

## Issues Encountered
None.

## Threat Model Compliance
- **T-08-15 (Tampering/XSS no renderDiff):** mitigado — diff renderizado como texto JSX (auto-escape do React) e valores objeto via `JSON.stringify`; `dangerouslySetInnerHTML` ausente (grep = 0). `fixMojibake` aplicado em `driver_name` (texto puro).
- **T-08-16 (Information Disclosure):** aceito nesta fase — a aba nao busca dado nenhum (shell vazio); a leitura ficara atras do authGuard na Phase 9.

## Known Stubs
- `const logs: EvaluationLogRecord[] = []` em `LogsTab.tsx` e um stub de DADO intencional e documentado: o endpoint de leitura de `evaluation_logs` e Phase 9 (MILESTONE-v2-ROADMAP). A UI (tabela + diff) esta completa; a Phase 9 substitui essa linha por um hook de dados. Nao bloqueia o objetivo do plano (entregar o shell honesto da 6a aba).

## Verification
- `npm run build` (tsc -b && vite build) — exit 0. 3160 modulos transformados; chunk `RankingPage-r_6qhF5y.js` gerado incluindo o LogsTab.
- grep: zero `api.api.ranking` / `fetch(` no arquivo; ocorrencias de "logs"/"useRankingLogs" sao apenas comentarios documentando a ausencia.
- grep: aviso "Phase 9" presente; colunas Data/Hora/Acao/Viagem/Motorista/Operador/Detalhes presentes; `renderDiff`/`dados_antes`/`dados_depois` presentes; `export function LogsTab` presente; `dangerouslySetInnerHTML` ausente.

## Next Phase Readiness
- 6a aba (Logs) entregue — escopo D-V2-03 "todas as 6 abas" coberto para esta wave.
- **Phase 9:** plugar o hook de logs (`GET /api/ranking/logs` + `useRankingLogs`) e trocar `const logs = []` pelo retorno do hook; tabela e renderDiff ja prontos. RBAC de leitura atras do authGuard.

---
*Phase: 08-ranking-ui*
*Completed: 2026-05-30*
