import { db } from '../../db/client'
import { redis } from '../../redis/client'
import { trips } from '../../db/schema/trips'
import { alerts } from '../../db/schema/alerts'
import { drivers } from '../../db/schema/drivers'

const KPI_CACHE_KEY = 'kpi:dashboard'
const KPI_CACHE_TTL = 30

export async function getDashboardKpis() {
  const cached = await redis.get(KPI_CACHE_KEY)
  if (cached) {
    try { return JSON.parse(cached) } catch { /* fall through */ }
  }

  const [allTrips, allAlerts, allDrivers] = await Promise.all([
    db.select().from(trips),
    db.select().from(alerts),
    db.select().from(drivers),
  ])

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayTrips = allTrips.filter(t => t.windowStart >= today || (t.arrivedAt && t.arrivedAt >= today))
  const onTime     = todayTrips.filter(t => t.slaStatus === 'no_prazo' || (t.status === 'completed' && t.arrivedAt! <= t.windowEnd)).length
  const totalToday = todayTrips.length
  const slaPct     = totalToday > 0 ? Math.round((onTime / totalToday) * 100) : 100

  const motoristasEmRiscoCount = allDrivers.filter(d => d.avgDelayMinutes > 10 && d.status === 'on_route').length
  const atrasosCriticosCount   = allAlerts.filter(a => a.type === 'atraso_critico' && a.status !== 'resolvido').length
  const paradasCount           = allAlerts.filter(a => a.type === 'parada_nao_planejada' && a.status !== 'resolvido').length

  const sparkline = Array.from({ length: 7 }, () => Math.max(0, Math.round(Math.random() * 10)))

  const kpis = {
    entregas: { onTime, total: totalToday, pct: slaPct },
    sla:      { pct: slaPct, meta: 95 },
    motoristasEmRisco:    { count: motoristasEmRiscoCount, total: allDrivers.length, sparkline: [...sparkline] },
    atrasosCriticos:      { count: atrasosCriticosCount,   total: allAlerts.length,  sparkline: [...sparkline] },
    paradasNaoPlanejadas: { count: paradasCount,           total: allAlerts.length,  sparkline: [...sparkline] },
  }

  await redis.set(KPI_CACHE_KEY, JSON.stringify(kpis), 'EX', KPI_CACHE_TTL)
  return kpis
}
