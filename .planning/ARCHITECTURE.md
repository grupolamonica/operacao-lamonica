# Architecture — Torre de Controle de Entregas

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                  │
│   Browser (Analista/Torre/Supervisor/Gestor)                    │
│   React + Vite SPA                                               │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS + WSS
┌────────────────────────▼────────────────────────────────────────┐
│                      API GATEWAY                                 │
│              Elysia (Bun) — porta 3000                          │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│   │  Auth    │ │ Trips    │ │ Drivers  │ │  Telemetry       │ │
│   │  Module  │ │ Module   │ │ Module   │ │  Ingest Module   │ │
│   └──────────┘ └──────────┘ └──────────┘ └──────────────────┘ │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│   │ Geofence │ │ Alerts   │ │  Users   │ │  WS Hub          │ │
│   │  Module  │ │ Module   │ │  Module  │ │  Module          │ │
│   └──────────┘ └──────────┘ └──────────┘ └──────────────────┘ │
└────────────────────────┬────────────────────────────────────────┘
                         │
           ┌─────────────┼─────────────┐
           │             │             │
    ┌──────▼──────┐ ┌────▼────┐ ┌─────▼──────────┐
    │ PostgreSQL  │ │  Redis  │ │   BullMQ        │
    │  + PostGIS  │ │  7      │ │   Workers       │
    │             │ │         │ │ (Alert Engine)  │
    └─────────────┘ └─────────┘ └────────────────┘
                                       │
                              ┌────────▼────────┐
                              │  GPS Provider   │
                              │  API Adapter    │
                              └─────────────────┘
```

## Database Entities

### drivers
```sql
CREATE TABLE drivers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          VARCHAR(20) UNIQUE NOT NULL,  -- MTR-7822
  name          VARCHAR(100) NOT NULL,
  phone         VARCHAR(20),
  photo_url     TEXT,
  status        VARCHAR(20) DEFAULT 'available', -- available|on_route|unavailable
  operational_score INTEGER DEFAULT 100,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### vehicles
