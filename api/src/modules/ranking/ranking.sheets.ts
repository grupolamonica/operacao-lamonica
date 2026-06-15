/**
 * Ranking data layer — fonte de viagens.
 *
 * "Trabalhar só com o aspx": NÃO lê mais NENHUMA planilha online (Google Sheets).
 * As viagens vêm da tabela `trips` do Supabase do ranking, alimentada ao vivo
 * pelo job rank-sync com os dados do SPX (aspx). Cache Redis 60s (D-V2). O
 * vínculo também não vem mais de planilha — vive em `drivers.vinculo` (editável).
 */

import type { SheetTrip } from './ranking.types';
import { getRankSupabase } from './ranking.supabase';

// Lazy redis import: ../../redis/client throws at module-eval if REDIS_URL is
// unset (fail-fast). Importing it at top-level would make merely *importing* this
// module (e.g. via ranking.service in pure-composition unit tests) crash without
// Redis configured. Defer to call-time, when REDIS_URL is present in prod.
async function getRedis() {
  const { redis } = await import('../../redis/client');
  return redis;
}

// "Trabalhar só com a API": as viagens do ranking vêm da tabela `trips` (consolidada —
// backfill das abas shopee/shopee_2025 cruzado com a API + alimentada ao vivo pelo job
// rank-sync com os dados do SPX). NÃO lê mais a planilha DBLHHISTORICO.
export const SHEET_TRIPS_CACHE_KEY = 'ranking:sheets:trips';
// TTL is 60s (D-V2 short cache, T-07-07); inlined as a literal in redis.set below.

const sval = (v: unknown) => (v == null ? '' : String(v));

/** Mapeia uma linha da tabela `trips` para o shape SheetTrip que o pipeline consome. */
function tripRowToSheetTrip(r: Record<string, unknown>): SheetTrip {
  return {
    sta_origin_date: sval(r.sta_origin_date),
    trip_number: sval(r.trip_number),
    status_agrupado: sval(r.status_agrupado),
    solicitation_by: '',
    planned_vehicle: '',
    used_vehicle: '',
    used_agency_name: '',
    driver_id: sval(r.driver_id),
    driver_name: sval(r.driver_name),
    vehicle_number: sval(r.vehicle_plate_number),
    origin_station_code: sval(r.origin_station_code),
    destination_station_code: sval(r.destination_station_code),
    eta_scheduled_origin_edited: sval(r.eta_scheduled_origin_edited),
    cpt_scheduled_origin_edited: '',
    eta_destination_edited: sval(r.eta_destination_edited),
    id_rota: '',
    eta_realizado: sval(r.eta_realizado),
    // Status REAL da fonte (Shopee, com tolerância). resolveStatus o usa quando
    // for ON TIME/EARLY/DELAY; só recalcula pela data quando vazio (ex.: SPX recente).
    status_eta: sval(r.status_eta),
    ocorrencia_eta: '',
    cpt_realizado: '',
    status_cpt: '',
    ocorrencia_cpt: '',
    eta_destino_realizado: sval(r.eta_destino_realizado),
    status_eta_destino: sval(r.status_eta_destino),
    ocorrencia_eta_destino: '',
    horario_de_descarga: '',
    sum_orders: '',
    checkin_origin_operator: '',
    checkout_origin_operator: '',
    checkin_destination_operator: '',
    eta_origin_realized: '',
    cpt_origin_realized: '',
    eta_destination_realized: '',
    atualizacao: sval(r.updated_at),
  } as SheetTrip;
}

/**
 * Lê as viagens do ranking da tabela `trips` (Supabase do ranking) — consolidada
 * das planilhas Shopee + alimentada ao vivo pelo SPX (job rank-sync). Resultado
 * cacheado no Redis 60s (D-V2). Erros PROPAGAM (o endpoint da Plan 04 trata).
 */
export async function getSheetTrips(): Promise<SheetTrip[]> {
  const redis = await getRedis();
  const cached = await redis.get(SHEET_TRIPS_CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached) as SheetTrip[];
    } catch {
      /* corrupt cache — fall through and re-fetch */
    }
  }

  const db = getRankSupabase();
  const all: Record<string, unknown>[] = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await db.from('trips').select('*').range(from, from + pageSize - 1);
    if (error) throw new Error(`Failed to read trips: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...(data as Record<string, unknown>[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const trips = all.map(tripRowToSheetTrip);

  await redis.set(SHEET_TRIPS_CACHE_KEY, JSON.stringify(trips), 'EX', 60);
  return trips;
}
