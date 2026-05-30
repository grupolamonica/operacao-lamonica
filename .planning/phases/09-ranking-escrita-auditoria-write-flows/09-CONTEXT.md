# Phase 9: Ranking — Escrita + Auditoria [ WRITE FLOWS ] — Context

**Gathered:** 2026-05-30
**Status:** Ready for planning
**Milestone:** v2.0 · **Depends on:** Phase 8 (UI das 6 abas, read-only) + Phase 7 (contrato `/api/ranking/*`, reads)
**Source:** discuss-phase (advisor `--discuss`) — exploração de código (torre + ride-rank) + verificação empírica de RLS via MCP

<domain>
## Phase Boundary

Adicionar os **fluxos de escrita** do ranking ao Torre via `/api/ranking/*`, proxyados pro Supabase **"Lamonica Ranking"** (`qbwazymqhfunlhnikbla`). Liga os **shells de escrita da Phase 8** (EvaluationFormDialog, unblock, Rotas) a endpoints reais, com **RBAC** e **auditoria antes/depois**. Scoring permanece **derivado no read** (Phase 7) — escrita grava só dados crus + invalida cache.

**Dentro:**
- **Avaliar:** `POST /api/ranking/evaluations` — upsert na tabela `evaluations` (por `trip_id`). CRIAÇÃO se nova, EDIÇÃO se já existe.
- **Auto-bloqueio NO_SHOW:** dentro do flow de avaliar, se `atendeu=false` → insert em `driver_blocks` (`tipo=NO_SHOW`) + log `BLOQUEIO_NO_SHOW`, atômico, server-side. 1 NO_SHOW = bloqueio (réplica).
- **Bloqueio manual / desbloqueio:** `POST /api/ranking/blocks` (manual, log `BLOQUEIO_MANUAL`) e `PATCH /api/ranking/blocks/:id` (unblock → `ativo=false`, `data_fim=now`, `manual_override=true`, log `DESBLOQUEIO`).
- **Config de rotas (CRUD):** `POST` / `PATCH /:id` / `DELETE /:id` em `/api/ranking/route-scores` (cada um loga).
- **Auditoria:** toda mutação grava `evaluation_logs` (`dados_antes`/`dados_depois` jsonb). Novo `GET /api/ranking/logs` (read, atrás de authGuard, qualquer role) — completa a **LogsTab** (shell da Phase 8).
- **UI:** habilitar os controles de escrita da Phase 8 **gated por role** (admin|supervisor): submit do EvaluationFormDialog, botão desbloquear + bloqueio manual na BloqueiosTab, form CRUD da RotasTab. analyst|viewer veem read-only. LogsTab passa a consumir `/logs`.

**Fora:**
- Mudar o scoring (continua derivado no read — Phase 7).
- Reads (Phase 7) e telas read-only (Phase 8).
- Import da `Viagens.xlsx` (Phase 10) e mapa de motoristas (Phase 11).
- Nova credencial Supabase, fechar RLS, real-time/subscription, optimistic UI.

</domain>

<decisions>
## Decisões (travadas — discuss-phase v2.0)

