# Phase 10: Importação Viagens.xlsx → DB Torre [ INGESTION ] — Context

**Gathered:** 2026-05-30
**Status:** Ready for planning
**Milestone:** v2.0 · **Depends on:** — (independente; consome auth/DB/PostGIS já existentes)
**Source:** discuss-phase (advisor `--discuss`) — inspeção real da planilha (openpyxl) + decisões do usuário

<domain>
## Phase Boundary

**Endpoint de upload** do `.xlsx` (export do sistema de rastreamento) que parseia as linhas com motorista, **geocoda** o texto de posição (cidade/UF) e **salva no DB do Torre** com **histórico** e idempotência. A planilha é só fonte de import — no futuro as posições são consultadas de outra forma (Phase 11 = mapa).

**Estrutura real da planilha** (`C:\Users\antonio.magalhaes\Downloads\Viagens.xlsx`, inspecionada):
- 1540 linhas totais, **exatamente 125 com Motorista** (125 motoristas distintos, 1 linha cada). Nomes batem com os do ranking (ex.: "ADAUTO SANTOS COSTA").
- Colunas-chave: **col15 Motorista** · **col16 Data Posição** (ts `dd/MM/yyyy HH:mm:ss`) · **col18 Posição** (texto livre, ex.: `"0.03 Km - POSTO J REIS - ENTRE RIOS BA"`) · **col12 Veículo** (placa) · col19 Estado (VAZIO — UF sai do texto da Posição).
- **Posição NÃO tem lat/lng** — é referência textual terminando em cidade + UF. Geocoding obrigatório.

**Dentro:**
- `POST` multipart de upload do `.xlsx` (admin), parse das 125 linhas com motorista.
- Geocoding fuzzy do texto da Posição → cidade/UF/lat/lng, com **cache**.
- Persistência no DB Torre: tabela nova `driver_positions` com **PostGIS `geometry(Point,4326)`** + histórico.
- Idempotência: re-upload do mesmo arquivo não duplica (chave motorista+data_posicao).
- Resposta com contagem inserted/skipped/failed + amostra.

**Fora:**
- **Mapa / visualização** das posições (Phase 11, maplibre).
- Match posições ↔ motoristas do ranking (Phase 11; aqui só guardamos nome normalizado p/ habilitar o join futuro).
- Telemetria GPS em tempo real (track separado — Phase 6 telemetry).
- Geocoding de precisão de rua/GPS (granularidade é cidade/UF).
</domain>

<decisions>
## Decisões (travadas — discuss-phase v2.0)

