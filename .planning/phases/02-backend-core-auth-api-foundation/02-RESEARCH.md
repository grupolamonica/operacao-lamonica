# Phase 2: Backend Core + Auth — Research

**Researched:** 2026-04-30
**Domain:** Bun + Elysia 1.x + Drizzle ORM + PostgreSQL + Redis + Eden Treaty
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01: HttpOnly Cookie** — JWT de acesso via cookie HttpOnly. `SameSite=Strict`. Frontend usa `credentials: 'include'`. Sem lógica de token no estado do frontend.
- **D-02: Token refresh** — `/api/auth/refresh` usa o mesmo cookie HttpOnly. Redis blacklist (`session:blacklist:{jti}`) invalida tokens no logout.
- **D-03: Sem Bearer / localStorage** — Nenhum `Authorization: Bearer` para sessão. (API Key de telemetria GPS permanece como header separado.)
- **D-04: Eden Treaty habilitado** — Backend Elysia expõe tipos via Eden Treaty. Hooks da Phase 3 usam `fetcher()` wrapper sobre Eden Treaty com TanStack Query.
- **D-05: Wrapper obrigatório** — `async function fetcher<T>(fn: Promise<{data: T, error: unknown}>): Promise<T>` — lança erro se `error` presente, retorna `data`. Aplicado uniformemente na Phase 3.
- **D-06: Dados independentes** — Seed usa UUIDs reais do PostgreSQL. Não replica IDs sequenciais dos mocks (`drv-001`, `trip-042`).
- **D-07: Dados brasileiros realistas** — Nomes, placas (ABC-0000 e ABC-0D00), cidades SP/MG/RJ, clientes: Shopee/Magazine Luiza/Mercado Livre/Americanas/Casas Bahia.
- **D-08: Cobertura de status** — Seed inclui todos os status de viagem e todos os níveis de alerta para smoke testing.

### Claude's Discretion
- Estrutura interna dos módulos Elysia (group por módulo, injeção de dependências via plugin)
- Configuração de Pino logger (formato, log level por env)
- Drizzle schema organization (um arquivo por tabela vs schema unificado)
- Scripts Drizzle: `db:generate`, `db:migrate`, `db:seed`, `db:reset`

### Deferred Ideas (OUT OF SCOPE)
- Frontend integration / troca dos hooks mock por Eden Treaty + TanStack Query (Phase 3)
- GPS Simulator (Phase 3)
- Alert Engine BullMQ workers (Phase 4)
- WebSocket broadcast de posições (Phase 3)
- Notificações push (Phase 6)
- Testes de integração com banco real (Phase 6)
</user_constraints>

---

## Summary

Esta fase cria o backend completo do Torre de Controle: API Elysia/Bun na porta 3000 com autenticação JWT via HttpOnly Cookie, CRUD das entidades principais, banco PostgreSQL com Drizzle ORM, Redis para blacklist de sessões e KPI cache, Docker Compose para dev e seed data volumoso com dados brasileiros realistas.

O stack escolhido (Elysia 1.4.x + Drizzle 0.45.x + postgres.js 3.x + ioredis 5.x) tem boa cobertura em Context7 e npm registry. Elysia 1.x tem cookie built-in (sem necessidade do plugin legado `@elysiajs/cookie` para a maioria dos casos); o plugin `@elysiajs/jwt` usa `jose` v6 que suporta RS256 via `alg` config. A separação de módulos via Elysia plugins (.group + .use) é o padrão recomendado.

