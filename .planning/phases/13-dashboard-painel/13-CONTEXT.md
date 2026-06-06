# Fase 13 — Dashboard: paridade com painel + correções — CONTEXT

> Decisões de implementação travadas na discussão. Alimenta o planner/executor.
> Plano de referência: `13-PLAN.md` (mesma pasta).

## Domínio
Tela **Dashboard** (`/dashboard`) — não é a Torre de Controle nem Viagens. Entregar paridade
com o painel GAS: métricas corretas, SLA explicado, exceções clicáveis (deep-link p/ Ocorrências),
viagens em andamento completas e ordenadas, resumo operacional fiel ao filtro de SLA.
**Sem novas capacidades** — só corrigir/alinhar o que a tela já tem.

## Decisões travadas (do usuário)
1. **Período padrão do filtro SLA = 30 dias.** Total de Viagens, Concluídas e % calculados sobre 30d.
   Haverá **seletor** no dashboard: Hoje / 7d / 30d / Tudo (default 30d). `getDashboardKpis` aceita `?periodo=`.
2. **% No Prazo = igual ao painel:** `noPrazo / (noPrazo + atrasadas)` das viagens com prazo aferido
   (ex.: 61/92 = 66,3%). O card "% No Prazo" **mostra a fração** (`61 de 92 aferidas · 30d`) p/ explicar o número.
3. **"Viagens em andamento" = `status NOT IN ('completed','cancelled')`** (in_progress + planned + delayed),
   **ordenadas por ETA asc** (mais próximo de descarregar no topo); empate → **menor km restante** (`distance_total-done`).
4. **"Alertas" e "Tickets Pendentes" são DOIS números distintos** (igual ao painel):
   - **Alertas** = exceções ABERTAS agora de viagens ATIVAS (não concluídas/canceladas).
   - **Tickets Pendentes** = todos os tickets/alertas em aberto (`aberto/em_analise/em_tratativa`), inclui histórico não fechado.

## Decisões de implementação (Claude — técnicas)
- **`getDashboardKpis` reescrito em agregação SQL** (`count(*) FILTER`), sem carregar ~13k trips em memória,
  **sem `Math.random()`** (fim do sparkline fake) e **sem tipos de alerta legados** (`atraso_critico`/`parada_nao_planejada`).
  Usa `sla_status` real + `arrived_at <= window_end + morosidade_horas` p/ concluídas. Cache Redis 30s (já existe).
- **Métricas (cards) na ordem do painel:** `Total · No Prazo · Atrasadas · Concluídas · Alertas · 🎫 Tickets Pendentes · % No Prazo`.
- **Deep-link ticket → Ocorrências:** `AlertItem` recebe `onClick`; `ExceptionsAlertsPanel` navega `'/alertas?alert=<id>'`;
  `AlertasPage` lê `?alert=` no mount → `setSelectedAlertId` (já existe em `useUIStore`) e abre a ocorrência;
  se o filtro de período da tela de Ocorrências esconder o alerta, **resetar p/ 30d** pra garantir que apareça.
- **Resumo operacional** consome o agregado novo + o mesmo `periodo` do filtro SLA (não 3 `useTrips` soltos).
- Contrato JSON do `getDashboardKpis`: ver `13-PLAN.md` (total, concluidas, noPrazo, atrasadas, pctNoPrazo,
  pctNoPrazoBreakdown, alertas, ticketsPendentes, motoristasEmRisco, sla, filtroSla).

## Canonical refs (ler antes de planejar/executar)
- `.planning/phases/13-dashboard-painel/13-PLAN.md` — plano + contrato + waves.
- `.planning/phases/12-data-migration-lamonica/DOC-ScriptControleViagens.md` — lógica do painel GAS (fonte da paridade).
- Painel GAS (referência visual): `https://script.google.com/macros/s/AKfycbwEZ0sEoi4TlrsMmrkxDvjVIH_WsHl-UblUXTkXdXM6kl8RTsP9I0mB1yl1mP2FJlM2/exec`
- Backend a mudar: `api/src/modules/dashboard/dashboard.service.ts`, `dashboard.plugin.ts`; `api/src/modules/trips/trips.service.ts` (ordenação/active).
- Frontend a mudar: `torre-de-controle/src/app/pages/dashboard/{DashboardKPIRow,ExceptionsAlertsPanel,TripsInProgressTable,OperationalSummary}.tsx`,
  `pages/alertas/AlertasPage.tsx`, `components/domain/AlertItem.tsx`, `hooks/useDashboardKPIs.ts`, `stores/useUIStore.ts` (selectedAlertId).

## Code context (reusar)
- `KPICard` (cards), `DataTable` (tabela + paginação client-side), `StatusBadge`/`RiskBadge`.
- `useUIStore.selectedAlertId` já existe → usar p/ o deep-link.
- `getTripStats` (trips.service) + os agregados de `torre.service` como modelo de SQL `FILTER`.
- `regulamentacao.ts` + `trips.morosidade_horas` (já no schema) p/ o SLA.
- Clientes: Shopee/Casas Bahia/Nestlé/Griffi (já no banco).

## Deferred (fora desta fase)
- Tela/gráfico de **KM diário** (`trip_daily_km` já populado, sem UI).
- Exibir **morosidade** no detalhe da viagem.
- Remover **usuário dev** (`dev.local@torre.test`) da prod; consertar **CI** (job frontend sem deps do api/).

## Open questions
Nenhuma — as 4 decisões-chave foram travadas. Pronto p/ planejar/executar.
