/**
 * Ranking scoring — pure layer (no I/O).
 *
 * Ported 1:1 from ride-rank `src/services/dataAdapter.ts`. The algorithm is
 * REUSED, not rewritten (decision D-V2-04). `getRouteBasePoints` is imported
 * from ./ranking.routes (the single source) — NOT redefined here, to prevent
 * parity drift (T-07-13) and a noUnusedLocals conflict.
 *
 * PARITY (strict, read-only phase): the original emits some fallback literals
 * that contain mojibake AS DATA VALUES (not just display). These are preserved
 * BYTE-FOR-BYTE from the source — do NOT normalize the encoding here. Encoding
 * correction is Phase 8 (UI). Changing the bytes would change the data.
 *   - transformTrips status_* fallback  → mojibake "â€”" (U+00E2 U+20AC U+201D)
 *   - deriveDrivers vinculo default      → mojibake "â€”" (U+00E2 U+20AC U+201D)
 *   - transformSheetNoShowTrips status_* → clean em-dash "—" (U+2014)
 *     (asymmetry preserved exactly as in the source file)
 *   - driverName / 'Nao atribuido'       → ASCII (no tilde), as in source
 */

import { getRouteBasePoints } from './ranking.routes';
import type { Driver, DriverStatus, RouteScoreRecord, SheetTrip, StatusMetrics, Trip } from './ranking.types';

const VALID_STATUS_VALUES = new Set(['ON TIME', 'EARLY', 'DELAY']);
const SHEET_SOURCE_FIELD = 'DBLHHISTORICO.status_agrupado';

