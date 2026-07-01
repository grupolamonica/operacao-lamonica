# API de Alocação SPX (machine-to-machine)

Permite que **outros sistemas** aloquem motorista + veículo numa viagem SPX linehaul,
sem passar pela tela/login da Torre. Auth por **API key** (não por cookie de sessão).

Base: `https://<host-da-torre>/api/spx/allocacao` (em dev: `http://localhost:3000/...`).

## Autenticação

Envie a chave em **um** dos headers (qualquer um serve):

```
x-api-key: <SPX_ALLOC_API_KEY>
# ou
Authorization: Bearer <SPX_ALLOC_API_KEY>
```

A chave fica na env `SPX_ALLOC_API_KEY` do servidor da Torre (fallback: `SPX_ASP_API_KEY`).
Sem chave/erro → `401`. Sem env configurada no servidor → `503`.

## Endpoints

### 1. `GET /api/spx/allocacao/trips`
Viagens **atribuíveis** (status Assigning, ainda sem motorista).

| Query | Opcional | Default |
|-------|----------|---------|
| `station_id` | sim | 5015 (estação do operador) |

Resposta: `{ ok, total, trips: [{ trip_id, trip_number, origem, destino, vehicle_type, std }] }`

### 2. `GET /api/spx/allocacao/drivers`
Motoristas **atribuíveis** (driver_id + nome, sem máscara).

| Query | Opcional | Nota |
|-------|----------|------|
| `nome` | sim | filtra por nome (case/acento-insensível, parcial) |
| `agency_id` | sim | default 1297 (driverservice LAMONICA) |

Resposta: `{ ok, total, agency_id, drivers: [{ driver_id, name, ... }] }`

### 3. `POST /api/spx/allocacao/assign`
Aloca motorista + veículo (cavalo/carreta) na viagem.

Body:
```jsonc
{
  "trip_id": 3781435,            // OU "trip_number": "LT0Q6O0291RV1" (resolve entre as atribuíveis)
  "driver_ids": [2041700],       // 1 = principal; 2 = principal + segundo
  "vehicle_plates": ["FYF8B65", "GBO6I49"], // [cavalo, carreta]
  "station_id": 5015,            // opcional (default 5015)
  "dry_run": false               // opcional; true = só monta a requisição, NÃO envia
}
```
Resposta: `{ ok, trip_id, writeEnabled, dry_run, enviado_ao_aspx, steps }`.
- `enviado_ao_aspx: true` → atribuição efetivada no aspx.
- `trip_number` só resolve viagens **atribuíveis** (status 4). Para uma já-alocada, use `trip_id`.

## Segurança da escrita

O envio REAL ao aspx só ocorre se a env `SPX_ALLOC_WRITE_ENABLED` estiver ligada
(`true`). Caso contrário — ou com `dry_run: true` — a requisição é só **montada e
devolvida** (`enviado_ao_aspx: false`), sem tocar o aspx. Útil pra integrar/testar sem risco.

## Exemplos (curl)

```bash
KEY="<SPX_ALLOC_API_KEY>"
BASE="http://localhost:3000/api/spx/allocacao"

# Listar viagens que precisam de motorista
curl -H "x-api-key: $KEY" "$BASE/trips"

# Achar o driver_id pelo nome
curl -H "x-api-key: $KEY" "$BASE/drivers?nome=magno"

# Alocar (real, se SPX_ALLOC_WRITE_ENABLED=true)
curl -X POST -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{"trip_id":3781435,"driver_ids":[2041700],"vehicle_plates":["FYF8B65","GBO6I49"]}' \
  "$BASE/assign"

# Simular (não envia)
curl -X POST -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{"trip_id":3781435,"driver_ids":[2041700],"vehicle_plates":["FYF8B65","GBO6I49"],"dry_run":true}' \
  "$BASE/assign"
```

## Arquitetura

`POST /assign` → `adapters/spx-sidecar/allocacao.adapter` → sidecar Python spx-bot
(`SPX_SIDECAR_URL`, porta 8766) → `POST /api/line_haul/agency/trip/assign` no aspx.
Mesma fonte de verdade da tela da Torre (`/api/allocacao/*`) — só muda a auth (API key
em vez de cookie). Requer o sidecar de pé e a sessão SPX válida (cookies via Supabase
`aspx_credentials`, renovados pelo container `aspx-sync`).