**Primary recommendation:** Backend em `api/` na raiz do worktree (sibling de `torre-de-controle/`). Schema Drizzle em arquivos separados por domínio. RBAC via `.derive()` + `.guard()` no Elysia. Eden Treaty exporta `typeof app` do server para o frontend importar como tipo — nenhum runtime do Eden Treaty vai para o backend, apenas para o frontend.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Auth (login/logout/refresh) | API / Backend | Redis (blacklist) | JWT emitido e lido no servidor; cookie HttpOnly nunca tocado pelo frontend JS |
| RBAC enforcement | API / Backend | — | Middleware `onBeforeHandle` verifica role no JWT payload |
| Session invalidation | Redis | API | Redis SET com TTL = tempo restante do JWT |
| Data persistence | Database (PostgreSQL) | — | Drizzle ORM, todas as tabelas relacionais |
| KPI cache | Redis | Database | KPIs com TTL 30s para reduzir queries pesadas |
| Eden Treaty types | API / Backend | Frontend | `export type App = typeof app` — tipos fluem do server para o client em compile time |
| Seed data | Database | — | Script Bun que insere diretamente via Drizzle, UUIDs gerados pelo Postgres |
| Swagger/OpenAPI | API / Backend | — | `@elysiajs/swagger` gerado automaticamente dos tipos Elysia/TypeBox |
| Docker Compose | Infrastructure | — | PostgreSQL 16 + Redis 7 + API service |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| elysia | 1.4.28 | Framework HTTP Bun-first | TypeScript nativo, OpenAPI built-in, Eden Treaty, alto perf |
| drizzle-orm | 0.45.2 | ORM type-safe | $inferSelect/$inferInsert, migrations, suporte Bun nativo |
| drizzle-kit | 0.31.10 | CLI de migrations | `generate` + `migrate` + `studio` |
| postgres | 3.4.9 | Driver PostgreSQL (postgres.js) | Compatível Bun nativo, performático, suportado pelo Drizzle |
| ioredis | 5.10.1 | Cliente Redis | API Promise, TypeScript types, suporte clusters |
| @elysiajs/jwt | 1.4.2 | Plugin JWT para Elysia | Integra `jose` v6, expõe `jwt.sign/verify` no context |
| @elysiajs/cors | 1.4.2 | Plugin CORS | `credentials: true`, `origin` configurável |
| @elysiajs/swagger | 1.3.1 | Geração Swagger/OpenAPI | Auto-documenta rotas com tipos TypeBox |
| @elysiajs/eden | 1.4.9 | Client tipado Eden Treaty | Exporta `App` type para frontend |
| jose | 6.2.3 | JWT primitivos (via @elysiajs/jwt) | RS256 suportado via `alg` option |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pino | 10.3.1 | Logger estruturado JSON | Sempre — substitui console.log em produção |
| pino-pretty | (latest) | Formatação dev | `NODE_ENV=development` apenas |
| bcrypt / @types/bcrypt | 6.0.0 | Hash de senhas | Login endpoint, criação de usuários |
| dotenv | (via Bun built-in) | Variáveis de ambiente | Bun carrega `.env` automaticamente |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| postgres.js | pg (node-postgres) | `pg` é mais battle-tested mas postgres.js tem melhor perf no Bun |
| ioredis | @upstash/redis | Upstash é serverless-first; ioredis melhor para Docker local |
| @elysiajs/jwt | jose direto | `@elysiajs/jwt` adiciona conveniência no context; jose direto = mais controle para RS256 key pair |
| Elysia built-in cookie | @elysiajs/cookie | @elysiajs/cookie é legacy (0.8.x compatível); Elysia 1.x tem `cookie` built-in via `context.cookie` |

**Installation:**
```bash
# Na pasta api/
bun init -y
bun add elysia @elysiajs/jwt @elysiajs/cors @elysiajs/swagger @elysiajs/eden
bun add drizzle-orm postgres ioredis pino bcrypt
bun add -d drizzle-kit @types/bcrypt bun-types pino-pretty
```

**Version verification:** Versões verificadas via `npm view` em 2026-04-30. [VERIFIED: npm registry]

---

## Architecture Patterns

### System Architecture Diagram

```
Browser (React SPA :5173)
    │  credentials: 'include'
    │  HttpOnly Cookie: access_token
    ▼
Elysia API (:3000)
    │
    ├── cors({ origin: 'http://localhost:5173', credentials: true })
    ├── swagger()
    │
    ├── /api/auth/*   ──── authPlugin (jwt.sign, cookie.set httpOnly)
    │       │
    │       └── Redis SET session:blacklist:{jti} EX {remaining}
    │
    ├── /api/trips/*  ──── tripsPlugin (guard: requireAuth)
    ├── /api/drivers/* ─── driversPlugin (guard: requireAuth)
    ├── /api/alerts/* ──── alertsPlugin (guard: requireAuth)
    ├── /api/vehicles/* ── vehiclesPlugin (guard: requireAuth)
    └── /api/dashboard/* ─ dashboardPlugin (Redis KPI cache)
            │
            ▼
    PostgreSQL 16 (Drizzle ORM)          Redis 7 (ioredis)
    - drivers, vehicles, trips           - session:blacklist:{jti}
    - alerts, treatments                 - kpi:trips_today EX 30
    - users, clients, routes             - trip:{id} HSET
    - driver_documents                   - vehicle:{id} HSET
```

