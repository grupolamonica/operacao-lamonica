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

import { redis } from '../../redis/client';
import type { SheetTrip } from './ranking.types';

const SHEET_ID = process.env.RANK_SHEET_ID ?? '1MWTiaXU3HXW_iVn-n70WSk3o8rcHTRrQP2ac07W9cCU';
const SHEET_TAB = process.env.RANK_SHEET_TAB ?? 'DBLHHISTORICO';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_TAB)}`;

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

function parseCSV(csv: string): SheetTrip[] {
  const lines = csv.split('\n').filter((line) => line.trim() !== '');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map((h) => h.replace(/^"|"$/g, '').trim());

  const trips: SheetTrip[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    // Skip empty rows
    if (values.every((v) => v === '' || v === '""')) continue;

    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      if (header) {
        row[header] = (values[idx] || '').replace(/^"|"$/g, '').trim();
      }
    });

    // Only include rows that have at least a trip_number
    if (row.trip_number) {
      trips.push(row as SheetTrip);
    }
  }

  return trips;
}

/**
 * Fetch the public DBLHHISTORICO CSV, parse it into SheetTrip[], and cache the
 * result in Redis for 60s. On a cache hit returns the cached value; otherwise
 * fetches, parses, caches and returns. Fetch/parse errors PROPAGATE.
 */
export async function getSheetTrips(): Promise<SheetTrip[]> {
  const cached = await redis.get(SHEET_TRIPS_CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached) as SheetTrip[];
    } catch {
      /* corrupt cache — fall through and re-fetch */
    }
  }

  const response = await fetch(CSV_URL);
  if (!response.ok) {
    // T-07-06: log only the status, never the body/PII.
    throw new Error(`Failed to fetch sheet: ${response.status}`);
  }

  const csv = await response.text();
  const trips = parseCSV(csv);

  await redis.set(SHEET_TRIPS_CACHE_KEY, JSON.stringify(trips), 'EX', 60);
  return trips;
}
