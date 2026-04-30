# Phase 2: Backend Core + Auth — Context

**Gathered:** 2026-04-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Esta fase entrega a API backend completa: Elysia/Bun com autenticação JWT, CRUD das entidades principais (trips, drivers, alerts, vehicles, clients, routes, users), banco PostgreSQL com Drizzle ORM, Redis, Docker Compose para desenvolvimento, e seed data com volume realista.

**O que está dentro:**
- Setup: Bun + Elysia + Drizzle + PostgreSQL + Redis
- Schema DB completo com todas as tabelas (conforme ARCHITECTURE.md)
- Migrations com Drizzle Kit
- Auth module: login, JWT HttpOnly Cookie, refresh, RBAC middleware
- Trips module: CRUD + filtros + KPIs agregados
- Drivers module: CRUD + documentos + stats
- Alerts module: CRUD + assign + tratativas
- Seed data: 50+ viagens, 20+ motoristas, clientes, rotas (dados independentes, UUIDs reais)
- Docker Compose: PostgreSQL + Redis + API
- Swagger/OpenAPI gerado pelo Elysia
- Eden Treaty client setup para consumo tipado pelo frontend

**O que está fora:**
- Frontend integration / troca dos hooks mock (Phase 3)
- WebSocket / dados em tempo real (Phase 3)
- Alert engine BullMQ (Phase 4)
- GPS Simulator (Phase 3)
- Geofences PostGIS (Phase 5)

</domain>

<decisions>
## Implementation Decisions

### Auth — JWT Transport
- **D-01: HttpOnly Cookie** — O JWT de acesso é emitido e lido via cookie HttpOnly. `SameSite=Strict` suficiente para app interno sem CSRF adicional. Frontend React usa `credentials: 'include'` em todos os requests. Sem lógica de token no estado do frontend.
- **D-02: Token refresh** — `/api/auth/refresh` usa o mesmo cookie HttpOnly. Redis blacklist (`session:blacklist:{jti}`) invalida tokens no logout.
- **D-03: Sem Bearer / localStorage** — Não usar `Authorization: Bearer` para o token de sessão do usuário. (Token de API Key para telemetria GPS permanece como header separado, conforme ARCHITECTURE.md.)

### Eden Treaty — Cliente Tipado
- **D-04: Eden Treaty habilitado** — O backend Elysia expõe tipos via Eden Treaty. Os hooks de dados do frontend (Phase 3) vão usar um `fetcher()` wrapper sobre Eden Treaty para integração com TanStack Query. Isso garante tipos end-to-end automáticos: mudança de rota no backend quebra na compilação do frontend.
- **D-05: Wrapper obrigatório** — `async function fetcher<T>(fn: Promise<{data: T, error: unknown}>): Promise<T>` — lança erro se `error` presente, retorna `data`. Aplicado uniformemente em todos os hooks na Phase 3.

### Seed Data
- **D-06: Dados independentes** — O seed script usa UUIDs reais gerados pelo PostgreSQL. Não replica os IDs sequenciais dos mocks do frontend (`drv-001`, `trip-042`). Volume conforme ROADMAP: 50+ viagens, 20+ motoristas, 5+ clientes, 10+ rotas.
- **D-07: Dados brasileiros realistas** — Nomes, placas (formato ABC-0000 e ABC-0D00), cidades SP/MG/RJ, clientes tipo Shopee/Magazine Luiza/Mercado Livre.
- **D-08: Cobertura de status** — Seed inclui viagens em todos os status (planned, in_progress, completed, delayed) e alertas em todos os níveis (crítico, médio, baixo) para smoke testing dos filtros.