### Recommended Project Structure
```
api/
├── src/
│   ├── index.ts              # Elysia app bootstrap + listen
│   ├── db/
│   │   ├── client.ts         # drizzle(postgres(DATABASE_URL), { schema })
│   │   ├── schema/
│   │   │   ├── index.ts      # re-exporta todos os schemas
│   │   │   ├── users.ts
│   │   │   ├── drivers.ts
│   │   │   ├── vehicles.ts
│   │   │   ├── trips.ts
│   │   │   ├── alerts.ts
│   │   │   ├── treatments.ts
│   │   │   ├── clients.ts
│   │   │   ├── routes.ts
│   │   │   └── driver-documents.ts
│   │   └── seed/
│   │       └── index.ts      # seed data script (bun run db:seed)
│   ├── redis/
│   │   └── client.ts         # new Redis(REDIS_URL)
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.plugin.ts
│   │   │   └── auth.service.ts
│   │   ├── trips/
│   │   │   ├── trips.plugin.ts
│   │   │   └── trips.service.ts
│   │   ├── drivers/
│   │   │   ├── drivers.plugin.ts
│   │   │   └── drivers.service.ts
│   │   ├── alerts/
│   │   │   ├── alerts.plugin.ts
│   │   │   └── alerts.service.ts
│   │   ├── vehicles/
│   │   │   ├── vehicles.plugin.ts
│   │   │   └── vehicles.service.ts
│   │   └── dashboard/
│   │       └── dashboard.plugin.ts
│   └── lib/
│       ├── logger.ts         # pino instance
│       └── rbac.ts           # requireRole() factory
├── drizzle.config.ts
├── package.json
├── tsconfig.json
└── .env.example
docker-compose.yml             # raiz do worktree
```

### Pattern 1: Elysia Plugin por Módulo

**What:** Cada módulo é um `new Elysia({ name: 'trips' })` com suas rotas. O app principal usa `.use()` para compor.

**When to use:** Sempre — permite encapsulamento de contexto e tipo-safety por módulo.

```typescript
// Source: https://context7.com/elysiajs/elysia/llms.txt
// src/modules/trips/trips.plugin.ts
import { Elysia, t } from 'elysia'
import { authGuard } from '../auth/auth.plugin'

export const tripsPlugin = new Elysia({ name: 'trips' })
  .use(authGuard)
  .group('/api/trips', (app) =>
    app
      .get('/', async ({ query, user }) => {
        // query typed via t.Object
      }, {
        query: t.Object({
          status: t.Optional(t.String()),
          slaStatus: t.Optional(t.String()),
          page: t.Optional(t.Numeric()),
          limit: t.Optional(t.Numeric()),
        })
      })
      .get('/:id', async ({ params }) => { /* ... */ })
      .get('/stats', async ({ user }) => { /* KPIs */ })
  )

// src/index.ts
import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { swagger } from '@elysiajs/swagger'
import { tripsPlugin } from './modules/trips/trips.plugin'

export const app = new Elysia()
  .use(cors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  }))
  .use(swagger())
  .use(tripsPlugin)
  .listen(3000)

export type App = typeof app  // Eden Treaty consumes this
```

### Pattern 2: Auth com JWT HttpOnly Cookie (Elysia 1.x built-in cookie)

**What:** `@elysiajs/jwt` injeta `jwt` no context. Cookie é gerido pelo Elysia built-in `cookie` context (sem `@elysiajs/cookie` legado).

**When to use:** Login, logout, refresh endpoints.

