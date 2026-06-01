# Phase 11: Mapa — Frota Importada [ GEOSPATIAL ] — Context

**Gathered:** 2026-05-30
**Status:** Ready for planning
**Milestone:** v2.0 (ÚLTIMA fase) · **Depends on:** Phase 10 (driver_positions geocodado) + Phase 7 (ranking proxy)
**Source:** discuss-phase (advisor `--discuss`) — inspeção do LiveMap existente + decisões do usuário

<domain>
## Phase Boundary

Adicionar uma **camada toggleável "frota importada"** ao **LiveMap existente** mostrando as posições geocodadas da planilha (Phase 10), com **marcadores em ícone de caminhão** coloridos por **status do ranking** (join por nome) e **popup** com info do motorista. Encerra o milestone v2.0 conectando posições (Phase 10) × ranking (Phase 7-9) no mapa.

**Estado herdado (Phase 10):** tabela `driver_positions` no Supabase Torre — 125 linhas, **69 geocodadas** (geom Point 4326 + lat/lng numeric redundantes), `motorista_norm` (upper+trim+strip-acentos) p/ join.

**Dentro:**
- `GET /api/positions` (authGuard) → última posição por `motorista_norm` (só geocodadas), **enriquecida com ranking** (join cross-source por nome).
- Camada "frota importada" no **LiveMap** (não página nova), **toggle** separado da camada de veículos ao vivo (WebSocket).
- Marcadores = **ícone de caminhão/veículo** (custom, não pino default), cor por status do ranking (ATIVO/BLOQUEADO/sem-match).
- **Cluster** de marcadores próximos (vários motoristas no mesmo município centroide) + popup com lista; popup do marcador com nome, cidade/UF, data, veículo + rank/pontuação/status (se ranked).

**Fora:**
- Página de mapa nova (é camada no LiveMap).
- Telemetria GPS em tempo real / trilha de movimento (track separado).
- Escrita (read-only). Geocoding (Phase 10, pronto).
</domain>

<decisions>
## Decisões (travadas — discuss-phase v2.0)

- **D-11-01 (Camada no LiveMap):** nova camada "frota importada" DENTRO do `LiveMap.tsx` existente, **toggle** (alterna camadas), separada/coexistindo com a camada de veículos ao vivo (`usePositionsStore`/WebSocket). NÃO é página nova.
- **D-11-02 (Endpoint):** `GET /api/positions` (authGuard, qualquer role logado lê) → **última posição por `motorista_norm`** entre as geocodadas (geom NOT NULL ≈ 69). Retorna lat/lng (colunas numeric redundantes — sem precisar ST_X/ST_Y), cidade, uf, data_posicao, veiculo, motorista + enriquecimento de ranking. Read-only.
- **D-11-03 (Join cross-source com ranking):** server-side cruza `driver_positions` (Torre, Drizzle) × ranking drivers (ride-rank via `getRankingDrivers()` do proxy Phase 7) por `motorista_norm == normalizeMotorista(driver.nome)`. Enriquece cada posição com `{ ranked, rank, pontuacao, status (ATIVO|BLOQUEADO), vinculo }`. Sem match → `{ ranked:false, status:null }` (marcador neutro). **É a integração que o milestone construiu.** Reusa o cache de ranking (60s).
- **D-11-04 (Marcador = ícone de caminhão):** marcadores **custom** em formato de **caminhão/veículo** (simula carro real, NÃO o pino default do maplibre). Cor por status do ranking: **ATIVO=verde** (success), **BLOQUEADO=vermelho** (danger), **sem-match=cinza/neutro** (muted). Mapear pros tokens oklch do Torre.
- **D-11-05 (Cluster + popup):** **clusteriza** marcadores próximos (centroides de município geram sobreposição); clicar no cluster → expande/lista os motoristas daquele ponto; clicar no caminhão → **popup** com nome, cidade/UF, data_posicao, veículo + (se ranked) rank/pontuação/status/vínculo.
- **D-11-06 (Hook + toggle):** `useFleetPositions` (Eden Treaty → `GET /api/positions`, TanStack Query, staleTime ~60s, padrão `useTrips`/`useRanking`). LiveMap ganha um controle de toggle "Frota importada" (perto do toggle mapa/satélite) que liga/desliga a camada.

### Claude's Discretion
- **Implementação do cluster + ícone de caminhão** (tradeoff a decidir):
  - (a) GeoJSON source `cluster:true` + symbol layer com imagem de caminhão (`map.addImage`) + circle layer p/ clusters com contagem — caminho nativo maplibre, escala melhor; cor por status via ícones variantes ou `icon-color` (SDF).
  - (b) Custom DOM markers (el de caminhão, padrão `markersRef` do LiveMap) + clustering JS (supercluster) — "card" mais rico, +trabalho.
  - Requisito firme: visual de caminhão + cluster + popup; a técnica é discrição.