- **D-09-01 (RBAC):** **só `admin` e `supervisor`** escrevem (avaliar, bloquear/desbloquear, CRUD rotas). `analyst` e `viewer` = read-only total. Usar o `requireRole('admin','supervisor')` que **já existe** (`api/src/lib/rbac.ts:34`) em **todo** endpoint de escrita. `GET /logs` fica só sob `authGuard` (qualquer role lê).
- **D-09-02 (Auto-bloqueio):** **réplica exata** do ride-rank — avaliação com `atendeu=false` dispara bloqueio imediato (`driver_blocks` `tipo=NO_SHOW`, `motivo="No-Show na viagem {trip_id}"`, `ativo=true`, `created_by=operador`) + log `BLOQUEIO_NO_SHOW`. **Sem threshold.** Server-side, dentro da transação lógica do avaliar.
- **D-09-03 (Postura de escrita / RLS):** writes vão pra DB Lamonica Ranking via a **anon key atual** (`RANK_SUPABASE_SERVICE_KEY` no env — é anon, RLS confirmada ABERTA via MCP: `cmd=ALL, roles={public}, qual=true, with_check=true` nas 5 tabelas). **RLS fica aberta** (não fechar — o app ride-rank original depende dela). **Único controle de acesso = `requireRole` no torre.** A anon key é **server-side only** (nunca prefixada `VITE_`, nunca no bundle do front). Risco aceito e documentado: quem tiver a anon key escreve direto na DB sem passar pelo torre → mitigado mantendo a key fora do front.
- **D-09-04 (Scoring derivado):** escrita persiste **só os campos crus** da avaliação; pontuação/rank recomputam no próximo read via `composeRanking` (Phase 7). Após qualquer write, **invalidar o cache Redis** do ranking (cache de sheets/trips, TTL 60s da Phase 7) pra o próximo read refletir.
- **D-09-05 (Auditoria em toda mutação):** gravar `evaluation_logs {trip_id, driver_id, driver_name, operador, acao, dados_antes(jsonb), dados_depois(jsonb)}` em: avaliar (`CRIAÇÃO`/`EDIÇÃO`), bloqueio manual (`BLOQUEIO_MANUAL`), auto NO_SHOW (`BLOQUEIO_NO_SHOW`), desbloqueio (`DESBLOQUEIO`), edição de rota (taxonomia análoga). `operador` = usuário torre autenticado (nome se houver no schema users, senão email/id).
- **D-09-06 (Contrato de avaliação):** portar os campos do ride-rank **exatamente** — `trip_id, driver_id, driver_name, comunicacao(BOA|REGULAR|RUIM), atendeu(bool), desvio_rota(NENHUM|LEVE|GRAVE), postura(OK|RUIM), ajuste_manual(int, clamp -20..+20), observacao, operador`. Upsert por `trip_id` (existência decide `CRIAÇÃO` vs `EDIÇÃO` no log).
- **D-09-07 (Superfície de endpoints):** todos sob `/api/ranking`, todos `requireRole('admin','supervisor')` exceto `GET /logs` (`authGuard`):
  - `POST /evaluations` (upsert; dispara auto-block se `atendeu=false`; loga)
  - `POST /blocks` (bloqueio manual; loga `BLOQUEIO_MANUAL`)
  - `PATCH /blocks/:id` (desbloqueio; loga `DESBLOQUEIO`)
  - `POST /route-scores` · `PATCH /route-scores/:id` · `DELETE /route-scores/:id` (cada um loga)
  - `GET /logs` (lê `evaluation_logs`, ordenado desc)
- **D-09-08 (Bug Elysia 1.4.28 body):** POST/PATCH com body schema podem falhar como plugin. Padrão do torre: `users.plugin.ts`/`alerts.plugin.ts` têm POST-com-body **funcionando** em plugin; `geofences`/`telemetry` foram **inlined no `index.ts`** como workaround. Planner: tentar plugin (`ranking.write.plugin.ts`); se o parse de body quebrar, inline no `index.ts` (padrão linhas 204-232). **Acceptance test obriga hit no endpoint live (200 + efeito no DB).**
- **D-09-09 (Invalidação):** após writes, limpar cache Redis do ranking; no front, mutations TanStack Query invalidam as keys `['ranking', ...]` (drivers/trips/blocks/route-scores/stats/logs conforme a ação).
- **D-09-10 (Wiring UI):** habilitar shells da Phase 8 **só pra admin|supervisor** — submit do EvaluationFormDialog, unblock + bloqueio manual na BloqueiosTab, CRUD da RotasTab. Esconder/disable pra analyst|viewer. LogsTab consome `GET /logs`. Role do usuário vem de `useAuth`/contexto já existente no front.

### Claude's Discretion
- Estrutura de módulos: `ranking.writes.ts` (espelha `ranking.reads.ts`), `ranking.audit.ts` (helper de log antes/depois), `ranking.write.plugin.ts` vs inline.
- Upsert via Supabase `.upsert(..., { onConflict: 'trip_id' })`.
- Hooks de mutation (`useEvaluateTrip`, `useBlockDriver`, `useUnblockDriver`, `useRouteScoreMutation`).
- Resolução de `operador` (nome/email/id).
- Validação typebox: `t.Union` p/ enums, clamp do `ajuste_manual`.
- Toast/feedback de sucesso/erro.

</decisions>

<canonical_refs>
## Canonical References — LER ANTES DE PLANEJAR

### ride-rank (lógica de escrita a REPLICAR — caminhos absolutos)
- `C:\Users\antonio.magalhaes\Documents\Projetos\produção\ride-rank-buddy\src\components\EvaluationForm.tsx` (payload de avaliação + bloqueio manual; campos exatos linhas ~39-50, 66-82)
- `...\src\components\BlocksList.tsx` · `RouteScores.tsx` · `EvaluationLogList.tsx`
- `...\src\contexts\DataContext.tsx` (auto-block NO_SHOW linhas ~250-282; log CRIAÇÃO/EDIÇÃO ~245; desbloqueio ~313)
- `...\src\services\supabaseService.ts` (escrita do log ~161-164) · `routeScoreService.ts` (CRUD ~25-41) · `dataAdapter.ts` (scoring derivado ~94-99, 272-275)
- `...\src\integrations\supabase\types.ts` (shapes das tabelas) · `supabase\migrations\20260318192121_*.sql` (DDL + policies "Allow all" RLS)

