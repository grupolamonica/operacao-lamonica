# Project Intel — Torre de Controle de Entregas

## Identity
- **Product:** Torre de Controle de Entregas
- **Client:** Operação Shopee (last-mile delivery)
- **Type:** Internal operational tool (B2B SaaS MVP)
- **Stage:** Pre-development, planning complete

## Key Decisions
- Frontend: React + Vite (NOT Next.js — no SSR needed in MVP)
- Backend: Bun + Elysia (performance, TypeScript native)
- Map: Mapbox GL JS (WebGL, 500+ markers performance)
- Real-time: Socket.io (reconnect handling)
- DB: PostgreSQL + PostGIS (geospatial queries)
- State: Zustand (simple) + TanStack Query (server state)
- UI Base: Argon Dashboard Bootstrap CSS + shadcn/ui components

## Current Codebase
- Location: C:\Users\antonio.magalhaes\Documents\Projetos\argon-dashboard
- Type: Static HTML Argon Dashboard 3 (Bootstrap 5)
- Status: Template only, no business logic
- Serve: Python http.server on port 3000

## Architecture Pattern
Modular monolith backend. Modules: auth, trips, drivers, vehicles, telemetry, geofences, alerts, users
Frontend: SPA with Zustand stores + TanStack Query + Socket.io WebSocket

## Critical Path
Phase 1 (UI Shell) → Phase 3 (Map + Real-time) → Phase 4 (Alert Engine)
These 3 phases = operational MVP

## Constraints
- SLA meta: ≥ 95% entregas dentro da janela
- Max latency map update: 10s
- Min vehicles on map without degradation: 500
- Cost: Railway (low) + Cloudflare Pages (free)
- Deploy: Railway + Cloudflare Pages

## Alert Types Implemented
1. atraso_critico — ETA > window_end
2. em_risco — ETA approaching window_end (configurable threshold)
3. desvio_nao_autorizado — GPS fora da rota planejada > N km
4. parada_nao_planejada — Velocidade < 2km/h por > 5min fora de geofence
5. sinal_gps_intermitente — last_update > threshold
6. entrega_fora_janela — delivery confirmed outside window
7. checklist_incompleto — checklist itens faltando