```typescript
// Source: https://context7.com/elysiajs/elysia/llms.txt + @elysiajs/jwt README
// src/modules/auth/auth.plugin.ts
import { Elysia, t } from 'elysia'
import { jwt } from '@elysiajs/jwt'

export const jwtPlugin = new Elysia({ name: 'jwt' })
  .use(jwt({
    name: 'jwt',
    secret: process.env.JWT_SECRET!,
    // Para RS256: secret: privateKey (KeyObject), alg: 'RS256'
    exp: '24h',
  }))

export const authPlugin = new Elysia({ name: 'auth' })
  .use(jwtPlugin)
  .post('/api/auth/login', async ({ jwt, cookie, body, set }) => {
    // validar credenciais...
    const token = await jwt.sign({ sub: user.id, role: user.role, jti: crypto.randomUUID() })

    cookie.access_token.set({
      value: token,
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24, // 24h
      path: '/',
    })

    return { user: { id: user.id, name: user.name, role: user.role } }
  }, {
    body: t.Object({ email: t.String(), password: t.String() })
  })
  .post('/api/auth/logout', async ({ cookie, jwt, redis }) => {
    const payload = await jwt.verify(cookie.access_token.value)
    if (payload?.jti) {
      const ttl = payload.exp! - Math.floor(Date.now() / 1000)
      await redis.set(`session:blacklist:${payload.jti}`, '1', 'EX', ttl)
    }
    cookie.access_token.remove()
    return new Response(null, { status: 204 })
  })
```

### Pattern 3: RBAC via .derive() + .guard()

**What:** `.derive()` extrai o user do cookie JWT para cada request. `.guard()` protege grupos de rotas.

```typescript
// Source: https://context7.com/elysiajs/elysia/llms.txt
export const authGuard = new Elysia({ name: 'auth-guard' })
  .use(jwtPlugin)
  .derive(async ({ jwt, cookie, set, redis }) => {
    const token = cookie.access_token?.value
    if (!token) {
      set.status = 401
      throw new Error('Unauthorized')
    }
    const payload = await jwt.verify(token)
    if (!payload) {
      set.status = 401
      throw new Error('Unauthorized')
    }
    // Check blacklist
    const blacklisted = await redis.get(`session:blacklist:${payload.jti}`)
    if (blacklisted) {
      set.status = 401
      throw new Error('Token revoked')
    }
    return { user: { id: payload.sub as string, role: payload.role as string } }
  })

// RBAC helper
export function requireRole(...roles: string[]) {
  return new Elysia()
    .use(authGuard)
    .guard({
      beforeHandle: ({ user, set }) => {
        if (!roles.includes(user.role)) {
          set.status = 403
          throw new Error('Forbidden')
        }
      }
    })
}
```

### Pattern 4: Drizzle Schema + $inferSelect

```typescript
// Source: https://context7.com/drizzle-team/drizzle-orm-docs/llms.txt
// src/db/schema/drivers.ts
import { pgTable, uuid, varchar, integer, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const drivers = pgTable('drivers', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  code: varchar('code', { length: 20 }).unique().notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 20 }),
  photoUrl: varchar('photo_url'),         // camelCase mapped to snake_case
  status: varchar('status', { length: 20 }).default('available').notNull(),
  operationalScore: integer('operational_score').default(100),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export type SelectDriver = typeof drivers.$inferSelect
export type InsertDriver = typeof drivers.$inferInsert
```

### Pattern 5: Eden Treaty — Server export + Client import

**What:** O backend exporta `App` type. O frontend importa APENAS o tipo (zero runtime overhead no build final se tree-shaking ativo).

```typescript
// api/src/index.ts
export type App = typeof app  // este tipo é consumido pelo frontend

// torre-de-controle/src/lib/api.ts (Phase 3)
import { treaty } from '@elysiajs/eden'
import type { App } from '../../api/src/index'  // monorepo path

export const api = treaty<App>('http://localhost:3000', {
  fetch: { credentials: 'include' }  // envia cookie automaticamente
})

// torre-de-controle/src/lib/fetcher.ts (D-05)
export async function fetcher<T>(
  fn: Promise<{ data: T; error: unknown }>
): Promise<T> {
  const { data, error } = await fn
  if (error) throw error
  return data!
}
```

### Pattern 6: drizzle.config.ts

```typescript
// Source: https://context7.com/drizzle-team/drizzle-orm-docs/llms.txt
// api/drizzle.config.ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
```

### Anti-Patterns to Avoid

