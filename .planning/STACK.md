# Stack Decisions — Torre de Controle de Entregas

## Architecture Pattern: Modular Monolith → Microservices-ready

MVP começa como monolito modular (velocidade de entrega). Módulos isolados permitem extração futura.

## Frontend

| Camada | Escolha | Justificativa |
|--------|---------|---------------|
| Framework | React 18 + TypeScript | Ecossistema, tipagem, SSR opcional |
| Build tool | Vite 5 | Velocidade de HMR, sem complexidade Next.js no MVP |
| Roteamento | React Router v6 | SPA, sem SSR necessário no MVP |
| UI Base | shadcn/ui + Argon Dashboard CSS | shadcn para componentes funcionais; Argon para estilo visual matching designs |
| Mapa | Mapbox GL JS v3 | Performance com 500+ marcadores, geofence support, WebGL |
| Estado global | Zustand | Simples, sem boilerplate Redux |
| Real-time | Socket.io-client | Compatível com backend, reconnect automático |
| Fetching | TanStack Query v5 | Cache, loading states, refetch strategies |
| Forms | React Hook Form + Zod | Tipagem end-to-end |
| Tabelas | TanStack Table v8 | Virtualização para listas grandes |
| Gráficos | Chart.js 4 (já no Argon) | Consistente com template existente |
| Data | date-fns | Formatação de datas/janelas |

## Backend

| Camada | Escolha | Justificativa |
|--------|---------|---------------|
| Runtime | Bun 1.x | Performance, compatível com Node APIs |
| Framework | Elysia 1.x | TypeScript nativo, OpenAPI built-in, Bun-first |
| ORM | Drizzle ORM | Type-safe, migrations simples, performance |
| Auth | JWT + bcrypt | Stateless, RBAC via claims |
| WebSocket | Elysia WS plugin | Nativo no Elysia, sem adapter |
| Validação | Elysia + TypeBox | Runtime validation + inferência de tipos |
| Logs | Pino | Performance, structured JSON |
| Queue | BullMQ (Redis) | Jobs de alerta, notificações assíncronas |

## Infrastructure

| Componente | Escolha | Motivo |
|------------|---------|--------|
| DB | PostgreSQL 16 | JSONB para eventos, PostGIS para geofence |
| Cache/PubSub | Redis 7 (Upstash) | Posições em tempo real, sessões, filas |
| Deploy | Railway ou Render | Low-friction, PostgreSQL + Redis incluídos |
| CDN | Cloudflare (free) | Assets estáticos do frontend |
| Monitoramento | Sentry (free tier) | Erros em produção |
| CI/CD | GitHub Actions | Deploy automático |

## Key Architecture Decisions

### 1. Real-time Position Updates
```
GPS Provider → POST /api/telemetry/ingest
  → Redis HSET vehicle:{id} position
  → Redis PUBLISH channel:positions
  → WS Server → broadcast to connected clients
  → BullMQ → check SLA rules → generate alerts
```

### 2. Alert Engine (Redis + BullMQ)
```
A cada update de posição:
  - Compara ETA calculado vs delivery_window
  - Se (eta - window_end) > threshold → cria alerta "Em risco" ou "Atrasado"
  - Detecta parada não planejada (velocidade = 0, fora de geofence, > 5min)
  - Detecta desvio (posição fora da rota planejada > raio configurável)
  - Detecta perda de sinal (last_update > threshold)
```

### 3. SLA Calculation
```typescript
function calcTripStatus(trip: Trip): 'no_prazo' | 'em_risco' | 'atrasado' | 'sem_sinal' {
  const now = Date.now()
  const eta = trip.eta.getTime()
  const windowEnd = trip.deliveryWindow.end.getTime()
  const signalAge = now - trip.lastPositionAt.getTime()
  
  if (signalAge > SIGNAL_LOSS_THRESHOLD) return 'sem_sinal'
  if (eta > windowEnd) return 'atrasado'
  if ((eta - windowEnd) > -RISK_THRESHOLD_MS) return 'em_risco'
  return 'no_prazo'
}
```

### 4. Map Performance Strategy
- Cluster markers quando zoom < 10
- Use Mapbox source/layer (não React markers individuais) para 500+ veículos
- Atualiza apenas posições que mudaram (delta updates via Redis)
- WebGL rendering nativo do Mapbox

## Security

- JWT com RS256 (assimétrico) para tokens
- RBAC: admin > supervisor > analyst > viewer
- Rate limiting no endpoint de ingestão de telemetria (anti-spoofing)
- HTTPS obrigatório em produção
- Secrets via env vars (nunca no código)
- Audit log imutável para tratativas operacionais
- Dados de localização: retenção configurável (LGPD)

## Database: PostGIS extension

Para geofence queries eficientes:
```sql
-- Verificar se ponto está dentro de geofence
SELECT id FROM geofences 
WHERE ST_Contains(boundary, ST_MakePoint($lon, $lat)::geography);

-- Index geoespacial
CREATE INDEX idx_geofences_boundary ON geofences USING GIST(boundary);
```
