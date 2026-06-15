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
import { getDriverLastPosition, getDriverTrack } from '../positions/positions.service'

const CACHE_TTL_S = 20
const cacheKey = (id: string) => `viagem360:${id}`

async function getRedis() {
  const { redis } = await import('../../redis/client')
  return redis
}

// Janela temporal DESTA viagem p/ recortar o trajeto (driver_positions não tem FK
// de viagem). Sem recorte, a polyline liga pontos de TODAS as viagens do motorista
// (o bug das "várias linhas"). Início = partida real (ou janela planejada); fim =
// chegada real; senão agora (em curso) ou o prazo + folga (concluída, p/ pegar a
// chegada atrasada). Teto de 5 dias cobre um long-haul mas exclui semanas de outras
// viagens quando os campos de data faltam/estão ruins.
const TRACK_MAX_WINDOW_MS  = 5 * 24 * 3600 * 1000 // teto defensivo p/ UMA viagem
const TRACK_LATE_GRACE_MS  = 12 * 3600 * 1000     // folga p/ chegada após o prazo planejado
function tripTrackWindow(v: Record<string, unknown>): { from: string; to: string } {
  const parse = (x: unknown): Date | null => {
    if (!x) return null
    const d = new Date(x as string | number | Date)
    return isNaN(d.getTime()) ? null : d
  }
  const active  = !['completed', 'cancelled'].includes(String(v.status ?? ''))
  const nowMs   = Date.now()
  const startD  = parse(v.departedAt) ?? parse(v.windowStart)
  const arrived = parse(v.arrivedAt)
  const planned = parse(v.windowEnd) ?? parse(v.eta)
  // Fim da janela.
  let endMs: number
  if (arrived) endMs = arrived.getTime()                 // chegada real = verdade
  else if (active) endMs = nowMs                          // em curso → até agora
  else endMs = planned ? planned.getTime() + TRACK_LATE_GRACE_MS : nowMs // concluída sem chegada → prazo+folga
  if (endMs > nowMs) endMs = nowMs                        // não existe GPS no futuro
  // Início: partida real/planejada. Sem isso, OU janela > teto, OU início depois do fim
  // (dado ruim, ex.: departedAt no futuro) → recua só o teto a partir do fim.
  let startMs = startD ? startD.getTime() : endMs - TRACK_MAX_WINDOW_MS
  if (startMs > endMs || endMs - startMs > TRACK_MAX_WINDOW_MS) startMs = endMs - TRACK_MAX_WINDOW_MS
  return { from: new Date(startMs).toISOString(), to: new Date(endMs).toISOString() }
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
  // Trajeto recortado à janela DESTA viagem (não todas as viagens do motorista).
  const win = tripTrackWindow(viagem as Record<string, unknown>)
  const [gps, track] = await Promise.all([
    motNome ? getDriverLastPosition(motNome).catch(() => null)              : Promise.resolve(null),
    motNome ? getDriverTrack(motNome, win.from, win.to).catch(() => [])     : Promise.resolve([]),
  ])

  const envelope = {
    viagem,
    motorista: dossie?.motorista ?? null,
    carga: dossie?.carga ?? null,
    cavalo: dossie?.cavalo ?? null,
    carreta: dossie?.carreta ?? null,
    risco: risco ?? null,
    gps,
    track,
    timeline,
    geradoEm: new Date().toISOString(),
  }

  try {
    const redis = await getRedis()
    await redis.set(key, JSON.stringify(envelope), 'EX', CACHE_TTL_S)
  } catch { /* cache best-effort */ }

  return envelope
}
