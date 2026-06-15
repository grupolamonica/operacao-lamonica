/**
 * Visão 360 da viagem — UM envelope com tudo cruzado dinamicamente, pro operador:
 *   viagem (FK motorista/veículo/cliente/rota + ETA/SLA recalculado ao vivo)
 *   + motorista (cadastro Torre + ranking + cadastro Cargas + vínculo)
 *   + carga (Cargas, por LH) + cavalo/carreta (+ vigência Angellira)
 *   + risco + GPS (última posição) + timeline (eventos+alertas+tratativas)
 *
 * Low-load: reaproveita os serviços existentes (que já são alimentados pelos
 * jobs e não batem em SPX/Angellira no read path) e CACHEIA o envelope inteiro
 * no Redis por 20s. Assim o polling do front não re-roda os joins pesados —
 * a carga (Cargas) e o ranking são consultados no máximo 1×/20s por viagem,
 * só quando a viagem está aberta (decisão: buscar no clique, cache curto).
 *
 * Lazy redis import (mesmo padrão de ranking.sheets/ranking.cache): o client
 * faz fail-fast se REDIS_URL faltar; importar no topo quebraria testes puros.
 */
import { getTripById } from './trips.service'
import { getTripDossie } from './dossie.service'
import { getTripTimeline } from './timeline.service'
import { getTripRisk, recalcTripRisk } from '../risk/risk.service'
import { getDriverLastPosition } from '../positions/positions.service'

const CACHE_TTL_S = 20
const cacheKey = (id: string) => `viagem360:${id}`

async function getRedis() {
  const { redis } = await import('../../redis/client')
  return redis
}

export async function getViagem360(tripId: string): Promise<Record<string, unknown> | null> {
  const key = cacheKey(tripId)
  try {
    const redis = await getRedis()
    const cached = await redis.get(key)
    if (cached) return JSON.parse(cached) as Record<string, unknown>
  } catch { /* cache best-effort */ }

  const viagem = await getTripById(tripId)
  if (!viagem) return null

  const [dossie, timeline, risco] = await Promise.all([
    getTripDossie(tripId).catch(() => null),
    getTripTimeline(tripId).catch(() => []),
    // paridade com GET /:id/risk: snapshot persistido, senão recalcula ao vivo.
    getTripRisk(tripId).then((r) => r ?? recalcTripRisk(tripId)).catch(() => null),
  ])

  const motNome =
    dossie?.motorista?.nome ||
    (viagem as Record<string, unknown>).driverName as string ||
    (viagem as Record<string, unknown>).motorista as string ||
    ''
  const gps = motNome ? await getDriverLastPosition(motNome).catch(() => null) : null

  const envelope = {
    viagem,
    motorista: dossie?.motorista ?? null,
    carga: dossie?.carga ?? null,
    cavalo: dossie?.cavalo ?? null,
    carreta: dossie?.carreta ?? null,
    risco: risco ?? null,
    gps,
    timeline,
    geradoEm: new Date().toISOString(),
  }

  try {
    const redis = await getRedis()
    await redis.set(key, JSON.stringify(envelope), 'EX', CACHE_TTL_S)
  } catch { /* cache best-effort */ }

  return envelope
}