### Claude's Discretion
- Estrutura interna dos módulos Elysia (group por módulo, injeção de dependências via plugin)
- Configuração de Pino logger (formato, log level por env)
- Drizzle schema organization (um arquivo por tabela vs schema unificado)
- Scripts Drizzle: `db:generate`, `db:migrate`, `db:seed`, `db:reset`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Arquitetura e Entidades
- `.planning/ARCHITECTURE.md` — Schema completo de todas as tabelas, rotas API, Redis key schema, WebSocket events, Alert Engine logic. LEITURA OBRIGATÓRIA antes de qualquer planejamento de Phase 2.
- `.planning/STACK.md` — Escolhas técnicas com justificativas: Bun, Elysia, Drizzle, JWT RS256, BullMQ. Inclui configuração de segurança e estratégia de infra.

### Produto e Requisitos
- `.planning/PROJECT.md` — Módulos do sistema, perfis de usuário (admin|supervisor|analyst|viewer), dados disponíveis, requisitos não-funcionais (uptime, latência, RBAC).
- `.planning/ROADMAP.md` §Phase 2 — Lista completa de entregas desta fase com critérios de sucesso: "GET /api/trips retorna dados reais. Auth funcional. Swagger acessível."

### Codebase Frontend (referência para compatibilidade)
- `torre-de-controle/src/data/types.ts` — Tipos TypeScript do frontend que devem ser compatíveis com os tipos do Drizzle schema na Phase 3.
- `torre-de-controle/src/hooks/` — Hooks mock atuais. O contrato `{ data, isLoading: false, isError: false }` deve ser respeitado na substituição por TanStack Query na Phase 3.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `torre-de-controle/src/data/types.ts` — Interfaces TypeScript completas (Driver, Trip, Alert, etc.) — mapear para Drizzle `$inferSelect` na Phase 3
- `torre-de-controle/src/hooks/useTrips.ts`, `useDrivers.ts`, `useAlerts.ts` — Contratos dos hooks de dados com filtros, formato de retorno e assinaturas de função

### Established Patterns
- Mock hooks retornam `{ data, isLoading: false, isError: false, error: null, refetch: () => void }` — TanStack Query precisa manter esse contrato na Phase 3
- Filtros usados no frontend (TripFilters, DriverFilters, AlertFilters) devem ter endpoints correspondentes com mesmos parâmetros de query

### Integration Points
- Backend porta 3000 (conforme ARCHITECTURE.md)
- Frontend porta 5173 (Vite dev) — CORS deve permitir `http://localhost:5173` com `credentials: true`
- Eden Treaty: `import { treaty } from '@elysiajs/eden'` no frontend aponta para `http://localhost:3000`

</code_context>

<specifics>
## Specific Ideas

### HttpOnly Cookie setup no Elysia
```typescript
// login handler
cookie.set('access_token', jwt, {
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 60 * 60 * 24, // 24h
  path: '/',
})
```

### Eden Treaty wrapper (Phase 3 reference)
```typescript
// lib/fetcher.ts
export async function fetcher<T>(
  fn: Promise<{ data: T; error: unknown }>
): Promise<T> {
  const { data, error } = await fn
  if (error) throw error
  return data
}

// hooks/useTrips.ts (Phase 3)
export function useTrips(filters?: TripFilters) {
  return useQuery({
    queryKey: ['trips', filters],
    queryFn: () => fetcher(api.trips.index.get({ query: filters })),
  })
}
```

### Seed data volume target
- Motoristas: 20+ (mix de available, on_route, unavailable)
- Viagens: 50+ (15 in_progress, 10 planned, 20 completed, 5 delayed)
- Alertas: 15+ (5 críticos, 7 médios, 3 baixos)
- Clientes: 5+ (Shopee, Magazine Luiza, Mercado Livre, Americanas, Casas Bahia)
- Rotas: 10+ por cliente/região

</specifics>

<deferred>
## Deferred Ideas

- Frontend integration / troca dos hooks mock por Eden Treaty + TanStack Query (Phase 3)
- GPS Simulator para viagens em movimento (Phase 3)
- Alert Engine BullMQ workers (Phase 4)
- WebSocket broadcast de posições (Phase 3)
- Notificações push (Phase 6)
- Testes de integração com banco real (Phase 6)

</deferred>

---

*Phase: 02-backend-core-auth-api-foundation*
*Context gathered: 2026-04-30*