export function normalizeStatusAgrupado(status: string): string {
  return (status || '')
    .trim()
    .toUpperCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function isSheetNoShowStatus(status: string): boolean {
  return normalizeStatusAgrupado(status) === 'NO SHOW';
}

export function parseDateBR(dateStr: string): Date | null {
  if (!dateStr || dateStr === '-') return null;

  const parts = dateStr.split(' ');
  const datePart = parts[0];
  const timePart = parts[1] || '00:00:00';
  const [day, month, year] = datePart.split('/');

  if (!day || !month || !year) return null;

  const parsedDate = new Date(`${year}-${month}-${day}T${timePart}`);
  return isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function parseFlexibleDate(dateStr: string): Date | null {
  if (!dateStr || dateStr === '-') return null;

  const brDate = parseDateBR(dateStr);
  if (brDate) return brDate;

  const parsedDate = new Date(dateStr);
  return isNaN(parsedDate.getTime()) ? null : parsedDate;
}

export function calculateDateDiffMinutes(scheduled: string, realized: string): number | null {
  if (!scheduled || !realized || scheduled === '-' || realized === '-') return null;

  const scheduledDate = parseFlexibleDate(scheduled);
  const realizedDate = parseFlexibleDate(realized);

  if (!scheduledDate || !realizedDate) return null;

  return Math.round((realizedDate.getTime() - scheduledDate.getTime()) / 60000);
}

function calculateStatusFromDates(scheduled: string, realized: string): string | null {
  const diff = calculateDateDiffMinutes(scheduled, realized);
  if (diff === null) return null;

  if (diff < 0) return 'EARLY';
  if (diff === 0) return 'ON TIME';
  return 'DELAY';
}

function resolveStatus(existing: string, scheduled: string, realized: string): string {
  const trimmed = (existing || '').trim().toUpperCase();

  if (VALID_STATUS_VALUES.has(trimmed)) {
    return trimmed;
  }

  return calculateStatusFromDates(scheduled, realized) || '';
}

// Points for ETA Origem: ON TIME = 1, EARLY = 1, DELAY = -3
function statusPointOrigem(status: string): number {
  const normalizedStatus = (status || '').trim().toUpperCase();

  if (normalizedStatus === 'ON TIME' || normalizedStatus === 'EARLY') return 1;
  if (normalizedStatus === 'DELAY') return -3;
  return 0;
}

// Points for ETA Destino: ON TIME = 1, EARLY = -1, DELAY = -3
function statusPointDestino(status: string): number {
  const normalizedStatus = (status || '').trim().toUpperCase();

  if (normalizedStatus === 'ON TIME') return 1;
  if (normalizedStatus === 'DELAY') return -3;
  if (normalizedStatus === 'EARLY') return -1;
  return 0;
}

// Trip score = base (from route config, default 1) + origin + destination points
export function calculateTripScore(
  trip: { status_eta: string; status_eta_destino: string },
  basePoints: number = 1,
): number {
  return basePoints + statusPointOrigem(trip.status_eta) + statusPointDestino(trip.status_eta_destino);
}

function isOcorrenciaValida(value: string, ignoredList: string[]): number {
  if (!value || value.trim() === '' || value.trim() === '-') return 0;
  if (ignoredList.includes(value.trim())) return 0;
  return 1;
}

export function extractUniqueOccurrences(sheetTrips: SheetTrip[]): string[] {
  const uniqueOccurrences = new Set<string>();

  for (const trip of sheetTrips) {
    for (const field of [trip.ocorrencia_eta, trip.ocorrencia_cpt, trip.ocorrencia_eta_destino]) {
      const value = (field || '').trim();
      if (value && value !== '-') uniqueOccurrences.add(value);
    }
  }

  return Array.from(uniqueOccurrences).sort();
}

export function transformTrips(
  sheetTrips: SheetTrip[],
  ignoredOccurrences: string[] = [],
  routeScores: RouteScoreRecord[] = [],
): Trip[] {
  const validTrips = sheetTrips.filter((sheetTrip) => {
    if (!sheetTrip.driver_id || sheetTrip.driver_id === '0') return false;

    const statusAgrupado = normalizeStatusAgrupado(sheetTrip.status_agrupado);
    return statusAgrupado === 'FECHADA';
  });

  return validTrips.map((sheetTrip, idx) => {
    const occurrenceEta = (sheetTrip.ocorrencia_eta || '').trim();
    const occurrenceCpt = (sheetTrip.ocorrencia_cpt || '').trim();
    const occurrenceDest = (sheetTrip.ocorrencia_eta_destino || '').trim();

    const occurrenceCount =
      isOcorrenciaValida(occurrenceEta, ignoredOccurrences) +
      isOcorrenciaValida(occurrenceCpt, ignoredOccurrences) +
      isOcorrenciaValida(occurrenceDest, ignoredOccurrences);

    const originScheduled = sheetTrip.eta_scheduled_origin_edited || '';
    const originRealized = sheetTrip.eta_realizado || '';
    const destinationScheduled = sheetTrip.eta_destination_edited || '';
    const destinationRealized = sheetTrip.eta_destino_realizado || '';

    const resolvedStatusEta = resolveStatus(sheetTrip.status_eta, originScheduled, originRealized);
    const resolvedStatusDest = resolveStatus(sheetTrip.status_eta_destino, destinationScheduled, destinationRealized);
    const resolvedStatusCpt = (sheetTrip.status_cpt || '').trim();

    const originCode = (sheetTrip.origin_station_code || '').trim();
    const destinationCode = (sheetTrip.destination_station_code || '').trim();
    const tripDate = originScheduled || sheetTrip.sta_origin_date || '';

    const basePoints = getRouteBasePoints(routeScores, originCode, destinationCode, tripDate || undefined);
    const scoreFinal = calculateTripScore(
      { status_eta: resolvedStatusEta, status_eta_destino: resolvedStatusDest },
      basePoints,
    );

    return {
      id: sheetTrip.trip_number || `t${idx + 1}`,
      driver_id: sheetTrip.driver_id,
      driverName:
        sheetTrip.driver_name && sheetTrip.driver_name !== '-'
          ? sheetTrip.driver_name
          : sheetTrip.used_agency_name || 'Nao atribuido',
      data: tripDate,
      origin_code: originCode,
      destination_code: destinationCode,
      status_agrupado: sheetTrip.status_agrupado || '',
      no_show_from_sheet: false,
      source_sheet_field: SHEET_SOURCE_FIELD,
      eta_origin_scheduled: originScheduled,
      eta_origin_realized: originRealized,
      eta_origin_diff_minutes: calculateDateDiffMinutes(originScheduled, originRealized),
      eta_destination_scheduled: destinationScheduled,
      eta_destination_realized: destinationRealized,
      eta_destination_diff_minutes: calculateDateDiffMinutes(destinationScheduled, destinationRealized),
      status_eta: resolvedStatusEta || 'â€”',
      status_eta_destino: resolvedStatusDest || 'â€”',
      status_cpt: resolvedStatusCpt || 'â€”',
      ocorrencia: occurrenceCount > 0,
      ocorrencia_count: occurrenceCount,
      ocorrencia_eta: occurrenceEta,
      ocorrencia_cpt: occurrenceCpt,
      ocorrencia_eta_destino: occurrenceDest,
      score_final: scoreFinal,
      evaluated: false,
    };
  });
}

export function transformSheetNoShowTrips(sheetTrips: SheetTrip[]): Trip[] {
  return sheetTrips
    .filter((sheetTrip) => {
      if (!sheetTrip.driver_id || sheetTrip.driver_id === '0') return false;
      return isSheetNoShowStatus(sheetTrip.status_agrupado);
    })
    .map((sheetTrip, idx) => {
      const originCode = (sheetTrip.origin_station_code || '').trim();
      const destinationCode = (sheetTrip.destination_station_code || '').trim();
      const tripDate = sheetTrip.eta_scheduled_origin_edited || sheetTrip.sta_origin_date || '';

      return {
        id: sheetTrip.trip_number || `no-show-${idx + 1}`,
        driver_id: sheetTrip.driver_id,
        driverName:
          sheetTrip.driver_name && sheetTrip.driver_name !== '-'
            ? sheetTrip.driver_name
            : sheetTrip.used_agency_name || 'Nao atribuido',
        data: tripDate,
        origin_code: originCode,
        destination_code: destinationCode,
        status_agrupado: sheetTrip.status_agrupado || 'NO SHOW',
        no_show_from_sheet: true,
        source_sheet_field: SHEET_SOURCE_FIELD,
        eta_origin_scheduled: sheetTrip.eta_scheduled_origin_edited || '',
        eta_origin_realized: sheetTrip.eta_realizado || '',
        eta_origin_diff_minutes: calculateDateDiffMinutes(
          sheetTrip.eta_scheduled_origin_edited || '',
          sheetTrip.eta_realizado || '',
        ),
        eta_destination_scheduled: sheetTrip.eta_destination_edited || '',
        eta_destination_realized: sheetTrip.eta_destino_realizado || '',
        eta_destination_diff_minutes: calculateDateDiffMinutes(
          sheetTrip.eta_destination_edited || '',
          sheetTrip.eta_destino_realizado || '',
        ),
        status_eta: '—',
        status_eta_destino: '—',
        status_cpt: (sheetTrip.status_cpt || '').trim() || '—',
        ocorrencia: false,
        ocorrencia_count: 0,
        ocorrencia_eta: '',
        ocorrencia_cpt: '',
        ocorrencia_eta_destino: '',
        score_final: 0,
        evaluated: false,
      };
    });
}

export function calcStatusMetrics(trips: Trip[], field: 'status_eta' | 'status_eta_destino'): StatusMetrics {
  const validTrips = trips.filter((trip) => VALID_STATUS_VALUES.has((trip[field] || '').trim().toUpperCase()));
  const total = validTrips.length;

  if (total === 0) {
    return { onTime: 0, early: 0, delay: 0 };
  }

  const count = (value: string) => validTrips.filter((trip) => trip[field].trim().toUpperCase() === value).length;

  return {
    onTime: Math.round((count('ON TIME') / total) * 1000) / 10,
    early: Math.round((count('EARLY') / total) * 1000) / 10,
    delay: Math.round((count('DELAY') / total) * 1000) / 10,
  };
}

export function deriveDrivers(trips: Trip[]): Driver[] {
  const driverMap = new Map<string, Trip[]>();

  for (const trip of trips) {
    const key = trip.driver_id;
    if (!driverMap.has(key)) driverMap.set(key, []);
    driverMap.get(key)!.push(trip);
  }

  const drivers: Driver[] = [];

  for (const [driverId, driverTrips] of driverMap) {
    const nome = driverTrips[0].driverName;
    const ocorrencias = driverTrips.filter((trip) => trip.ocorrencia).length;

    let pontuacao = 0;
    for (const trip of driverTrips) {
      pontuacao += trip.score_final;
    }

    drivers.push({
      id: driverId,
      nome: `${nome} (${driverId})`,
      status: 'ATIVO' as DriverStatus,
      pontuacao,
      totalViagens: driverTrips.length,
      ocorrencias,
      created_at: driverTrips[0]?.data || '',
      etaOrigMetrics: calcStatusMetrics(driverTrips, 'status_eta'),
      etaDestMetrics: calcStatusMetrics(driverTrips, 'status_eta_destino'),
      vinculo: 'â€”',
    });
  }

  return drivers.sort((a, b) => b.pontuacao - a.pontuacao);
}
