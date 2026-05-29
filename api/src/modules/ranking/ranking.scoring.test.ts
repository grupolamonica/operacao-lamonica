import { describe, expect, it } from 'bun:test';

import { getRouteBasePoints } from './ranking.routes';
import type { RouteScoreRecord, SheetTrip, Trip } from './ranking.types';
import {
  calcStatusMetrics,
  calculateTripScore,
  deriveDrivers,
  transformSheetNoShowTrips,
  transformTrips,
} from './ranking.scoring';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a fully-populated SheetTrip. Every column transformTrips reads is
 * present so the golden-sample exercises the full pipeline (resolveStatus,
 * parseDateBR, occurrence counting, base default, score_final).
 */
function makeSheetTrip(overrides: Partial<SheetTrip>): SheetTrip {
  const base: Record<string, string> = {
    sta_origin_date: '',
    trip_number: '',
    status_agrupado: 'FECHADA',
    solicitation_by: '',
    planned_vehicle: '',
    used_vehicle: '',
    used_agency_name: '',
    driver_id: '',
    driver_name: '',
    vehicle_number: '',
    origin_station_code: '',
    destination_station_code: '',
    eta_scheduled_origin_edited: '',
    cpt_scheduled_origin_edited: '',
    eta_destination_edited: '',
    id_rota: '',
    eta_realizado: '',
    status_eta: '',
    ocorrencia_eta: '',
    cpt_realizado: '',
    status_cpt: '',
    ocorrencia_cpt: '',
    eta_destino_realizado: '',
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
    atualizacao: '',
  };
  return { ...base, ...overrides } as SheetTrip;
}

// ---------------------------------------------------------------------------
// Test 1-3 — calculateTripScore (synthetic, exact arithmetic)
// ---------------------------------------------------------------------------

