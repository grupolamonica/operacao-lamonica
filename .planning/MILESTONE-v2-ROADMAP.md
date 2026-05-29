# Milestone v2.0 — Ranking de Motoristas + Importação de Frota

**Criado:** 2026-05-29
**Base:** v1.0 completo (6 fases, deployado). Esta milestone adiciona 2 features.
**Origem:** porta a feature de ranking do projeto `ride-rank-buddy` (em `C:\Users\antonio.magalhaes\Documents\Projetos\produção\ride-rank-buddy`) para dentro do Torre, + importação de posições de frota via planilha.

---

## Decisões travadas (discussão 2026-05-29)

- **D-V2-01 — Acesso aos dados de ranking:** o front do Torre lê **direto do Supabase do ride-rank** (`vrlhfgfyjvkzfnafibnc`). Os serviços TS são **portados** para `torre-de-controle/` e usam um **client Supabase separado** (env próprio). Backend do ranking **fica separado** — não entra na API Elysia do Torre.
- **D-V2-02 — Fonte das viagens do ranking:** mesma **planilha Google Sheets** que o ride-rank usa hoje (`sheetsService` mantido). *(Prereq: URL + credencial do Sheets.)*
- **D-V2-03 — Escopo das telas:** **todas as 6 abas** (Ranking, Viagens, Qualidade, Bloqueios, Rotas, Logs) + StatsCards + filtros + modais, **redesenhadas no padrão Torre** (PanelCard, DataTable, Chart.js/Argon — substitui shadcn/Recharts do ride-rank).
- **D-V2-04 — Cálculo do ranking:** reusar a lógica **client-side** do `dataAdapter.ts` (score = pontos-base da rota + ETA origem/destino; por motorista = soma + ajuste manual; ordena desc). Sem reescrever o algoritmo.
- **D-V2-05 — Planilha Viagens.xlsx = fonte de IMPORT apenas:** parsear posição + campos necessários, **geocodar** o texto de posição → lat/lng, e **salvar no banco do Torre** (`torre-controle-prod`). O mapa consulta o **DB do Torre**, nunca o xlsx. Import por **upload manual** (recorrente); no futuro a fonte muda (ex: API do TMS) mantendo o mesmo contrato de DB.
- **D-V2-06 — Auth:** as telas de ranking ficam atrás do auth existente do Torre (JWT cookie). Escrita (avaliações/bloqueios/rotas) restrita a `admin|supervisor|analyst`.

## Pré-requisitos (user-setup, bloqueiam execução)

1. **Supabase ride-rank** (`vrlhfgfyjvkzfnafibnc`): `service_role` key **ou** credenciais Supabase Auth — o anon key só expõe a tabela `drivers` (RLS bloqueia evaluations/blocks/route_scores).
2. **Google Sheets**: URL da planilha de viagens + método de acesso (API key / service account) que o `sheetsService` usa.

---

## Feature A — Ranking de Motoristas no Torre

### Phase 7 — Ranking: camada de dados (read-only)
**Goal:** Torre consegue ler e computar o ranking a partir das fontes do ride-rank, sem UI ainda.
**Entregas:**
- Portar serviços TS para `torre-de-controle/src/features/ranking/services/`: `dataAdapter.ts`, `supabaseService.ts`, `routeScoreService.ts`, `vinculoService.ts`, `sheetsService.ts` + tipos (`Trip`, `Driver`, `Block`, `EvaluationRecord`, ...).
- Client Supabase separado: `src/features/ranking/lib/rankSupabase.ts` (env `VITE_RANK_SUPABASE_URL` / `VITE_RANK_SUPABASE_ANON_KEY` ou service via proxy).
- Fonte Google Sheets configurada (env do Sheets).
- Hook `useRanking()` (TanStack Query) expondo `{ drivers ranked, trips, blocks, routeScores, stats }`.
**Sucesso:** ranking computado no Torre bate com o app original (paridade de pontuação numa amostra). Build + tsc limpos.
**Depende de:** Pré-req 1 e 2.

