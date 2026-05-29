# Milestone v2.0 — Ranking de Motoristas + Importação de Frota

**Criado:** 2026-05-29
**Base:** v1.0 completo (6 fases, deployado). Esta milestone adiciona 2 features.
**Origem:** porta a feature de ranking do projeto `ride-rank-buddy` (em `C:\Users\antonio.magalhaes\Documents\Projetos\produção\ride-rank-buddy`) para dentro do Torre, + importação de posições de frota via planilha.

---

## Decisões travadas (discussão 2026-05-29)

- **D-V2-01 — Acesso aos dados de ranking (PROXY via Elysia):** a API Elysia do Torre ganha um **módulo `ranking`** que guarda a credencial do Supabase do ride-rank (`vrlhfgfyjvkzfnafibnc`, **`service_role` server-side**) e expõe `/api/ranking/*`. O front do Torre consome via **Eden Treaty** (mesmo padrão dos outros módulos, usa o auth-cookie do Torre — sem 2º login). A lógica de scoring (`dataAdapter`) é **portada para o servidor** (TS no Elysia). O **dado** continua externo no Supabase do ride-rank — o Torre só lê/repassa; nada de ranking é migrado pro DB do Torre. *(Atualizado da discussão: escolhido proxy em vez de acesso direto no browser, pra não expor a key e evitar 2º login.)*
- **D-V2-02 — Fonte das viagens do ranking:** mesma **planilha Google Sheets** que o ride-rank usa hoje (`sheetsService` mantido). *(Prereq: URL + credencial do Sheets.)*
- **D-V2-03 — Escopo das telas:** **todas as 6 abas** (Ranking, Viagens, Qualidade, Bloqueios, Rotas, Logs) + StatsCards + filtros + modais, **redesenhadas no padrão Torre** (PanelCard, DataTable, Chart.js/Argon — substitui shadcn/Recharts do ride-rank).
- **D-V2-04 — Cálculo do ranking:** reusar a lógica **client-side** do `dataAdapter.ts` (score = pontos-base da rota + ETA origem/destino; por motorista = soma + ajuste manual; ordena desc). Sem reescrever o algoritmo.
- **D-V2-05 — Planilha Viagens.xlsx = fonte de IMPORT apenas:** parsear posição + campos necessários, **geocodar** o texto de posição → lat/lng, e **salvar no banco do Torre** (`torre-controle-prod`). O mapa consulta o **DB do Torre**, nunca o xlsx. Import por **upload manual** (recorrente); no futuro a fonte muda (ex: API do TMS) mantendo o mesmo contrato de DB.
- **D-V2-06 — Auth:** as telas de ranking ficam atrás do auth existente do Torre (JWT cookie). Escrita (avaliações/bloqueios/rotas) restrita a `admin|supervisor|analyst`.

## Pré-requisitos (user-setup, bloqueiam execução)

1. **Supabase ride-rank** (`vrlhfgfyjvkzfnafibnc`): **`service_role` key** (Dashboard → Settings → API). Fica **só no servidor** (env do Elysia), nunca no browser. Necessária porque o anon só lê `drivers` (RLS bloqueia o resto).
2. ~~Google Sheets~~ ✅ **resolvido** — o `sheetsService` busca um **CSV público** (sheet ID `1MWTiaXU3HXW_iVn-n70WSk3o8rcHTRrQP2ac07W9cCU`, tab `DBLHHISTORICO`) via gviz, **sem credencial**. Só confirmar que a planilha continua compartilhada como "qualquer um com o link pode ver".

---

## Feature A — Ranking de Motoristas no Torre

### Phase 7 — Ranking: módulo backend Elysia (read-only)
**Goal:** a API Elysia do Torre lê e computa o ranking a partir das fontes do ride-rank (Supabase + Sheets CSV), exposto via `/api/ranking/*`.
**Entregas:**
- Módulo `api/src/modules/ranking/`: client Supabase ride-rank server-side (`@supabase/supabase-js`, `service_role` via env `RANK_SUPABASE_URL`/`RANK_SUPABASE_SERVICE_KEY`).
- Portar serviços TS pro servidor: `dataAdapter.ts` (scoring `calculateTripScore`/`deriveDrivers`/métricas), `supabaseService.ts` (reads de `evaluations/driver_blocks/route_scores/drivers`), `routeScoreService.ts`, `sheetsService.ts` (fetch do CSV público gviz — sheet ID `1MWTiaXU3HXW...`/`DBLHHISTORICO`, **sem credencial**) + tipos.
- Endpoints read: `GET /api/ranking/drivers` (ranked + stats), `/trips`, `/blocks`, `/route-scores`, `/stats` — atrás do `authGuard` do Torre. Cache Redis curto (ex 60s) no fetch do Sheets.
- Tipos exportados via Eden Treaty (`App`) pro front.
**Sucesso:** `GET /api/ranking/drivers` retorna ranking computado batendo com o app original (paridade numa amostra). `bun tsc` limpo. Smoke test do endpoint.
**Depende de:** Pré-req 1 (service_role key ride-rank). *(Sheets não precisa credencial.)*

### Phase 8 — Ranking: UI (6 abas, design Torre)
**Goal:** rota `/ranking` no Torre com as 6 abas funcionando (leitura), consumindo `/api/ranking/*` via Eden Treaty + TanStack Query.
**Entregas:**
- Item "Ranking" no sidebar Argon flutuante + rota lazy `/ranking`.
- Hooks `useRanking*()` (Eden Treaty → `/api/ranking/*`, mesmo padrão de `useTrips`).
- Layout com Tabs (shadcn `tabs.tsx`) + `StatsCards` (4 KPIs no padrão KPICard).
- Abas: **Ranking** (DataTable ordenável), **Viagens** (DataTable + botão avaliar), **Qualidade** (Chart.js bar + listas), **Bloqueios** (DataTable + ação), **Rotas** (form/tabela), **Logs** (DataTable + diff).
- Filtros: data (DateRangePicker reuso), vínculo, rota, ocorrência, import de motoristas.
- Modais `DriverDetails` + `EvaluationForm` (shadcn Dialog + Form já no Torre).
- Todos os cards via **PanelCard** (padrão v1.0). Recharts→Chart.js.
**Sucesso:** as 6 abas renderizam dados reais no design Torre; filtros funcionam; zero erros console.
**Depende de:** Phase 7.

### Phase 9 — Ranking: escrita + auditoria
**Goal:** operadores avaliam, bloqueiam/desbloqueiam e configuram rotas pela UI do Torre (writes via `/api/ranking/*` POST/PATCH → Supabase ride-rank).
**Entregas:**
- Endpoints write no módulo ranking: `POST /api/ranking/evaluations` (upsert + cria `evaluation_logs`), `POST/DELETE /api/ranking/blocks`, CRUD `/api/ranking/route-scores`.
- `EvaluationForm` grava avaliação; bloqueio automático NO_SHOW + bloqueio/desbloqueio manual (`driver_blocks`).
- Aba Logs lendo `evaluation_logs`.
- RBAC: escrita só `admin|supervisor|analyst` (D-V2-06) via `requireRole` do Torre.
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