- Asset do caminhão (SVG inline / lucide `Truck` / imagem PNG).
- Styling do popup (reusar padrão Torre/PanelCard).
- staleTime exato; se a camada faz refetch.
- Cores exatas (tokens status do Torre).

</decisions>

<canonical_refs>
## Canonical References — LER ANTES DE PLANEJAR

### Frontend (mapa — ESTENDER)
- `torre-de-controle/src/components/domain/LiveMap.tsx` (159 linhas — markers custom DOM via `markersRef`, mode toggle mapa/satélite, setup maplibre, openfreemap tiles). **A camada nova entra aqui** + toggle.
- `torre-de-controle/src/hooks/useVehiclePositions.ts` (`usePositionsStore` Zustand — padrão da camada ao vivo; a frota importada usa hook de QUERY, não WS).
- `torre-de-controle/src/app/pages/geofences/GeofencesPage.tsx` (maplibre `addSource`/`addLayer` GeoJSON — padrão se usar cluster nativo).
- `torre-de-controle/src/hooks/useTrips.ts` / `useRanking.ts` (padrão Eden Treaty + TanStack Query p/ `useFleetPositions`).
- `torre-de-controle/src/lib/api.ts` (treaty client) + `src/components/domain/PanelCard.tsx` (popup styling).

### Backend (endpoint + join)
- `api/src/db/schema/driver-positions.ts` (driver_positions: motorista, motorista_norm, lat, lng, geom, cidade, uf, data_posicao, veiculo, geocoded).
- `api/src/modules/ranking/ranking.service.ts` (`getRankingDrivers()` — fonte do join) + `ranking.types.ts` (RankedDriver: `nome`, `status` ATIVO|BLOQUEADO, `pontuacao`, `rank`, `vinculo`).
- `api/src/modules/positions/viagens.parser.ts` (`normalizeMotorista()` — MESMA normalização p/ o match nome↔motorista_norm).
- `api/src/lib/rbac.ts` (authGuard) + `api/src/index.ts` (padrão de endpoint read; como o ranking plugin expõe GET).
- `api/src/db/client.ts` (Drizzle/postgres.js — query da última posição por motorista; DISTINCT ON (motorista_norm) ORDER BY data_posicao DESC).

### Planning
- `.planning/ROADMAP.md` (Phase 11 goal: camada frota no LiveMap, marcadores por status + popup, alterna camadas) · `.planning/phases/10-*/10-04-SUMMARY.md` (driver_positions live).

</canonical_refs>

<code_context>
## Existing Code Insights
- `driver_positions` tem **lat/lng numeric redundantes** (D-10-02) → endpoint retorna lat/lng direto, sem ST_X/ST_Y; mais simples pro maplibre.
- **69 geocodadas** (geom NOT NULL); `motorista_norm` bate com `normalizeMotorista(ranking.nome)` (mesma função — confirmar import compartilhado).
- LiveMap usa **markers custom DOM (`el`)** → caminho natural pro ícone de caminhão (opção b); cluster nativo (opção a) exige GeoJSON source.
- Ranking vem do **proxy ride-rank** (`getRankingDrivers`, cache 60s já existe) — o endpoint de positions chama internamente p/ o join; não duplica a credencial (server-side, Phase 7).
- 125 motoristas distintos na planilha; nomes batem com os do ranking (ex.: ADAUTO SANTOS COSTA = #1 do ranking).
</code_context>

<threat_model>
## Security (ASVS-oriented)
- **T1 leitura não-autorizada:** `GET /api/positions` atrás de `authGuard` (qualquer role logado lê — é visualização interna). Read-only, sem escrita.
- **T2 cross-source / anon key:** o join chama `getRankingDrivers` server-side (proxy Phase 7) — a anon key do ride-rank NUNCA vai pro front (já garantido). O front só recebe o resultado enriquecido.
- **T3 PII (nomes + localização):** dados internos; não logar valores. Posição é nível-cidade (centroide), não GPS preciso de pessoa em tempo real.
- **T4 XSS no popup:** conteúdo do popup (nome/cidade) escapado (sem `innerHTML` cru / `dangerouslySetInnerHTML`); usar montagem segura de DOM/JSX.
</threat_model>

<deferred>
## Deferred
- Posição GPS em tempo real / trilha de movimento (telemetry, track separado).
- Filtros da camada (por UF/status), heatmap, reverse-geocode de precisão.
- Auto-refresh da camada importada (re-import é manual, Phase 10).
</deferred>

---

*Phase: 11-mapa-frota-importada-geospatial · Milestone v2.0 (última) · Context 2026-05-30 via discuss-phase (advisor)*
