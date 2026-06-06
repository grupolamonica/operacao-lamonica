# Fase 13 — Dashboard: paridade com o painel + correções

> **Objetivo:** alinhar a tela **Dashboard** (`/dashboard`) com o padrão do painel GAS:
> métricas corretas, SLA explicado, exceções clicáveis (deep-link p/ Ocorrências),
> viagens em andamento completas e ordenadas, resumo operacional fiel ao filtro de SLA.
> **Tipo:** plano (não executa). **Escopo:** `pages/dashboard/*` + `modules/dashboard` + `modules/sla`.

---

## Diagnóstico do estado atual (o que está errado)

`api/src/modules/dashboard/dashboard.service.ts` (`getDashboardKpis`):
- **SLA só de "hoje"** (`windowStart >= today`) — ignora o filtro de período e a base real.
- **Tipos de alerta LEGADOS** (`atraso_critico`, `parada_nao_planejada`) que **não existem** na taxonomia atual (`atraso`, `parada`, …) → `atrasosCriticos`/`paradas` sempre ~0.
- **`sparkline = Math.random()`** → dado **fake** nos KPIs.
- Carrega **todas as ~13k trips em memória** (`db.select().from(trips)`) — pesado; deve ser agregação SQL.

Frontend:
- `ExceptionsAlertsPanel`: mostra `alerts.length` (todos `aberto`, inclusive de viagens **já concluídas**) → conta diverge do real; **ticket não é clicável**.
- `TripsInProgressTable`: só `status='in_progress'`; **sem ordenação** por proximidade de descarga; não inclui `planned`/`delayed`.
- `OperationalSummary`: usa os KPIs legados + 3 fetches separados; não reflete o filtro de SLA.
- `DashboardKPIRow`: 5 cards (Entregas, %SLA, Motoristas em risco, Atrasos críticos, Paradas) — não batem com o painel (que tem Total/No Prazo/Atrasadas/Concluídas/Alertas/Tickets/%NoPrazo).

---

## Itens do objetivo → mudanças

### 1. Exceção/alerta clicável → Ocorrências com o ticket aberto
**Frontend.**
- `AlertItem` (`components/domain/AlertItem.tsx`): aceitar `onClick?(id)` na variante `list`.
- `ExceptionsAlertsPanel`: `onClick` → `navigate('/alertas?alert=' + id)`.
- `AlertasPage` (`pages/alertas/AlertasPage.tsx`): ler `useSearchParams().get('alert')` no mount → `setSelectedAlertId(id)` (já existe no `useUIStore`) e abrir o painel/detalhe da ocorrência; se o filtro de período esconder o alerta, **resetar p/ 30d** para garantir que apareça.
- Verificar que o detalhe da ocorrência abre por `selectedAlertId` (se não houver painel de detalhe, abrir o card correspondente / rolar até ele).

### 2. SLA — corrigir + explicar o valor
**Backend `getDashboardKpis` (reescrever) + Frontend KPICard.**
- **% No Prazo = noPrazo / (noPrazo + atrasadas)** das viagens **com prazo aferido** (mesma conta do painel: 61/(61+31)=66,3%). Não usar "hoje"; respeitar o **filtro de SLA** (período: hoje/7d/30d/tudo).
- `no_prazo`/`atrasado`: usar `sla_status` real; para concluídas, `arrived_at <= window_end + morosidade_horas`.
- **Explicação:** o card "% No Prazo" mostra subtítulo/tooltip com a fração (`61 no prazo de 92 aferidas — período: 30d`) para o usuário entender o número.
- Remover o `Math.random()` (sparkline real a partir de série diária, ou remover o sparkline).

### 3. Exceções: contagem no padrão do painel (só viagens não concluídas)
**Backend + Frontend.**
- Contar **alertas abertos cujas viagens NÃO estão concluídas/canceladas** (igual ao `getTicketsAbertos` do GAS, que ignora concluídas).
- Novo agregado no backend: `ticketsPendentes` = alerts `aberto/em_analise/em_tratativa` com `trip_id` em viagem ativa. `ExceptionsAlertsPanel` usa esse número (não `alerts.length`).
- Resolve o "234 vs real": hoje conta alertas órfãos/de concluídas.

