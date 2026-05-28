---
phase: 02-backend-core-auth-api-foundation
plan: "04"
subsystem: api/auth
tags: [jwt, hs256, httponly-cookie, rbac, rate-limit, redis-blacklist]
key_files:
  created:
    - api/src/lib/jwt.ts
    - api/src/lib/rbac.ts
    - api/src/modules/auth/auth.service.ts
    - api/src/modules/auth/auth.plugin.ts
decisions:
  - "HS256 chosen for MVP (not RS256) — @elysiajs/jwt requires same secret for sign+verify; RS256 deferred to Phase 6 with jose"
  - "JWT_SECRET minimum 32 chars enforced at startup — fail-fast"
  - "HttpOnly + SameSite=Strict cookies (D-01, D-02, D-03)"
  - "Constant-time bcrypt compare via DUMMY_HASH when user not found (ASVS V2)"
  - "Rate limit: 10 attempts / 60s per IP via Redis INCR+EXPIRE"
  - "cookie.access_token?.value cast to string | undefined to satisfy TypeScript"
metrics:
  duration: ~8min
  completed: "2026-05-28"
  tasks: 3
  files: 4
---

# Phase 02 Plan 04: Auth Module — JWT HS256, HttpOnly Cookie, RBAC, Rate Limit

## Exported Surface

### api/src/lib/jwt.ts
- `jwtPlugin` — Elysia plugin wrapping @elysiajs/jwt with HS256, 24h exp, jti claim
- `JWT_EXPIRES_IN` — env-based expiry constant
- `jwtPayloadSchema` — TypeBox schema for payload (sub, role, jti)

### api/src/lib/rbac.ts
- `authGuard` — Elysia plugin, `.derive({ as: 'scoped' })`, reads cookie → verifies JWT → checks Redis blacklist
- `requireRole(...roles)` — factory, returns Elysia plugin enforcing role membership
- `AuthUser` — type `{ id, role, jti }`

### api/src/modules/auth/auth.service.ts
- `validateCredentials(email, password)` — constant-time bcrypt compare, returns SelectUser|null
- `blacklistJti(jti, exp)` — Redis SET session:blacklist:{jti} EX {ttl}
- `isJtiBlacklisted(jti)` — Redis GET check
- `hashPassword(plain)` — bcrypt.hash with cost 10

### api/src/modules/auth/auth.plugin.ts
Routes:
- `POST /api/auth/login` — rate-limited, sets HttpOnly cookie, returns user object
- `POST /api/auth/logout` — blacklists jti, removes cookie, 204
- `GET /api/auth/me` — authGuard protected, returns { id, role }
- `POST /api/auth/refresh` — blacklists old jti, issues new token

## HS256 vs RS256 Migration Path
RS256 requires keypair; `@elysiajs/jwt` uses a shared secret. Migration to RS256 via `jose` is Phase 6 production hardening. When: before public launch.

## Rate Limit Thresholds
10 attempts / 60s / IP. Redis key: `ratelimit:login:{ip}`. Rationale: balances friction for brute force vs. false positives for legitimate users with bad password memory. Can be tightened per deployment.

## Usage for Plan 05/06 Executors
- `.use(authGuard)` — protect any route (adds `context.user: AuthUser`)
- `.use(requireRole('admin', 'supervisor'))` — restrict to elevated roles (403 for others)
- No `Authorization: Bearer` — cookie-only auth (D-03)

## Self-Check: PASSED
- jwt.ts validates JWT_SECRET length ✓
- rbac.ts uses `.derive({ as: 'scoped' })` ✓
- auth.plugin.ts httpOnly: true, sameSite: 'strict' ✓
- ratelimit:login: prefix ✓
- session:blacklist: prefix ✓
- tsc --noEmit EXIT 0 ✓