describe('calculateTripScore', () => {
  it('Test 1: ON TIME + ON TIME with base 1 === 3', () => {
    expect(calculateTripScore({ status_eta: 'ON TIME', status_eta_destino: 'ON TIME' }, 1)).toBe(3);
  });

  it('Test 2: DELAY + EARLY with base 1 === -3', () => {
    // base 1 + origem(DELAY = -3) + destino(EARLY = -1) = -3
    expect(calculateTripScore({ status_eta: 'DELAY', status_eta_destino: 'EARLY' }, 1)).toBe(-3);
  });

  it('Test 3: EARLY + DELAY with base 2 === 0', () => {
    // base 2 + origem(EARLY = +1) + destino(DELAY = -3) = 0
    expect(calculateTripScore({ status_eta: 'EARLY', status_eta_destino: 'DELAY' }, 2)).toBe(0);
  });

  it('defaults base to 1 when omitted', () => {
    expect(calculateTripScore({ status_eta: 'ON TIME', status_eta_destino: 'ON TIME' })).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Test 4 — transformTrips filtering
// ---------------------------------------------------------------------------

describe('transformTrips filtering', () => {
  it('Test 4: ignores non-FECHADA status and driver_id "0"/empty', () => {
    const trips = transformTrips(
      [
        makeSheetTrip({ driver_id: 'D1', trip_number: 'A', status_agrupado: 'EM ANDAMENTO', status_eta: 'ON TIME', status_eta_destino: 'ON TIME' }),
        makeSheetTrip({ driver_id: '0', trip_number: 'B', status_agrupado: 'FECHADA', status_eta: 'ON TIME', status_eta_destino: 'ON TIME' }),
        makeSheetTrip({ driver_id: '', trip_number: 'C', status_agrupado: 'FECHADA', status_eta: 'ON TIME', status_eta_destino: 'ON TIME' }),
        makeSheetTrip({ driver_id: 'D2', trip_number: 'D', status_agrupado: 'FECHADA', status_eta: 'ON TIME', status_eta_destino: 'ON TIME' }),
      ],
      [],
      [],
    );

    expect(trips).toHaveLength(1);
    expect(trips[0].id).toBe('D');
    expect(trips[0].driver_id).toBe('D2');
  });

  it('normalizes status_agrupado (case / separators) when matching FECHADA', () => {
    const trips = transformTrips(
      [makeSheetTrip({ driver_id: 'D3', trip_number: 'X', status_agrupado: ' fechada ', status_eta: 'ON TIME', status_eta_destino: 'ON TIME' })],
      [],
      [],
    );
    expect(trips).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Test 5 — deriveDrivers aggregation + ordering + name format
// ---------------------------------------------------------------------------

describe('deriveDrivers', () => {
  it('Test 5: sums score_final per driver, orders desc, name "Nome (id)"', () => {
    const trips: Trip[] = transformTrips(
      [
        // D-LOW: one trip, score 3 (ON TIME + ON TIME, base 1)
        makeSheetTrip({ driver_id: 'LOW', driver_name: 'Low Driver', trip_number: 'L1', status_eta: 'ON TIME', status_eta_destino: 'ON TIME' }),
        // D-HIGH: two trips, 3 + 3 = 6
        makeSheetTrip({ driver_id: 'HIGH', driver_name: 'High Driver', trip_number: 'H1', status_eta: 'ON TIME', status_eta_destino: 'ON TIME' }),
        makeSheetTrip({ driver_id: 'HIGH', driver_name: 'High Driver', trip_number: 'H2', status_eta: 'ON TIME', status_eta_destino: 'ON TIME' }),
      ],
      [],
      [],
    );

    const drivers = deriveDrivers(trips);

    expect(drivers).toHaveLength(2);
    // ordered desc by pontuacao
    expect(drivers[0].id).toBe('HIGH');
    expect(drivers[0].pontuacao).toBe(6);
    expect(drivers[0].nome).toBe('High Driver (HIGH)');
    expect(drivers[0].totalViagens).toBe(2);
    expect(drivers[1].id).toBe('LOW');
    expect(drivers[1].pontuacao).toBe(3);
    expect(drivers[1].nome).toBe('Low Driver (LOW)');
    // default status / vinculo carried from port (byte-for-byte fallback)
    expect(drivers[0].status).toBe('ATIVO');
  });
});

// ---------------------------------------------------------------------------
// Test 6 — calcStatusMetrics 1-decimal rounding
// ---------------------------------------------------------------------------

describe('calcStatusMetrics', () => {
  it('Test 6: returns onTime/early/delay rounded to 1 decimal on a fixed sample', () => {
    // 3 ON TIME, 2 EARLY, 1 DELAY over 6 valid => 50.0 / 33.3 / 16.7
    const sample = ['ON TIME', 'ON TIME', 'ON TIME', 'EARLY', 'EARLY', 'DELAY'];
    const trips = sample.map((s) => ({ status_eta: s, status_eta_destino: 'ON TIME' } as unknown as Trip));
    const metrics = calcStatusMetrics(trips, 'status_eta');
    expect(metrics.onTime).toBe(50);
    expect(metrics.early).toBe(33.3);
    expect(metrics.delay).toBe(16.7);
  });

  it('returns zeros when no valid status present', () => {
    const trips = [{ status_eta: '', status_eta_destino: '' } as unknown as Trip];
    expect(calcStatusMetrics(trips, 'status_eta')).toEqual({ onTime: 0, early: 0, delay: 0 });
  });
});

// ---------------------------------------------------------------------------
// Test 7 — getRouteBasePoints (pure, sourced from ranking.routes)
// ---------------------------------------------------------------------------

describe('getRouteBasePoints', () => {
  it('Test 7a: returns 1 when no route matches', () => {
    expect(getRouteBasePoints([], 'AAA', 'BBB')).toBe(1);
  });

  it('Test 7b: returns active record pontuacao for the trip date', () => {
    const scores: RouteScoreRecord[] = [
      {
        origin_code: 'AAA',
        destination_code: 'BBB',
        pontuacao: 5,
        data_inicio: '2025-01-01',
        data_fim: '2025-12-31',
        observacao: null,
      },
    ];
    expect(getRouteBasePoints(scores, 'AAA', 'BBB', '2025-06-15')).toBe(5);
  });

  it('Test 7c: falls back to first matching pontuacao when no date window matches', () => {
    const scores: RouteScoreRecord[] = [
      {
        origin_code: 'AAA',
        destination_code: 'BBB',
        pontuacao: 7,
        data_inicio: '2030-01-01',
        data_fim: '2030-12-31',
        observacao: null,
      },
    ];
    expect(getRouteBasePoints(scores, 'AAA', 'BBB', '2025-06-15')).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Test 8 — GOLDEN SAMPLE (end-to-end parity with the original app)
// ---------------------------------------------------------------------------

describe('golden sample (parity)', () => {
  // Representative REAL closed (FECHADA) trip from the DBLHHISTORICO sheet,
  // BR date format "DD/MM/AAAA HH:MM:SS", status fields pre-filled.
  // Trip A: status_eta/destino preset -> resolveStatus returns them verbatim.
  //   score = base(1) + origem(ON TIME = +1) + destino(EARLY = -1) = 1
  const tripA = makeSheetTrip({
    sta_origin_date: '10/03/2025 06:30:00',
    trip_number: 'TRIP-A-001',
    status_agrupado: 'FECHADA',
    used_agency_name: 'AGENCIA X',
    driver_id: 'D100',
    driver_name: 'MOTORISTA REAL',
    origin_station_code: 'CWB1',
    destination_station_code: 'SAO5',
    eta_scheduled_origin_edited: '10/03/2025 07:00:00',
    eta_destination_edited: '10/03/2025 12:00:00',
    eta_realizado: '10/03/2025 07:00:00',
    status_eta: 'ON TIME',
    ocorrencia_eta: '-',
    status_cpt: 'ON TIME',
    ocorrencia_cpt: '-',
    eta_destino_realizado: '10/03/2025 11:48:00',
    status_eta_destino: 'EARLY',
    ocorrencia_eta_destino: '-',
  });

  // Trip B: status_eta/destino EMPTY -> resolveStatus computes from BR dates.
  //   origem realizado == agendado -> ON TIME (+1); diff cancels timezone.
  //   destino realizado == agendado -> ON TIME (+1).
  //   score = base(1) + 1 + 1 = 3
  const tripB = makeSheetTrip({
    sta_origin_date: '10/03/2025 06:30:00',
    trip_number: 'TRIP-B-002',
    status_agrupado: 'FECHADA',
    driver_id: 'D100',
    driver_name: 'MOTORISTA REAL',
    origin_station_code: 'CWB1',
    destination_station_code: 'SAO5',
    eta_scheduled_origin_edited: '10/03/2025 07:00:00',
    eta_destination_edited: '10/03/2025 12:00:00',
    eta_realizado: '10/03/2025 07:00:00',
    status_eta: '',
    eta_destino_realizado: '10/03/2025 12:00:00',
    status_eta_destino: '',
    status_cpt: '',
  });

  it('Test 8a: transformTrips locks score_final for preset-status trip', () => {
    const trips = transformTrips([tripA], [], []);
    expect(trips).toHaveLength(1);
    expect(trips[0].score_final).toBe(1);
    expect(trips[0].status_eta).toBe('ON TIME');
    expect(trips[0].status_eta_destino).toBe('EARLY');
    expect(trips[0].id).toBe('TRIP-A-001');
    expect(trips[0].driverName).toBe('MOTORISTA REAL');
  });

  it('Test 8b: transformTrips resolves status from BR dates (parseDateBR/timezone safe)', () => {
    const trips = transformTrips([tripB], [], []);
    expect(trips).toHaveLength(1);
    expect(trips[0].status_eta).toBe('ON TIME');
    expect(trips[0].status_eta_destino).toBe('ON TIME');
    expect(trips[0].score_final).toBe(3);
    expect(trips[0].eta_origin_diff_minutes).toBe(0);
    expect(trips[0].eta_destination_diff_minutes).toBe(0);
  });

  it('Test 8c: deriveDrivers locks aggregate pontuacao for the real driver', () => {
    const trips = transformTrips([tripA, tripB], [], []);
    const drivers = deriveDrivers(trips);
    expect(drivers).toHaveLength(1);
    const d = drivers[0];
    expect(d.id).toBe('D100');
    expect(d.nome).toBe('MOTORISTA REAL (D100)');
    expect(d.pontuacao).toBe(4); // 1 (A) + 3 (B)
    expect(d.totalViagens).toBe(2);
  });

  it('Test 8d: NO SHOW row -> transformSheetNoShowTrips score_final === 0', () => {
    const noShow = makeSheetTrip({
      sta_origin_date: '10/03/2025 06:30:00',
      trip_number: 'TRIP-NS-003',
      status_agrupado: 'NO SHOW',
      driver_id: 'D100',
      driver_name: 'MOTORISTA REAL',
      origin_station_code: 'CWB1',
      destination_station_code: 'SAO5',
      eta_scheduled_origin_edited: '10/03/2025 07:00:00',
    });
    const noShowTrips = transformSheetNoShowTrips([noShow]);
    expect(noShowTrips).toHaveLength(1);
    expect(noShowTrips[0].score_final).toBe(0);
    expect(noShowTrips[0].no_show_from_sheet).toBe(true);
    expect(noShowTrips[0].id).toBe('TRIP-NS-003');

    // FECHADA rows are excluded from the no-show transform
    expect(transformSheetNoShowTrips([tripA])).toHaveLength(0);
  });
});