### 4. Viagens em andamento: todas não-concluídas/não-canceladas, ordem de descarga
**Frontend (e suporte no `listTrips`).**
- `TripsInProgressTable`: trocar `status:'in_progress'` por filtro **ativo** = `status NOT IN ('completed','cancelled')` (in_progress + planned + delayed).
- **Ordenar por proximidade de descarga**: `ETA asc` (mais próximo primeiro); empate → `km restante (distance_total-done) asc`.
- Suporte: `listTrips` aceitar `activeOnly` + `orderBy=eta` (ou o hook filtra/ordena client-side a partir de `useTrips({limit})`).

### 5. Resumo operacional: dados atualizados conforme o filtro de SLA
**Frontend + Backend.**
- `OperationalSummary` deve consumir os agregados corrigidos (item 2/3) e o **mesmo período do filtro de SLA** — não 3 `useTrips` soltos + KPIs legados.
- Linhas: em andamento / planejadas / concluídas (no período) / atrasos / motoristas em risco — todos do agregado novo.

### 6. Métricas iguais ao painel (imagem)
**Frontend `DashboardKPIRow` (substituir) + Backend.**
Cards na ordem do painel:
`Total de Viagens · No Prazo · Atrasadas · Concluídas · Alertas · 🎫 Tickets Pendentes · % No Prazo`.
- `Total` = trips no período do filtro; `Concluídas` = completed; `No Prazo`/`Atrasadas` = ativas por SLA; `Alertas` = exceções abertas (item 3); `Tickets Pendentes` = open alerts (item 3); `% No Prazo` (item 2).

---

## Backend — contrato novo (`getDashboardKpis`, agregação SQL)
```jsonc
{
  "filtroSla": "30d",                 // hoje | 7d | 30d | tudo (default 30d)
  "total": 5059,
  "concluidas": 4947,
  "noPrazo": 61, "atrasadas": 31,
  "pctNoPrazo": 66.3,
  "pctNoPrazoBreakdown": { "noPrazo": 61, "aferidas": 92, "periodo": "30d" },  // explicação
  "alertas": 49,                      // exceções abertas (viagens ativas)
  "ticketsPendentes": 3058,           // alerts aberto/análise/tratativa (ativas)
  "motoristasEmRisco": 0,
  "sla": { "pct": 66.3, "meta": 95 }
}
```
- 100% via SQL `count(*) FILTER (...)` (sem carregar trips em memória; sem `Math.random`).
- Tipos de alerta REAIS. Cache Redis 30s (já existe).
- Endpoint aceita `?periodo=` (filtro SLA).

---

## Waves de execução (quando for executar)
1. **Wave A — Backend KPIs.** Reescrever `getDashboardKpis` (agregação SQL + filtro período + contrato acima); ajustar `dashboard.plugin` p/ `?periodo`.
2. **Wave B — Métricas + SLA + Resumo.** `DashboardKPIRow` (7 cards do painel), `OperationalSummary` (agregado novo + filtro), explicação do % No Prazo.
3. **Wave C — Exceções + deep-link.** Contagem de pendentes (ativas); `AlertItem` clicável; `AlertasPage` abre por `?alert=`.
4. **Wave D — Viagens em andamento.** Filtro ativo + ordenação por ETA/km.
5. Typecheck (api+front) + build + deploy (runner self-hosted).

## Critérios de sucesso
- % No Prazo bate com `noPrazo/(noPrazo+atrasadas)` e mostra a fração que explica o número.
- "Exceções e alertas" conta = alertas abertos de **viagens ativas** (igual ao painel), sem órfãos.
- "Viagens em andamento" lista todas as não concluídas/canceladas, **a mais próxima de descarregar no topo**.
- Métricas idênticas às do painel (Total/No Prazo/Atrasadas/Concluídas/Alertas/Tickets/%NoPrazo).
- Clicar num ticket no dashboard abre a tela de Ocorrências **com aquele ticket aberto**.
- Sem dado fake (fim do `Math.random`); sem tipos de alerta legados.

## Riscos / decisões
- **Período padrão do filtro SLA**: definir (sugiro **30d**) — afeta Total/Concluídas/%.
- **"Alertas" vs "Tickets Pendentes"** no painel são números diferentes (49 vs 3058) — confirmar a semântica: Alertas = exceções abertas *agora* (ativas); Tickets Pendentes = todos os tickets em aberto (inclui histórico não fechado). Mapear certo no agregado.
- `AlertasPage` precisa de um detalhe de ocorrência abrível por id (verificar se existe; senão, criar/scrollar).