```sql
CREATE TABLE vehicles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate         VARCHAR(10) UNIQUE NOT NULL,  -- KLP-9081
  type          VARCHAR(30),  -- Van, Furgão, VUC
  model         VARCHAR(50),
  driver_id     UUID REFERENCES drivers(id),
  gps_device_id VARCHAR(50),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### driver_documents
```sql
CREATE TABLE driver_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id   UUID REFERENCES drivers(id) ON DELETE CASCADE,
  type        VARCHAR(50) NOT NULL,  -- CNH, Exame Toxicologico, Treinamento
  status      VARCHAR(20),           -- valido, vence_em_breve, vencido
  expires_at  DATE,
  issued_at   DATE
);
```

### trips
```sql
CREATE TABLE trips (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            VARCHAR(20) UNIQUE NOT NULL,  -- KLP-9081
  driver_id       UUID REFERENCES drivers(id),
  vehicle_id      UUID REFERENCES vehicles(id),
  client_id       UUID REFERENCES clients(id),
  route_id        UUID REFERENCES routes(id),
  priority        VARCHAR(10) DEFAULT 'media',  -- alta|media|baixa
  origin          VARCHAR(200),
  destination     VARCHAR(200),
  origin_lat      DECIMAL(10,8),
  origin_lng      DECIMAL(11,8),
  dest_lat        DECIMAL(10,8),
  dest_lng        DECIMAL(11,8),
  window_start    TIMESTAMPTZ NOT NULL,
  window_end      TIMESTAMPTZ NOT NULL,
  eta             TIMESTAMPTZ,
  status          VARCHAR(20) DEFAULT 'planned', -- planned|in_progress|completed|delayed|cancelled
  sla_status      VARCHAR(20),  -- no_prazo|em_risco|atrasado|sem_sinal
  progress_pct    SMALLINT DEFAULT 0,
  distance_total  DECIMAL(8,2),  -- km
  distance_done   DECIMAL(8,2),
  departed_at     TIMESTAMPTZ,
  arrived_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trips_status ON trips(status);
CREATE INDEX idx_trips_sla_status ON trips(sla_status);
CREATE INDEX idx_trips_window ON trips(window_start, window_end);
```

### vehicle_positions (time-series)
```sql
CREATE TABLE vehicle_positions (
  id          BIGSERIAL PRIMARY KEY,
  vehicle_id  UUID REFERENCES vehicles(id),
  trip_id     UUID REFERENCES trips(id),
  lat         DECIMAL(10,8) NOT NULL,
  lng         DECIMAL(11,8) NOT NULL,
  speed       DECIMAL(5,1),  -- km/h
  heading     SMALLINT,      -- 0-359 graus
  accuracy    DECIMAL(6,1),  -- metros
  captured_at TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Particionamento por mês (futuro)
CREATE INDEX idx_positions_vehicle_time ON vehicle_positions(vehicle_id, captured_at DESC);
```

### geofences
```sql
CREATE TABLE geofences (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  type        VARCHAR(30),  -- base|delivery_zone|restricted|risk_area
  color       VARCHAR(7),   -- hex
  boundary    GEOGRAPHY(POLYGON) NOT NULL,
  is_active   BOOLEAN DEFAULT true,
  client_id   UUID REFERENCES clients(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_geofences_boundary ON geofences USING GIST(boundary);
```

### geofence_events
```sql
CREATE TABLE geofence_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  geofence_id   UUID REFERENCES geofences(id),
  vehicle_id    UUID REFERENCES vehicles(id),
  trip_id       UUID REFERENCES trips(id),
  event_type    VARCHAR(10) NOT NULL,  -- enter|exit
  occurred_at   TIMESTAMPTZ NOT NULL,
  lat           DECIMAL(10,8),
  lng           DECIMAL(11,8)
);
```

### alerts
```sql
CREATE TABLE alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            VARCHAR(50) NOT NULL,
  -- atraso_critico|desvio_nao_autorizado|parada_nao_planejada
  -- sinal_gps_intermitente|tempo_parada_elevado
  -- entrega_fora_janela|checklist_incompleto
  severity        VARCHAR(10) NOT NULL,  -- critico|medio|baixo
  status          VARCHAR(15) DEFAULT 'aberto',  -- aberto|em_tratativa|resolvido
  trip_id         UUID REFERENCES trips(id),
  driver_id       UUID REFERENCES drivers(id),
  vehicle_id      UUID REFERENCES vehicles(id),
  assigned_to     UUID REFERENCES users(id),
  title           VARCHAR(150) NOT NULL,
  description     TEXT,
  source          VARCHAR(30),  -- GPS|Checklist|Telemetria
  lat             DECIMAL(10,8),
  lng             DECIMAL(11,8),
  delay_minutes   INTEGER,
  deviation_km    DECIMAL(6,2),
  occurred_at     TIMESTAMPTZ NOT NULL,
  resolved_at     TIMESTAMPTZ,
  sla_deadline    TIMESTAMPTZ,  -- prazo para tratar
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_status_severity ON alerts(status, severity);
CREATE INDEX idx_alerts_occurred ON alerts(occurred_at DESC);
```

### treatments (tratativas)
```sql
CREATE TABLE treatments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id        UUID REFERENCES alerts(id),
  trip_id         UUID REFERENCES trips(id),
  operator_id     UUID REFERENCES users(id),
  action_type     VARCHAR(50),
  -- assumiu|registrou_tratativa|ligou_motorista|escalou|resolveu
  notes           TEXT,
  outcome         VARCHAR(30),  -- pendente|resolvido|escalado
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### clients, routes, users (supporting tables)
```sql
CREATE TABLE clients (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name  VARCHAR(100) NOT NULL,  -- Shopee, Magazine Luiza, etc
  code  VARCHAR(20) UNIQUE
);

CREATE TABLE routes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(20) UNIQUE NOT NULL,
  name        VARCHAR(100),
  client_id   UUID REFERENCES clients(id),
  region      VARCHAR(50)
);

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          VARCHAR(20) NOT NULL,  -- admin|supervisor|analyst|viewer
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

## Redis Key Schema

```
# Posição atual de cada veículo (TTL: 60s, renovado a cada update)
HSET vehicle:{vehicle_id} lat 23.5 lng 46.6 speed 45 heading 180 updated_at 1716307200

# Conjunto de veículos em rota
SADD active_vehicles {vehicle_id}

# Canal de publicação de posições (PubSub)
PUBLISH positions:update "{vehicle_id, lat, lng, speed, sla_status}"

# Status atual de cada viagem (cache)
HSET trip:{trip_id} sla_status em_risco eta 1716310000 progress 75

# Contadores de KPIs do dashboard (TTL: 30s)
SET kpi:trips_today 83 EX 30
SET kpi:on_time_pct 92.6 EX 30

# Sessões JWT (blacklist/logout)
SET session:blacklist:{jti} 1 EX {exp}
```

## API Routes

### Auth
```
POST /api/auth/login       → { token, user }
POST /api/auth/logout      → 204
GET  /api/auth/me          → { user, permissions }
POST /api/auth/refresh     → { token }
```

### Trips
```
GET  /api/trips                    → list (paginado, filtros)
GET  /api/trips/:id                → detalhe + posição atual
GET  /api/trips/:id/timeline       → eventos cronológicos
GET  /api/trips/:id/positions      → histórico de posições
POST /api/trips                    → criar viagem
PATCH /api/trips/:id               → atualizar
GET  /api/trips/stats              → KPIs agregados
```

### Drivers
```
GET  /api/drivers                  → list (paginado)
GET  /api/drivers/:id              → detalhe + documentos + última localização
GET  /api/drivers/:id/trips        → histórico de viagens
GET  /api/drivers/stats            → KPIs da equipe
```

### Vehicles
```
GET  /api/vehicles                 → list
GET  /api/vehicles/:id/current-position → posição atual (Redis)
```

### Telemetry (GPS Ingest)
```
POST /api/telemetry/ingest         → recebe posição do GPS provider
  Body: { vehicle_id, lat, lng, speed, heading, captured_at }
  Auth: API Key (não JWT)
```

### Geofences
```
GET  /api/geofences                → list
POST /api/geofences                → criar zona
PATCH /api/geofences/:id           → editar
DELETE /api/geofences/:id          → remover
GET  /api/geofences/:id/events     → histórico entradas/saídas
```

### Alerts
```
GET  /api/alerts                   → list (filtros: severity, status, type)
GET  /api/alerts/:id               → detalhe
PATCH /api/alerts/:id/assign       → assumir alerta
POST /api/alerts/:id/treatments    → registrar tratativa
PATCH /api/alerts/:id/resolve      → marcar resolvido
GET  /api/alerts/stats             → KPIs de alertas
```

### Dashboard
```
GET  /api/dashboard/kpis           → todos os KPIs em uma chamada (Redis cache)
GET  /api/dashboard/map-data       → todas posições ativas (snapshot para mapa inicial)
```

### WebSocket Events (Server → Client)
```
position:update    { vehicle_id, lat, lng, speed, sla_status, heading }
alert:new          { alert_id, severity, type, trip_id, title }
alert:resolved     { alert_id }
trip:status_change { trip_id, old_status, new_status, eta }
kpi:update         { on_time_pct, at_risk_count, delayed_count, ... }
```

## Alert Engine Logic (BullMQ Worker)

```typescript
// Executado a cada posição recebida
async function processPosition(position: VehiclePosition) {
  const trip = await getActiveTrip(position.vehicle_id)
  if (!trip) return

  // 1. Calcular novo ETA
  const newEta = await calculateETA(position, trip.destination)
  
  // 2. Verificar SLA
  const newStatus = calcSlaStatus(newEta, trip.window_end, position.captured_at)
  
  // 3. Detectar parada não planejada
  if (position.speed < 2 && !isAtPlannedStop(position, trip)) {
    await createAlertIfNotExists('parada_nao_planejada', trip, position)
  }
  
  // 4. Detectar desvio de rota
  const deviationKm = calcRouteDeviation(position, trip.planned_route)
  if (deviationKm > DEVIATION_THRESHOLD_KM) {
    await createAlertIfNotExists('desvio_nao_autorizado', trip, position, { deviationKm })
  }
  
  // 5. Atualizar Redis
  await updateVehiclePosition(position)
  await updateTripStatus(trip.id, { eta: newEta, sla_status: newStatus })
  
  // 6. Publicar para WebSocket clients
  await redis.publish('positions:update', JSON.stringify({ ...position, sla_status: newStatus }))
}
```

## Frontend State Architecture

```
Zustand stores:
  useMapStore       → vehicle positions, selected vehicle, map bounds
  useTripStore      → trip list, filters, selected trip
  useAlertStore     → alert queue, unread count
  useAuthStore      → user, token, permissions

TanStack Query:
  useTrips()        → GET /api/trips (polling 30s para tab inativa)
  useDrivers()      → GET /api/drivers
  useDashboardKPIs() → GET /api/dashboard/kpis (SSE/polling 10s)

WebSocket (Socket.io):
  socket.on('position:update')  → useMapStore.updatePosition()
  socket.on('alert:new')        → useAlertStore.addAlert() + toast
  socket.on('trip:status_change') → useTripStore.updateTrip()
```