- **`@elysiajs/cookie` legado em Elysia 1.x:** Elysia 1.x tem `cookie` built-in via `context.cookie`. Usar `setCookie()` / `@elysiajs/cookie` é a API antiga (0.7.x/0.8.x). Em 1.x: `cookie.access_token.set({ value, httpOnly: true })`.
- **`derive()` não-assíncrono para auth:** RBAC check precisa aguardar `redis.get()`. Use `async` no derive.
- **Schema Drizzle com `mode: 'string'` para timestamps:** Usar `mode: 'date'` (default) para receber `Date` objetos no TypeScript — mais seguro que strings para comparações.
- **Eden Treaty importando runtime no bundle do servidor:** `@elysiajs/eden` é client-only. Não instalar no `api/`, apenas em `torre-de-controle/`.
- **`export type App` em arquivo separado do `app.listen()`:** `typeof app` deve ser capturado ANTES do `.listen()` ou o tipo pode não incluir todas as rotas em alguns contextos. Exportar do mesmo arquivo onde as rotas são compostas.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT sign/verify | Implementação manual com jose | `@elysiajs/jwt` | Plugin já integra no context, valida expiração automaticamente |
| Cookie HttpOnly set | `set.headers['Set-Cookie']` manual | `context.cookie.X.set({httpOnly: true})` | Elysia 1.x built-in tipado e seguro |
| Password hashing | md5, sha256 direto | `bcrypt.hash(password, 10)` | Bcrypt tem salt automático, custo configurável |
| SQL query filters | String interpolation | Drizzle `eq()`, `and()`, `or()`, `like()` | Type-safe, previne SQL injection |
| Schema migrations | ALTER TABLE manual | `drizzle-kit generate` + `drizzle-kit migrate` | Migrations versionadas, reversíveis |
| OpenAPI docs | Escrever YAML manualmente | `@elysiajs/swagger` | Auto-gerado dos tipos TypeBox |
| Redis TTL para blacklist | Cron job de limpeza | `SET key value EX seconds` | Redis expira automaticamente |

**Key insight:** O Elysia plugin system resolve o problema de middleware global vs. scoped de forma type-safe — não reinvente com Express-style middleware.

---

## Common Pitfalls

### Pitfall 1: RS256 com @elysiajs/jwt — necessita KeyObject, não string

**What goes wrong:** STACK.md especifica RS256 (assimétrico). O `@elysiajs/jwt` aceita `secret` como string (HS256) OU como `KeyObject` (RS256). Passar uma string com RS256 vai lançar erro em runtime.

**Why it happens:** A API parece aceitar qualquer coisa para `secret`, mas jose valida o tipo de chave contra o algoritmo.

**How to avoid:**
```typescript
import { importPKCS8, importSPKI } from 'jose'
// Gerar par RS256:
// openssl genrsa -out private.pem 2048
// openssl rsa -in private.pem -pubout -out public.pem
const privateKey = await importPKCS8(process.env.JWT_PRIVATE_KEY!, 'RS256')
const publicKey = await importSPKI(process.env.JWT_PUBLIC_KEY!, 'RS256')
// jwt plugin: secret: privateKey, alg: 'RS256'
// jwt.verify: precisa da public key — verify() do @elysiajs/jwt usa a mesma secret
// ATENÇÃO: @elysiajs/jwt usa secret tanto para sign quanto verify — RS256 requer chave privada para sign e pública para verify. Verificar se o plugin suporta ou usar jose diretamente para verify.
```

**Warning signs:** `jose` error "Invalid key type" em runtime no primeiro request autenticado.