- **D-10-01 (Geocoding = Nominatim/OSM fuzzy + cache):** geocoda o **texto completo da Posição** via Nominatim (tolera bagunça, resolve "...ENTRE RIOS BA" → cidade/UF/lat/lng), granularidade cidade/UF. **Cache obrigatório** (tabela `geocode_cache` keyed pela query string) → import checa cache antes; só bate no Nominatim em miss. Respeita ToS: **User-Agent custom**, **rate-limit ~1 req/s sequencial**, sem uso em massa. ~125 rows ≈ 2min no 1º import, ~0 nos seguintes. **Best-effort:** se o geocode falhar, grava a linha com raw + geom NULL (flag `geocoded=false`), NÃO falha o import inteiro.
- **D-10-02 (Schema geo = PostGIS Point):** coluna `geom geometry(Point,4326)` na tabela `driver_positions`, igual às geofences (Phase 6). **Migração via SQL MANUAL** (padrão `api/drizzle/postgis-manual.sql`) — NÃO drizzle-kit push (dropa o geom; ver MEMORY: reconciliar via psql). Guardar também `lat`/`lng` numeric redundantes p/ leitura simples no front (maplibre).
- **D-10-03 (RBAC + histórico):** endpoint `requireRole('admin')` (ingestão é op de admin). **Mantém HISTÓRICO** — cada import APPENDA linhas (posições por motorista ao longo do tempo).
- **D-10-04 (Idempotência):** chave `UNIQUE(motorista_norm, data_posicao)` → upsert `ON CONFLICT DO NOTHING` (ou update do geom se re-geocodado). Re-upload do MESMO arquivo = 0 novas linhas (mesmos timestamps); export NOVO (timestamps novos) = linhas novas. Reconcilia "idempotente" (roadmap) + "histórico" (usuário).
- **D-10-05 (Parse):** só linhas com Motorista não-vazio (125). Parser **SheetJS (`xlsx`)** ou `exceljs` (Claude's discretion — adicionar dep ao `api`). `read_only`/`data_only` semântico (sem avaliar fórmulas). Campos extraídos: motorista, data_posicao (parse `dd/MM/yyyy HH:mm:ss` → timestamptz, TZ America/Sao_Paulo), posicao_raw, veiculo (placa) + geocode (cidade, uf, lat, lng, geom). Guardar SEMPRE o raw mesmo sem geocode.
- **D-10-06 (Nome normalizado p/ join futuro):** guardar `motorista` as-is + `motorista_norm` (upper, trim, strip-acentos) — habilita o match com os motoristas do ranking (que usam `nome`) na Phase 11. Sem FK agora (DBs distintos: Torre vs ride-rank Supabase).
- **D-10-07 (Endpoint shape):** `POST /api/positions/import` (ou `/api/ingest/viagens`) multipart `file`; requireRole('admin'); retorna `{ inserted, skipped, failed, total, sample[] }`. Bug Elysia body/multipart → tentar plugin; fallback inline no `index.ts` (padrão geofences/telemetry). Acceptance testa o endpoint live (upload → linhas no DB).
- **D-10-08 (Geocode cache table):** `geocode_cache { query text PK, lat, lng, cidade, uf, display_name, provider, created_at }`. Idempotência de geocoding + ToS-friendly + re-import rápido.
</decisions>

<canonical_refs>
## Canonical References — LER ANTES DE PLANEJAR

### Planilha (fonte — inspecionada via openpyxl)
- `C:\Users\antonio.magalhaes\Downloads\Viagens.xlsx` — aba "Página1", 1540 linhas, 125 c/ Motorista. Cols: 15=Motorista, 16=Data Posição (`dd/MM/yyyy HH:mm:ss`), 18=Posição (texto livre c/ cidade+UF no fim), 12=Veículo, 19=Estado (vazio). 68 colunas no total (resto = contexto da viagem, fora de escopo).

### Torre backend (padrões a SEGUIR)
- `api/drizzle/postgis-manual.sql` — padrão PostGIS (CREATE EXTENSION postgis + coluna geom + GIST index, NÃO drizzle-managed). **Replicar p/ driver_positions.**
- `api/src/index.ts` — geofences inline POST (~204-232) + telemetry (~174-197): padrão de write inline + (telemetry) ingestão. Multipart/file upload: ver como o body é lido.
- `api/src/lib/rbac.ts` — `requireRole('admin')`.
- `api/src/db/schema/*.ts` (padrão de tabela Drizzle) + `api/src/db/client.ts` (postgres.js/Drizzle) + `api/drizzle/` (migrations).
- `api/src/modules/ranking/ranking.types.ts` — `Driver.nome` (formato dos nomes do ranking p/ o `motorista_norm` join futuro).

### Geocoding
- Nominatim usage policy: https://operations.osmfoundation.org/policies/nominatim/ (User-Agent obrigatório, 1 req/s, sem bulk). Endpoint: `https://nominatim.openstreetmap.org/search?q=<texto>&format=json&countrycodes=br&limit=1&addressdetails=1`.

### Infra/DB
- Torre Supabase `torre-controle-prod` (ocgifdytaqlubuokjkwv, sa-east-1) — **tem PostGIS** (Phase 6). MEMORY: DB local `torre_controle` defasa o schema; reconciliar via psql, NÃO db:push (dropa geom).

### Planning
- `.planning/ROADMAP.md` / `.planning/MILESTONE-v2-ROADMAP.md` (Phase 10 goal) · Phase 6 geofences (PostGIS) como análogo mais próximo.
</canonical_refs>

<code_context>
## Existing Code Insights
- **PostGIS já está no Torre** (geofences) → reusar o padrão de SQL manual (postgis-manual.sql) p/ a coluna geom de driver_positions.
- **requireRole('admin')** pronto (rbac.ts).
- Bug Elysia 1.4.28 body/multipart → padrão inline no index.ts (geofences/telemetry) é o fallback conhecido.
- Os 125 nomes de motorista batem com os `nome` do ranking → `motorista_norm` habilita o mapa da Phase 11 a cruzar posição × ranking.
- MEMORY (drift do DB local): aplicar schema via psql/SQL manual, NUNCA db:push (PostGIS geom seria dropado).
</code_context>

<threat_model>
## Security (ASVS-oriented)
- **T1 import não-autorizado:** `requireRole('admin')` no endpoint (403 caso contrário); authGuard valida JWT.
- **T2 xlsx malicioso:** limite de tamanho do upload, parse `data_only` (sem avaliar fórmulas → evita formula/CSV injection), cap de linhas processadas, validar extensão/mime.
- **T3 abuso do Nominatim (ToS):** rate-limit 1/s sequencial, User-Agent custom, cache-first (só bate em miss), sem bulk. Falha de geocode = best-effort (não derruba o import).
- **T4 injeção SQL/geo:** inserts parametrizados (Drizzle/postgres.js), `ST_SetSRID(ST_MakePoint($lng,$lat),4326)` com binds; validar lat∈[-90,90], lng∈[-180,180] antes de gravar geom.
- **T5 PII (nomes + localização):** não logar valores das linhas; dados já internos ao sistema. Cache de geocode não guarda PII (só query→coord).
</threat_model>

<deferred>
## Deferred (Phase 11+)
- Mapa maplibre com as posições dos motoristas; match posição × motorista do ranking por `motorista_norm`.
- Telemetria GPS em tempo real (track separado).
- Geocoding de precisão de rua; reverse-geocode; histórico visualizado em timeline.
</deferred>

---

*Phase: 10-importa-o-viagens-xlsx-db-torre-ingestion · Milestone v2.0 · Context 2026-05-30 via discuss-phase (advisor)*
