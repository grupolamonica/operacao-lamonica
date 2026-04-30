# Phase 2: Backend Core + Auth — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-30
**Phase:** 02-backend-core-auth-api-foundation
**Areas discussed:** Token JWT, Eden Treaty, Seed data

---

## Token JWT

| Option | Description | Selected |
|--------|-------------|----------|
| HttpOnly Cookie | Token invisível ao JavaScript. SameSite=Strict. Frontend usa credentials: 'include'. | ✓ |
| Bearer / localStorage | Authorization header. Mais simples, token perdido ao recarregar. | |

**User's choice:** HttpOnly Cookie
**Notes:** App interno corporativo. SameSite=Strict elimina CSRF sem config adicional. Operadores não perdem sessão ao recarregar página.

---

## Eden Treaty

| Option | Description | Selected |
|--------|-------------|----------|
| Eden Treaty | Tipos end-to-end automáticos. Monorepo facilita. Wrapper fetcher() obrigatório para erros. | ✓ |
| REST + fetch manual | Desacoplado. Tipos escritos à mão. Risco de drift silencioso. | |

**User's choice:** Eden Treaty
**Notes:** Time pequeno, monorepo, Phase 3 substitui mocks. Custo do wrapper é único e pequeno.

---

## Seed Data

| Option | Description | Selected |
|--------|-------------|----------|
| Independente (UUIDs reais, 50+ viagens) | Zero dívida técnica. Phase 3 troca hooks sem migração de IDs. | ✓ |
| Espelhado (replica mocks do frontend) | Frontend "bate" imediatamente, mas IDs sequenciais incompatíveis com UUIDs. | |

**User's choice:** Independente
**Notes:** Phase 3 é a próxima fase imediata. Seed espelhado criaria migração de IDs desnecessária.

---

## Claude's Discretion

- Estrutura interna dos módulos Elysia
- Configuração Pino logger
- Drizzle schema organization
- Scripts de desenvolvimento (db:generate, db:migrate, db:seed, db:reset)

## Deferred Ideas

- Frontend integration / Eden Treaty hooks (Phase 3)
- GPS Simulator (Phase 3)
- Alert Engine BullMQ (Phase 4)
- WebSocket broadcast (Phase 3)
