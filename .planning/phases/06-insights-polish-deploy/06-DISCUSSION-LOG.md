# Phase 6 — Discussion Log

**Date:** 2026-05-28
**Phase:** 06-insights-polish-deploy
**Mode:** discuss (default, no --power/--all/--batch)

---

## Domain Boundary

Phase 6 é a entrega final do MVP: analytics histórico (Insights), exportação CSV, Web Push, página Configurações (usuários + thresholds + GPS providers), mobile responsividade tablet+, performance Lighthouse>80/LCP<3s, deploy Railway+Cloudflare Pages, CI/CD GitHub Actions, observabilidade Sentry, documentação de deploy.

## Areas Selected for Discussion

User selecionou **todas as 4 áreas** apresentadas:
- Insights — escopo e granularidade
- CSV Export — escopo + formato
- Web Push — quem, quando, provider
- Deploy CI/CD + Sentry + Migrations

## Area 1: Insights

### Q1: Quais métricas a página deve mostrar?
- Apresentadas: SLA histórico, Ranking motoristas, Rotas problemáticas, Distribuição alertas
- **Selected (multi):** todas as 4
- → D-01

### Q2: Range temporal padrão?
- Apresentadas: 7d / 30d / 90d / configurável
- **Selected:** Últimos 30 dias (Recomendado)
- → D-02

### Q3: Chart library?
- Apresentadas: Chart.js / Recharts / ECharts
- **Selected:** Chart.js (já instalado — Recomendado)
- → D-03

### Q4: Drill-down vs flat?
- Apresentadas: Flat (4 cards independentes) / Drill-down cross-filter
- **Selected:** Drill-down (clique em SLA filtra outros 3 cards)
- → D-04 (trade-off complexidade vs valor analítico aceito)

## Area 2: CSV Export

### Q1: Entidades exportáveis?
- Apresentadas: Viagens, Alertas, Tratativas, Motoristas
- **Selected (multi):** todas as 4
- → D-06

### Q2: Filtros + formato?
- Apresentadas: filtros+BOM+`;` / tudo+BOM+`;` / filtros+RFC4180
- **Selected:** Aplicar filtros atuais + UTF-8 BOM + delim `;` (Recomendado)
- → D-07, D-08

### Q3: Estratégia sync vs async?
- Apresentadas: streaming síncrono / async BullMQ + email
- **Selected:** Síncrono streaming (Recomendado)
- → D-09

## Area 3: Web Push

### Q1: Provider?
- Apresentadas: VAPID / FCM / OneSignal
- **User asked clarification:** "e o supabase?"
- **Resposta de Claude:** Explicado que Supabase não oferece serviço nativo de Web Push (só Postgres/Auth/Realtime/Storage/Edge Functions). Para push via Supabase, precisaria ainda assim integrar OneSignal/FCM ou implementar VAPID por conta própria. Como o stack já é Elysia/Bun não-Supabase, não compensa.
- **Re-apresentada pergunta** (3 opções viáveis sem Supabase)
- **Selected:** VAPID self-hosted (Recomendado)
- → D-11

### Q2: Quem recebe e o que dispara?
- Apresentadas: todos + críticos / só supervisor+admin + crítico+médio / configurável por usuário
- **Selected:** Configurável por usuário em Configurações
- → D-13, D-14, D-15

### Q3: Notif fora do horário operacional?
- Apresentadas: 24/7 / só horário operacional
- **Selected:** Sempre enviar 24/7 (Recomendado)
- → D-15

## Area 4: Deploy CI/CD + Sentry + Migrations

### Q1: Estratégia GitHub Actions?
- Apresentadas: PR checks + main deploy / mesmo + manual / só main sem CI
- **Selected:** PR roda lint+build+typecheck; main faz deploy auto (Recomendado)
- → D-34, D-35

### Q2: Migrations Drizzle no deploy?
- Apresentadas: push automático / migrate SQL files / manual
- **Selected:** `drizzle-kit push` automático antes do deploy (Recomendado)
- → D-37 (risk aceito: code review de schema changes em PR)

### Q3: Sentry escopo + scrubbing?
- Apresentadas: full-stack scrub free tier / só backend / pular Sentry
- **Selected:** Front + back, scrub PII/JWT/lat-lng, free tier (Recomendado)
- → D-38, D-39, D-40, D-41, D-42

### Q4: Estratégia mobile responsiva?
- Apresentadas: tablet+ / phone-first / desktop only
- **Selected:** Tablet+ (≥1024px) (Recomendado pelo ROADMAP "mínimo tablet")
- → D-21, D-22, D-23, D-24, D-25

## Deferred Ideas (Scope Creep Captured)

- Quiet hours / silenciamento por horário (D-15 fica 24/7)
- Multi-canal de notificação (email, SMS, WhatsApp)
- Drill-down avançado em Insights (histórico individual por motorista)
- Filtros salvos / dashboards customizados
- Particionamento mensal de vehicle_positions
- Mapbox Directions API para ETA preciso
- Ambiente staging separado
- Phone-first responsivo
- Migrations SQL versionado (drizzle-kit migrate)
- Sentry Replay
- Sentry → Slack/Discord
- i18n
- A/B testing infra
- OpenAPI público

## Claude's Discretion (orchestrator decide)

- Layout grid exato dos 4 cards Insights
- Estrutura interna dos endpoints `/api/insights/*` (uma query vs múltiplas)
- Forma exata da query string para drill-down
- Estrutura do Service Worker (lifecycle, cache)
- Estrutura dos `.github/workflows/*.yml` (matrix, cache)
- Configuração `railway.toml` / Procfile
- Configuração Cloudflare Pages
- Estrutura de forms em Configurações
- Cache strategy para thresholds
- Estrutura das tabelas auxiliares novas

## Outcome

CONTEXT.md criado com:
- 44 implementation decisions (D-01..D-44)
- 4 categorias: Insights, CSV, Web Push, Configurações, Mobile, Performance, Deploy, CI/CD, Sentry, Docs
- Canonical refs apontando para PROJECT.md, ARCHITECTURE.md, STACK.md, ROADMAP.md, types.ts, hooks/, schema/
- Code patterns reusáveis identificados (SparklineChart, TableWithSidePanel, authGuard, Eden Treaty)
- Specifics com exemplos de código (endpoints, SW, beforeSend Sentry, GitHub Actions)
- Deferred ideas capturadas (15 itens)

Downstream (researcher → planner) tem decisões suficientes para não precisar consultar o usuário em pontos críticos.
