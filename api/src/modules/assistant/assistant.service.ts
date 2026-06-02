import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../../db/client'
import { trips } from '../../db/schema/trips'
import { alerts } from '../../db/schema/alerts'
import { classifyIntent, SUGGESTED_QUESTIONS, type IntentId, type IntentMatch } from './assistant.intents'
import { getBreakdown } from '../bi/bi.service'
import { forecastDemand, forecastRegions } from '../forecast/forecast.service'

export interface AssistantResponse {
  answer:      string                   // human-readable
  intent:      IntentId
  confidence:  number
  matched?:    string
  data?:       AssistantData            // optional structured payload for UI cards
  suggestions: string[]
}

export type AssistantData =
  | { kind: 'trips';        rows: Array<{ code: string; clientName: string; riskLevel: string | null; eta: string | null; status: string }> }
  | { kind: 'alerts';       rows: Array<{ id: string; title: string; severity: string; status: string; occurredAt: string }> }
  | { kind: 'breakdown';    rows: Array<{ label: string; primary: number; pct?: number; secondary?: number }>; primaryLabel: string; secondaryLabel?: string }
  | { kind: 'kpi';          metric: string; value: string | number; subtitle?: string }
  | { kind: 'forecast';     total7d: number; trend: string; history: number[]; forecast: number[] }

/**
 * Entry point. NL question → intent → existing services → structured answer.
 * Future LLM fallback: when intent.confidence < 0.4 and ANTHROPIC_API_KEY is
 * set, route the question to Claude API with a system prompt + selected
 * function-calling tools that wrap the same services used here.
 */
export async function answerQuestion(question: string): Promise<AssistantResponse> {
  const match = classifyIntent(question)
  if (match.intent === 'unknown' || match.confidence < 0.4) {
    return {
      answer:      'Não consegui interpretar a pergunta com confiança. Tente uma das sugestões abaixo.',
      intent:      'unknown',
      confidence:  match.confidence,
      matched:     match.matched,
      suggestions: SUGGESTED_QUESTIONS,
    }
  }

  switch (match.intent) {
    case 'trips_at_risk':         return await answerTripsAtRisk(match)
    case 'critical_alerts':       return await answerCriticalAlerts(match)
    case 'drivers_with_delays':   return await answerDriversWithDelays(match)
    case 'clients_impacting_sla': return await answerClientsImpactingSla(match)
    case 'sla_today':             return await answerSlaToday(match)
    case 'demand_forecast':       return await answerDemandForecast(match)
    case 'critical_regions':      return await answerCriticalRegions(match)
    case 'top_problematic_routes':return await answerTopProblematicRoutes(match)
    case 'open_occurrences_count':return await answerOpenOccurrences(match)
    case 'fleet_position':        return await answerFleetPosition(match)
    default:                      return await answerUnknown(match)
  }
}

// --- Intent handlers --------------------------------------------------------

async function answerTripsAtRisk(m: IntentMatch): Promise<AssistantResponse> {
  const rows = await db.query.trips.findMany({
    where: and(
      inArray(trips.status, ['in_progress', 'delayed', 'planned']),
      inArray(trips.riskLevel, ['alto', 'critico']),
    ),
    with: { client: { columns: { name: true } } },
    orderBy: (t, { desc }) => [desc(t.riskScore)],
    limit: 10,
  })
  if (rows.length === 0) {
    return baseResponse(m, 'Nenhuma viagem está em risco no momento. Tudo verde.')
  }
  return {
    ...baseResponse(m, `${rows.length} viagem(ns) em risco alto/crítico agora. As primeiras estão listadas abaixo.`),
    data: {
      kind: 'trips',
      rows: rows.map((t) => ({
        code:       t.code,
        clientName: t.client?.name ?? '—',
        riskLevel:  t.riskLevel,
        eta:        t.eta?.toISOString() ?? null,
        status:     t.status,
      })),
    },
  }
}

async function answerCriticalAlerts(m: IntentMatch): Promise<AssistantResponse> {
  const rows = await db.query.alerts.findMany({
    where: and(eq(alerts.severity, 'critico'), inArray(alerts.status, ['aberto', 'em_analise', 'em_tratativa'])),
    orderBy: (a, { desc }) => [desc(a.occurredAt)],
    limit: 10,
  })
  return {
    ...baseResponse(m, rows.length === 0
      ? 'Nenhuma ocorrência crítica em aberto.'
      : `${rows.length} ocorrência(s) crítica(s) em aberto. Aqui estão as mais recentes.`),
    data: {
      kind: 'alerts',
      rows: rows.map((a) => ({
        id: a.id, title: a.title, severity: a.severity, status: a.status, occurredAt: a.occurredAt.toISOString(),
      })),
    },
  }
}

async function answerDriversWithDelays(m: IntentMatch): Promise<AssistantResponse> {
  const breakdown = await getBreakdown('driver', '30d')
  const top = breakdown.filter((b) => b.delayAvgMin > 0 || b.alertsCount > 0)
    .sort((a, b) => (b.delayAvgMin + b.alertsCount * 5) - (a.delayAvgMin + a.alertsCount * 5))
    .slice(0, 10)
  return {
    ...baseResponse(m, top.length === 0
      ? 'Nos últimos 30 dias nenhum motorista acumulou atrasos relevantes.'
      : `Top ${top.length} motoristas por atraso + ocorrências (30d).`),
    data: {
      kind: 'breakdown',
      primaryLabel:   'Atraso médio',
      secondaryLabel: 'Ocorrências',
      rows: top.map((b) => ({ label: b.label, primary: b.delayAvgMin, secondary: b.alertsCount })),
    },
  }
}