### Phase 8 — Ranking: UI (6 abas, design Torre)
**Goal:** rota `/ranking` no Torre com as 6 abas funcionando (leitura).
**Entregas:**
- Item "Ranking" no sidebar Argon + rota lazy `/ranking`.
- Layout com Tabs (shadcn `tabs.tsx` já existe) + `StatsCards` (4 KPIs no padrão KPICard).
- Abas: **Ranking** (DataTable ordenável), **Viagens** (DataTable + botão avaliar), **Qualidade** (Chart.js bar + listas), **Bloqueios** (DataTable + ação), **Rotas** (form/tabela), **Logs** (DataTable + diff).
- Filtros: data (DateRangePicker reuso), vínculo, rota, ocorrência, import de motoristas.
- Modais `DriverDetails` + `EvaluationForm` (shadcn Dialog + Form já no Torre).
- Todos os cards via **PanelCard** (padrão v1.0).
**Sucesso:** as 6 abas renderizam dados reais no design Torre; filtros funcionam; zero erros console.
**Depende de:** Phase 7.

### Phase 9 — Ranking: escrita + auditoria
**Goal:** operadores avaliam, bloqueiam/desbloqueiam e configuram rotas pela UI do Torre.
**Entregas:**
- `EvaluationForm` grava em `evaluations` (upsert) + cria `evaluation_logs`.
- Bloqueio automático NO_SHOW + bloqueio/desbloqueio manual (`driver_blocks`).
- Config de `route_scores` (CRUD).
- Aba Logs lendo auditoria.
- RBAC: escrita só `admin|supervisor|analyst` (D-V2-06).
**Sucesso:** fluxo avaliar→pontuar→bloquear→desbloquear funciona end-to-end; auditoria registra antes/depois.
**Depende de:** Phase 8.

---

## Feature B — Importação de Frota via planilha → mapa

### Phase 10 — Import Viagens.xlsx → banco do Torre
**Goal:** transformar a planilha em dados persistidos + geocodados no DB do Torre.
**Entregas:**
- Endpoint Elysia `POST /api/import/viagens` (multipart upload do .xlsx) — parse server-side (lib xlsx/sheetjs no Bun).
- Extrai por linha com Motorista+Posição (~125): motorista, placa/veículo, status viagem, texto de posição, timestamp.
- **Geocoding** do texto Posição → lat/lng (nível cidade/UF: parse `/(UF)$` + cidade → centroide via tabela BR local ou Nominatim com cache em Redis). Guarda também o texto original + precisão.
- Persiste no DB do Torre: upsert em `drivers` (lat/lng/updatedAt) + tabela nova `fleet_imports`/`imported_positions` (motorista, placa, lat, lng, posição_texto, status, capturado_em, fonte='xlsx', precisão).
- Idempotente (re-upload atualiza por placa/motorista).
- UI de upload (Configurações > Importar, ou página dedicada) com preview + resultado (quantos geocodados/falhados).
**Sucesso:** upload da Viagens.xlsx grava ~125 posições geocodadas no DB; re-upload é idempotente.
**Depende de:** —  (independente da Feature A; usa DB do Torre que já existe).

### Phase 11 — Mapa: frota importada
**Goal:** ver no mapa do Torre os motoristas importados que têm localização.
**Entregas:**
- LiveMap (ou um layer/fonte "Frota importada") lê as posições importadas do DB do Torre.
- Marcadores dos ~125 motoristas com cor por status de viagem + popup (motorista, placa, status, posição-texto, horário).
- Filtro: só motoristas com localização; toggle camada.
- (Mantém o simulador/telemetria real-time existente como camada separada.)
**Sucesso:** mapa mostra os motoristas da planilha geocodados; popup com dados; alterna camadas.
**Depende de:** Phase 10.

---

## Riscos / notas

- **Geocoding aproximado:** posição é texto sem GPS → precisão nível cidade. Documentar no popup ("posição aproximada"). Landmark-level fica como melhoria futura.
- **Service_role key no front:** se usar service_role direto no browser é inseguro. Mitigação: usar Supabase Auth (login) + RLS, OU proxiar leitura sensível pela API Elysia. Decidir na Phase 7 conforme a credencial fornecida.
- **Recharts → Chart.js:** o ride-rank usa Recharts; Torre padronizou Chart.js. Recriar os gráficos (não copiar).
- **Mesmo stack** (React/Vite/Tailwind/shadcn/Supabase/TanStack) torna o port de lógica quase 1:1; o esforço é a UI.

---

*Próximo passo:* `/gsd-plan-phase 7` (após fornecer os 2 pré-requisitos) para detalhar a primeira fase.