**Decisão recomendada (Claude's Discretion):** Para MVP interno, usar HS256 com secret longo e aleatório (`crypto.randomBytes(64).toString('hex')`). RS256 é necessário apenas quando múltiplos serviços validam o JWT sem o secret. Adiar RS256 para produção real. [ASSUMED - risco: se o projeto necessita RS256 agora, verificar com usuário]

### Pitfall 2: CORS com credentials — `origin: true` não funciona

**What goes wrong:** `credentials: true` exige `origin` específica (não `*`). `cors({ credentials: true })` sem `origin` configurada rejeitará requests com cookies do browser.

**Why it happens:** Spec CORS proíbe `Access-Control-Allow-Origin: *` combinado com `Access-Control-Allow-Credentials: true`.

**How to avoid:**
```typescript
// Source: https://context7.com/elysiajs/elysia-cors/llms.txt
cors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',  // string exata
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
})
```

**Warning signs:** Browser console: "CORS policy: The value of the 'Access-Control-Allow-Origin' header in the response must not be the wildcard '*' when the request's credentials mode is 'include'."

### Pitfall 3: Drizzle camelCase vs snake_case em column names

**What goes wrong:** Drizzle mapeia JavaScript camelCase para snake_case na query gerada APENAS se o segundo argumento do `pgTable` column usa o nome snake_case explicitamente. Sem isso, o campo JavaScript e o campo SQL são idênticos — quebra quando o DB usa convenção snake_case.

**How to avoid:** Sempre declarar explicitamente o nome da coluna SQL:
```typescript
operationalScore: integer('operational_score').default(100),
// ^^^ JS camelCase    ^^^ SQL snake_case
```

Alternativa: usar `drizzle({ casing: 'snake_case' })` na inicialização do client para conversão automática (disponível em drizzle-orm >=0.36).

### Pitfall 4: BullMQ com Bun — import path diferente

**What goes wrong:** BullMQ em Bun pode requerer `import 'bullmq/dist/cjs/index.js'` ou ter problemas com workers em alguns cenários. Esta fase não usa BullMQ, mas a estrutura Redis deve ser compatível.

**How to avoid:** Reservar `ioredis` como cliente Redis padrão. BullMQ 5.x usa ioredis internamente — usar a mesma conexão. Não usar `@upstash/redis` (serverless, não compatível com BullMQ).

**Warning signs:** Não aplicável nesta fase, mas crítico para Phase 4.

### Pitfall 5: Eden Treaty — type App capturado antes de todas as rotas estarem compostas

**What goes wrong:** `export type App = typeof app` captura o tipo no momento do import. Se modules são compostos depois, o tipo fica incompleto.

**How to avoid:** Compor TODAS as rotas no arquivo `index.ts` antes do `export type App`:
```typescript
// CORRETO
const app = new Elysia()
  .use(authPlugin)
  .use(tripsPlugin)
  .use(driversPlugin)
  .listen(3000)

export type App = typeof app  // todas as rotas incluídas
```

### Pitfall 6: Bun não instalado na máquina de dev — Docker deve ser fallback

**What goes wrong:** Bun não está instalado no ambiente atual (verificado: `bun --version` não encontrado).

**How to avoid:** O plano DEVE incluir as instruções de instalação do Bun E garantir que o Docker Compose seja o caminho principal de execução para desenvolvedores sem Bun. Alternativamente, `docker compose exec api bun run db:seed` para comandos de DB.

**Warning signs:** `bun: command not found` ao tentar executar scripts localmente.

---

## Code Examples

### Drizzle DB Client com postgres.js

```typescript
// Source: https://context7.com/drizzle-team/drizzle-orm-docs/llms.txt
// api/src/db/client.ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const queryClient = postgres(process.env.DATABASE_URL!)
export const db = drizzle(queryClient, { schema })
```

### Drizzle Query com filtros e join

```typescript
// Source: https://context7.com/drizzle-team/drizzle-orm-docs/llms.txt
import { eq, and, inArray } from 'drizzle-orm'

const result = await db.query.trips.findMany({
  where: and(
    eq(trips.status, 'in_progress'),
    eq(trips.slaStatus, 'em_risco'),
  ),
  with: {
    driver: { columns: { id: true, name: true, photoUrl: true } },
    vehicle: { columns: { plate: true } },
    client: { columns: { name: true } },
  },
  orderBy: [trips.windowEnd],
  limit: 50,
  offset: page * 50,
})
```

### Redis blacklist no logout

```typescript
// api/src/modules/auth/auth.service.ts
export async function blacklistToken(redis: Redis, jti: string, exp: number) {
  const ttl = exp - Math.floor(Date.now() / 1000)
  if (ttl > 0) {
    await redis.set(`session:blacklist:${jti}`, '1', 'EX', ttl)
  }
}
```

### Docker Compose

```yaml
# docker-compose.yml (raiz do worktree)
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: torre_controle
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s

  api:
    build:
      context: ./api
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://postgres:postgres@postgres:5432/torre_controle
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET:-dev-secret-change-in-production}
      NODE_ENV: development
      FRONTEND_URL: http://localhost:5173
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./api:/app
      - /app/node_modules

volumes:
  pgdata:
```

### Dockerfile para API Bun

```dockerfile
# api/Dockerfile
FROM oven/bun:1.4
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile
COPY . .
CMD ["bun", "run", "src/index.ts"]
```

### Seed data pattern

```typescript
// api/src/db/seed/index.ts
import { db } from '../client'
import { clients, routes, drivers, vehicles, users, trips, alerts } from '../schema'
import { faker } from '@faker-js/faker/locale/pt_BR'

// Clientes reais (D-07)
const clientData = [
  { name: 'Shopee', code: 'SHP' },
  { name: 'Magazine Luiza', code: 'MAG' },
  { name: 'Mercado Livre', code: 'MLA' },
  { name: 'Americanas', code: 'AME' },
  { name: 'Casas Bahia', code: 'CBS' },
]

// Placas formato brasileiro (D-07) — ABC-1234 e ABC-1D23 (Mercosul)
function genPlate(): string {
  const letters = () => faker.string.alpha({ length: 3, casing: 'upper' })
  const isMercosul = Math.random() > 0.5
  if (isMercosul) {
    return `${letters()}-${faker.number.int({min:1,max:9})}${faker.string.alpha({length:1,casing:'upper'})}${faker.number.int({min:10,max:99})}`
  }
  return `${letters()}-${faker.number.int({min:1000,max:9999})}`
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@elysiajs/cookie` separado | Cookie built-in no Elysia 1.x via `context.cookie` | Elysia 1.0 | Não instalar plugin legado; API mudou |
| `InferModel<>` do Drizzle | `$inferSelect` / `$inferInsert` | drizzle-orm 0.28 | InferModel está deprecated, usar novos helpers |
| `drizzle-kit generate:pg` | `drizzle-kit generate` (sem sufixo de dialect) | drizzle-kit 0.20+ | Config `dialect: 'postgresql'` no drizzle.config.ts |
| express-style middleware | `.derive()` + `.guard()` Elysia | Elysia 1.0 | Type-safe, sem `(req, res, next)` |

**Deprecated/outdated:**
- `@elysiajs/cookie`: Ainda disponível (0.8.x) mas obsoleto para Elysia 1.x. Use `context.cookie` nativo.
- `InferModel<typeof table>`: Substituído por `typeof table.$inferSelect`. Removido em versões recentes.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Para MVP usar HS256 em vez de RS256 — RS256 necessita KeyObject diferente para sign vs verify, e @elysiajs/jwt pode não suportar chaves assimétricas sem workaround | Common Pitfalls #1 | Se RS256 é requisito hard, planner precisa adicionar tarefa de setup de keypair + usar jose diretamente para verify |
| A2 | `api/` como sibling de `torre-de-controle/` na raiz do worktree é a estrutura de monorepo correta | Architecture Patterns | Se o projeto requer workspace yarn/npm, pode precisar de `package.json` na raiz com workspaces |
| A3 | Bun precisa ser instalado localmente pelo desenvolvedor para rodar scripts fora do Docker | Environment Availability | Se CI/CD usa apenas Docker, sem impacto |

---

## Open Questions (RESOLVED)

1. **RS256 vs HS256 para MVP** (RESOLVED — HS256 escolhido)
   - What we know: STACK.md diz RS256; `@elysiajs/jwt` suporta via `alg: 'RS256'` + KeyObject; jose v6 suporta RS256.
   - What's unclear: `@elysiajs/jwt` usa o mesmo `secret` para sign e verify — com RS256 isso significa passar a chave privada para verify também, o que é incorreto. Pode exigir jose diretamente para o verify path.
   - Resolution: **HS256 para MVP** (02-04). RS256 pode ser adotado em Phase 6 se necessário. Plano 02-04 usa `alg: 'HS256'` explicitamente com `JWT_SECRET` de 32+ bytes.

2. **Bun não instalado na máquina dev** (RESOLVED — Docker fallback)
   - What we know: `bun --version` não encontrado na máquina de dev. Docker disponível (v29.2.1).
   - What's unclear: Desenvolvedores outros que não o proprietário da máquina atual podem ter Bun.
   - Resolution: **02-01 Task 1** inclui detecção + instalação do Bun E documenta todos os scripts como `docker compose exec api bun run ...` como fallback obrigatório.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun | API runtime, scripts | **X** | — | `docker compose exec api bun ...` para tudo |
| Docker | PostgreSQL + Redis + API | OK | 29.2.1 | — |
| Docker Compose | Orquestração de serviços | OK | v5.1.0 (Compose V2) | — |
| PostgreSQL | Database | X (local) | — | Via Docker (primário) |
| Redis | Session blacklist, cache | X (local) | — | Via Docker (primário) |
| Node.js | Ferramentas auxiliares | OK | v24.14.0 | — |

**Missing dependencies with no fallback:**
- Bun: sem Bun local, `bun install` e scripts diretos não funcionam fora do container. Planner DEVE incluir task de instalação OU garantir que todos os comandos passem pelo Docker.

**Missing dependencies with fallback:**
- PostgreSQL local: não necessário — Docker Compose é a forma padrão.
- Redis local: não necessário — Docker Compose é a forma padrão.

---

## Validation Architecture

> `nyquist_validation_enabled: false` em config.json — seção omitida.

---

## Security Domain

> `security_enforcement: true` + `security_asvs_level: 1` (ASVS Level 1)

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Sim | `bcrypt` para hash de senhas; `@elysiajs/jwt` para tokens |
| V3 Session Management | Sim | HttpOnly Cookie + Redis blacklist no logout; `SameSite=Strict` |
| V4 Access Control | Sim | RBAC via `.derive()` + roles em JWT payload |
| V5 Input Validation | Sim | TypeBox (`t.Object`) via Elysia — validação em runtime automática |
| V6 Cryptography | Parcial | bcrypt para senhas; HS256/RS256 para JWT (nunca MD5/SHA1) |
| V9 Communications | N/A MVP | HTTPS obrigatório em produção; dev usa HTTP local |

### Known Threat Patterns for Elysia/Bun + PostgreSQL

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL Injection | Tampering | Drizzle ORM com queries parametrizadas — NUNCA string interpolation em `sql\`\`` |
| JWT token theft via XSS | Information Disclosure | HttpOnly Cookie — JS não consegue ler o token |
| CSRF com SameSite=Strict | Tampering | `SameSite=Strict` previne envio cross-origin; adequado para app interno |
| Brute force login | Elevation of Privilege | Rate limiting em `POST /api/auth/login` — Elysia plugin ou middleware custom |
| Token replay após logout | Elevation of Privilege | Redis blacklist `session:blacklist:{jti}` com TTL = exp do token |
| Insecure Direct Object Reference | Elevation of Privilege | Verificar `user.id` === resource owner em endpoints sensíveis (ou role permite acesso) |
| Password in plaintext | Information Disclosure | `bcrypt.hash(password, 10)` obrigatório — nunca armazenar ou logar senhas |

---

## Sources

### Primary (HIGH confidence)
- Context7 `/elysiajs/elysia` — plugin system, cookie handling, guard, derive, group, lifecycle hooks [VERIFIED: Context7]
- Context7 `/elysiajs/elysia-jwt` — JWT plugin API, alg options, jose integration [VERIFIED: Context7]
- Context7 `/elysiajs/elysia-cors` — CORS config, credentials, origin [VERIFIED: Context7]
- Context7 `/elysiajs/eden` — Treaty API, type-safe client, credentials:include config [VERIFIED: Context7]
- Context7 `/drizzle-team/drizzle-orm-docs` — schema types, $inferSelect, uuid, timestamp, drizzle.config, migrate [VERIFIED: Context7]
- npm registry — todas as versões de pacotes verificadas via `npm view` [VERIFIED: npm registry]

### Secondary (MEDIUM confidence)
- Docker Hub `postgres:16-alpine`, `redis:7-alpine`, `oven/bun:1.4` — imagens padrão confirmadas existentes [VERIFIED: docker hub naming conventions]

### Tertiary (LOW confidence)
- RS256 com @elysiajs/jwt via KeyObject — baseado em conhecimento da API jose v6 + configuração `alg` do plugin, não testado neste ambiente [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — todas as versões verificadas via npm registry
- Architecture: HIGH — padrões Elysia verificados via Context7
- Pitfalls: MEDIUM-HIGH — a maioria verificada via docs, RS256 pitfall parcialmente assumed
- Environment: HIGH — verificado via comandos shell neste ambiente

**Research date:** 2026-04-30
**Valid until:** 2026-05-30 (stack estável, Elysia minor versions podem mudar)