async function answerClientsImpactingSla(m: IntentMatch): Promise<AssistantResponse> {
  const breakdown = await getBreakdown('client', '30d')
  const sorted = [...breakdown].sort((a, b) => a.slaPct - b.slaPct).slice(0, 5)
  const worst = sorted[0]
  const intro = worst
    ? `${worst.label} é o cliente com pior SLA (${worst.slaPct}%) nos últimos 30 dias.`
    : 'Sem dados suficientes pra ranking de SLA por cliente.'
  return {
    ...baseResponse(m, intro),
    data: {
      kind: 'breakdown',
      primaryLabel:   'SLA %',
      secondaryLabel: 'Entregas',
      rows: sorted.map((b) => ({ label: b.label, primary: b.slaPct, pct: b.slaPct, secondary: b.deliveries })),
    },
  }
}

async function answerSlaToday(m: IntentMatch): Promise<AssistantResponse> {
  const breakdown = await getBreakdown('client', 'today')
  const totalDel = breakdown.reduce((s, b) => s + b.deliveries, 0)
  const totalOnTime = breakdown.reduce((s, b) => s + b.onTime, 0)
  const totalCompleted = breakdown.reduce((s, b) => s + b.completed, 0)
  const pct = totalCompleted > 0 ? Math.round((totalOnTime / totalCompleted) * 100) : 100
  return {
    ...baseResponse(m, `SLA de hoje: ${pct}% (${totalOnTime}/${totalCompleted} entregas concluídas no prazo; ${totalDel} no total).`),
    data: { kind: 'kpi', metric: 'SLA hoje', value: `${pct}%`, subtitle: `${totalOnTime}/${totalCompleted} no prazo · ${totalDel} totais` },
  }
}

async function answerDemandForecast(m: IntentMatch): Promise<AssistantResponse> {
  const f = await forecastDemand({ horizonDays: 7 })
  const trendText = f.trend === 'up' ? 'em alta' : f.trend === 'down' ? 'em queda' : 'estável'
  return {
    ...baseResponse(m, `Projeção para os próximos 7 dias: ${f.total7d} entregas, tendência ${trendText}.`),
    data: {
      kind:     'forecast',
      total7d:  f.total7d,
      trend:    f.trend,
      history:  f.history.slice(-14).map((p) => p.value),
      forecast: f.forecast.map((p) => p.value),
    },
  }
}

async function answerCriticalRegions(m: IntentMatch): Promise<AssistantResponse> {
  const regions = await forecastRegions()
  const top = regions.slice(0, 5)
  const worst = top[0]
  const intro = worst
    ? `${worst.label} é a região mais crítica (score ${worst.riskScore} · ${worst.trips7d} viagens projetadas).`
    : 'Sem regiões mapeadas.'
  return {
    ...baseResponse(m, intro),
    data: {
      kind: 'breakdown',
      primaryLabel:   'Score',
      secondaryLabel: 'Viagens 7d',
      rows: top.map((r) => ({ label: r.label, primary: r.riskScore, secondary: r.trips7d })),
    },
  }
}

async function answerTopProblematicRoutes(m: IntentMatch): Promise<AssistantResponse> {
  const breakdown = await getBreakdown('route', '30d')
  const top = breakdown.filter((b) => b.alertsCount > 0 || b.delayAvgMin > 0)
    .sort((a, b) => (b.alertsCount + b.delayAvgMin / 10) - (a.alertsCount + a.delayAvgMin / 10))
    .slice(0, 8)
  return {
    ...baseResponse(m, top.length === 0
      ? 'Sem rotas problemáticas nos últimos 30 dias.'
      : `Top ${top.length} rotas mais problemáticas por ocorrências + atraso (30d).`),
    data: {
      kind: 'breakdown',
      primaryLabel:   'Ocorrências',
      secondaryLabel: 'Atraso médio',
      rows: top.map((b) => ({ label: b.label, primary: b.alertsCount, secondary: b.delayAvgMin })),
    },
  }
}

async function answerOpenOccurrences(m: IntentMatch): Promise<AssistantResponse> {
  const rows = await db.select({ severity: alerts.severity }).from(alerts).where(
    inArray(alerts.status, ['aberto', 'em_analise', 'em_tratativa']),
  )
  const total = rows.length
  const crit  = rows.filter((r) => r.severity === 'critico').length
  return {
    ...baseResponse(m, `${total} ocorrência(s) em aberto agora, sendo ${crit} crítica(s).`),
    data: { kind: 'kpi', metric: 'Ocorrências abertas', value: total, subtitle: `${crit} críticas` },
  }
}

async function answerFleetPosition(m: IntentMatch): Promise<AssistantResponse> {
  const active = await db.select().from(trips).where(eq(trips.status, 'in_progress'))
  return {
    ...baseResponse(m, `${active.length} viagem(ns) em andamento agora.`),
    data: { kind: 'kpi', metric: 'Viagens ativas', value: active.length },
  }
}

async function answerUnknown(m: IntentMatch): Promise<AssistantResponse> {
  return {
    ...baseResponse(m, 'Não tenho uma resposta direta. Use uma das sugestões.'),
  }
}

function baseResponse(m: IntentMatch, answer: string): AssistantResponse {
  return {
    answer,
    intent:      m.intent,
    confidence:  m.confidence,
    matched:     m.matched,
    suggestions: SUGGESTED_QUESTIONS,
  }
}
