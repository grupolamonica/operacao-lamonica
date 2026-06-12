# SPX LineHaul — `GET /api/spx/asp` (Phase 15)

Viagens linehaul do portal SPX (Shopee Express) no **mesmo formato da aba `asp`**
da planilha de Cargas — **ao vivo via HTTP**, pra consumo por outros sistemas
(n8n, scripts, planilhas, BI), sem copia-e-cola.

- **Base:** `https://torre.grupolamonica.com`
- **Rota:** `GET /api/spx/asp`
- **Auth:** API key máquina-a-máquina (NÃO usa sessão de browser).

## Autenticação

Envie a chave em **um** destes headers:

```
x-api-key: <SPX_ASP_API_KEY>
# ou
Authorization: Bearer <SPX_ASP_API_KEY>
```

- A chave fica no secret do GitHub `SPX_ASP_API_KEY` → provisionada no `.env` da VPS → mapeada no
  `environment` do backend (`docker-compose.prod.yml`).
- **Rotacionar:** `gh secret set SPX_ASP_API_KEY --repo grupolamonica/operacao-lamonica --body "<nova>"`
  e redeploy (`gh workflow run deploy.yml --ref main`).
- Sem header / chave errada → `401`. Secret não configurado no servidor → `503`.

## Query params (todos opcionais)

| Param | Default | Descrição |
|---|---|---|
| `query_type` | (todos) | `1`=Planejado, `2`=Aceito, `3`=Concluído. Omitido = **união dos 3** (dedupe por LH). |
| `days_back` | `45` | Janela de STA pra trás (dias). |
| `days_fwd` | `15` | Janela de STA pra frente (dias). |
| `station` | `5015` | `agency_current_station_id` (OBRIGATÓRIO no SPX; default 5015 = SoC_RJ_Rio de Janeiro). |
| `format` | `json` | `csv` devolve o arquivo (15 colunas, `;` + BOM, igual à aba). |

> A tab **Aceito** (2) ignora a janela de data no backend do SPX; **Planejado** (1) e
> **Concluído** (3) respeitam. Pra histórico mais longo, aumente `days_back`.

## Resposta — JSON (default)

```jsonc
{
  "ok": true,
  "columns": ["LH Trip Number", "LH Trip Name", "Status", "Status Operacional", "Driver ID",
              "Vehicle", "Vehicle Plate Number", "Station_Origem", "Station_Destino",
              "ETA ORIGEM PROGRAMADO", "ETA ORIGEM REAL", "CPT ORIGEM PROGRAMADO",
              "CPT ORIGEM REAL", "ETA DESTINO PROGRAMADO", "ETA DESTINO REAL"],
  "total": 412,                         // viagens únicas (após dedupe entre tabs)
  "byTab": { "planejado": 387, "aceito": 28, "concluido": 0 },  // contagem crua por tab
  "errors": [],                         // tabs que falharam (ex.: sessão SPX expirada) — vazio = ok
  "rows": [ { "LH Trip Number": "LT1Q...", "Status": "Assigning", ... } ]
}
```

Em falha (cookies vazios, sessão SPX expirada, Supabase sem permissão) → HTTP `502`:
```json
{ "ok": false, "error": "<causa real>" }
```

## Colunas (de-para com o SPX `trip/list`)

| Coluna `asp` | Origem no `trip/list` |
|---|---|
| LH Trip Number / Name | `trip_number` / `trip_name` |
| Status | `trip_status` (enum `tt_trip_status`) |
| Status Operacional | de-para fixo do status: Assigning/Assigned→`AGUARDANDO CHEGAR NO CLIENTE`, Loading/Seal→`AGUARDANDO CARREGAMENTO`, Departed→`CARREGADO`, Arrived→`AGUARDANDO DESCARGA`, Unseal→`DESCARREGANDO`, Unloaded/Completed→`DESCARREGADO`, Cancelled→`CANCELADO` |
| Driver ID | `[driver]driver_name` |
| Vehicle / Vehicle Plate Number | `vehicle_type_name` / `vehicle_plate_number_list` |
| Station_Origem / Destino | `[station]station_name` da 1ª / última `trip_station` |
| ETA / CPT Origem · Destino (Programado×Real) | `sta` / `std` / `ata` / `atd` (epoch→BRT `DD/MM/YYYY HH:MM`) |

## Exemplos

```bash
# JSON, os 3 tabs (default)
curl -H "x-api-key: $KEY" "https://torre.grupolamonica.com/api/spx/asp"

# Só Concluído, últimos 90 dias
curl -H "x-api-key: $KEY" "https://torre.grupolamonica.com/api/spx/asp?query_type=3&days_back=90"

# CSV (download)
curl -H "x-api-key: $KEY" "https://torre.grupolamonica.com/api/spx/asp?format=csv" -o spx_asp.csv
```

## Como funciona (arquitetura)

Self-contained, **sem sidecar** (os sidecars Python não rodam no prod da Torre):
1. Lê os cookies de sessão SPX do `aspx_credentials` (id=1) na Supabase do Cargas via
   `getCargasSupabase()` (`CARGAS_SUPABASE_*`). Cookies são auto-renovados pelo container
   `aspx-renewal` do Cargas (sessão `danilo.braga`, agência 297). **Só o cookie é necessário**
   no `trip/list` (app/device-id/version dispensáveis).
2. Pagina por tab (count 200), achata pras 15 colunas, deduplica por `trip_number`
   (tab mais avançado vence) e devolve. Endpoints SPX por tab:
   - Planejado (1) / Aceito (2): `GET /api/line_haul/agency/trip/list?query_type=N&sta=<ini>,<fim>&agency_current_station_id=`
   - Concluído (3): `GET /api/line_haul/agency/trip/history/list?mtime=<ini>,<fim>&agency_current_station_id=` (histórico — trips Completed/Cancelled; filtra por `mtime`, não `query_type`).

Código: `api/src/modules/spx/spx.plugin.ts` + `api/src/adapters/spx-portal/asp.adapter.ts`.

> **CORS:** server-to-server (curl/backend) funciona direto. Chamada de **browser em outro
> domínio** é bloqueada pelo CORS da Torre (só a origem da Torre é liberada).
