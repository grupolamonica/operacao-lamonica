/**
 * Ranking data layer — Google Sheets (public gviz CSV) fetch + parse.
 *
 * Ported from ride-rank `src/services/sheetsService.ts` (CSV_URL, parseCSVLine,
 * parseCSV, SheetTrip). The CSV is a PUBLIC Google Sheet (no credentials) read
 * via the gviz endpoint, so it runs identically on the server.
 *
 * Differences from the ride-rank source:
 *   - CSV_URL is built from `RANK_SHEET_ID` / `RANK_SHEET_TAB` env vars, falling
 *     back to the known public sheet/tab.
 *   - The in-memory cache (cachedTrips / fetchPromise) is replaced by the Torre
 *     Redis cache (`ranking:sheets:trips`, TTL 60s) — D-V2 short cache (T-07-07).
 *   - On fetch/parse failure the error PROPAGATES to the caller (the original
 *     swallowed it and returned []). The Plan 04 endpoint handles the error.
 *
 * SECURITY (T-07-05/T-07-06): the CSV is untrusted third-party content; the
 * parser handles quotes/missing cells and only accepts rows with a
 * `trip_number`. There is no eval/exec of the content, and the full CSV is
 * never logged.
 */

import type { SheetTrip, VinculoRecord } from './ranking.types';
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

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

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
    status_eta: '',
    ocorrencia_eta: '',
    cpt_realizado: '',
    status_cpt: '',
    ocorrencia_cpt: '',
    eta_destino_realizado: sval(r.eta_destino_realizado),
    status_eta_destino: '',
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

// --- Vinculos (driver employment bond) — separate public Google Sheet ---

const VINCULO_SHEET_ID = process.env.RANK_VINCULO_SHEET_ID ?? '1l0dI0cphGpddSWgPx65hyVTqAm5i7H4RlXo4h2OzIMU';
const VINCULO_CSV_URL = `https://docs.google.com/spreadsheets/d/${VINCULO_SHEET_ID}/gviz/tq?tqx=out:csv`;

export const VINCULOS_CACHE_KEY = 'ranking:sheets:vinculos';

/**
 * Fetch the public vinculo CSV (columns: motorista, vinculo), parse + cache in
 * Redis 60s. Ported from ride-rank `vinculoService.fetchVinculos`.
 *
 * UNLIKE getSheetTrips, fetch/parse failures are SWALLOWED (returns []) — the
 * vinculo is display-only enrichment, not a critical ranking input, so an outage
 * of this sheet must never break GET /api/ranking/drivers. Worst case the drivers
 * keep the '—' fallback (same as before this feature). T-07-06: never log PII.
 */
export async function fetchVinculos(): Promise<VinculoRecord[]> {
  try {
    const redis = await getRedis();
    const cached = await redis.get(VINCULOS_CACHE_KEY);
    if (cached) {
      try {
        return JSON.parse(cached) as VinculoRecord[];
      } catch {
        /* corrupt cache — fall through and re-fetch */
      }
    }

    const response = await fetch(VINCULO_CSV_URL);
    if (!response.ok) throw new Error(`Failed to fetch vinculos: ${response.status}`);

    const csv = await response.text();
    const lines = csv.split('\n').filter((line) => line.trim() !== '');
    const records: VinculoRecord[] = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = parseCSVLine(lines[i]);
      const motorista = (vals[0] || '').replace(/^"|"$/g, '').trim();
      const vinculo = (vals[1] || '').replace(/^"|"$/g, '').trim();
      if (motorista && vinculo) records.push({ motorista, vinculo });
    }

    await redis.set(VINCULOS_CACHE_KEY, JSON.stringify(records), 'EX', 60);
    return records;
  } catch {
    return [];
  }
}