### Torre backend (padrões a SEGUIR)
- `api/src/lib/rbac.ts` (`authGuard` injeta `{id,role,jti}`; `requireRole(...)` linhas 34-43) — **gate pronto**
- `api/src/modules/ranking/ranking.plugin.ts` (5 GET, `.use(authGuard)` plugin-level) + `ranking.reads.ts` (espelhar p/ writes) + `ranking.supabase.ts` (client; anon key) + `ranking.service.ts` (composeRanking + invalidação de cache) + `ranking.sheets.ts` (cache Redis TTL 60s a invalidar)
- `api/src/index.ts` (padrão de write **inlined**: geofences linhas 204-215, PATCH 216-232; telemetry 174-197 — usar se o bug de plugin bater)
- `api/src/modules/users/users.plugin.ts` (POST-com-body **funcionando em plugin** + `requireRole('admin')` + body typebox linhas 69, 92-115)
- `api/src/db/schema/users.ts` (roles `admin|supervisor|analyst|viewer` linha 9)

### Torre frontend (shells da Phase 8 a LIGAR)
- `torre-de-controle/src/app/pages/ranking/components/EvaluationFormDialog.tsx` · `BloqueiosTab.tsx` · `RotasTab.tsx` · `LogsTab.tsx`
- `torre-de-controle/src/hooks/useRanking.ts` (padrão Eden Treaty + TanStack Query → adicionar mutations)
- `torre-de-controle/src/lib/api.ts` (treaty client) + contexto de auth/role do usuário

### Planning
- `.planning/MILESTONE-v2-ROADMAP.md` (Phase 9) · `.planning/phases/07-ranking-backend/07-04-SUMMARY.md` (contrato) · `.planning/phases/08-ranking-ui/08-*-SUMMARY.md` (shells)

</canonical_refs>

<code_context>
## Existing Code Insights
- **`requireRole` já existe** (rbac.ts:34) → gate de escrita é trivial: `.use(requireRole('admin','supervisor'))`.
- **RLS aberta confirmada via MCP** → anon key atual escreve, sem service_role.
- **Scoring derivado** → writes são inserts simples + bust de cache; nenhuma coluna de score pra atualizar.
- `evaluation_logs` é a auditoria; a **LogsTab (Phase 8) já renderiza `renderDiff(dados_antes, dados_depois)`** — só falta o endpoint `/logs` + a escrita do log.
- Bug Elysia 1.4.28: writes podem precisar inline no `index.ts` (geofences/telemetry são o precedente).
- `ranking.reads.ts` é o template estrutural pra `ranking.writes.ts`.

</code_context>

<threat_model>
## Security (ASVS-oriented)
- **T1 escrita não-autorizada:** todo endpoint de escrita sob `requireRole('admin','supervisor')` (403 caso contrário). authGuard valida JWT + blacklist Redis.
- **T2 exposição da anon key:** key **server-side only**, nunca `VITE_`-prefixada, nunca logada (Phase 7 já garante). Não chega ao bundle.
- **T3 RLS aberta (risco aceito):** qualquer um com a anon key escreve direto na DB sem passar pelo torre. Mitigação: key fora do front; controle no torre. Documentado em D-09-03.
- **T4 auditoria ausente/adulterada:** toda mutação grava `evaluation_logs` (antes/depois) na mesma operação; falha de log deve falhar a operação (ou logar best-effort + alertar — discrição do planner, mas registrar a escolha).
- **T5 injeção via campos de avaliação:** validar enums com `t.Union` (comunicacao/desvio_rota/postura), clamp `ajuste_manual` a [-20,20], tamanho de `observacao`.
</threat_model>

<deferred>
## Deferred
- Phase 10: import `Viagens.xlsx` → DB. Phase 11: mapa de motoristas.
- Optimistic UI, real-time subscription, fechar RLS + service_role, RBAC mais granular (analyst escrevendo).
</deferred>

---

*Phase: 09-ranking-escrita-auditoria-write-flows · Milestone v2.0 · Context 2026-05-30 via discuss-phase (advisor)*
