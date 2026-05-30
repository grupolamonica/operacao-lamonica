/**
 * Composition tests for ranking.service `composeRanking` (PURE — no I/O).
 *
 * Covers the four parity-critical behaviors of the ride-rank DataContext
 * pipeline:
 *   1. ajuste_manual is applied with a clamp(0..100) to the evaluated trip's score.
 *   2. an active, non-overridden block flips status → BLOQUEADO (rank null, out of
 *      activeDrivers); manual_override=true keeps the driver ATIVO and ranked.
 *   3. rank is sequential 1..N over ATIVO drivers in pontuacao-desc order; blocked
 *      drivers do not consume a rank number.
 *   4. stats: activeDrivers / top3Avg / totalTrips / activeBlocks are coherent.
 *
 * SECURITY: fixtures use synthetic ids/names — no real PII.
 */

import { describe, expect, it } from 'bun:test';

import { composeRanking } from './ranking.service';
import type {
  DriverBlockRecord,
  EvaluationRecord,
  SheetTrip,
} from './ranking.types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a FECHADA SheetTrip with ON TIME / ON TIME statuses by default →
 * calculateTripScore = base(1) + 1 (origin ON TIME) + 1 (destino ON TIME) = 3.
 * No route_scores are supplied, so base defaults to 1.
 */
function makeTrip(overrides: Partial<SheetTrip>): SheetTrip {
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
    origin_station_code: 'AAA',
    destination_station_code: 'BBB',
    eta_scheduled_origin_edited: '01/05/2026 08:00:00',
    cpt_scheduled_origin_edited: '',
    eta_destination_edited: '',
    id_rota: '',
    eta_realizado: '',
    status_eta: 'ON TIME',
    ocorrencia_eta: '',
    cpt_realizado: '',
    status_cpt: '',
    ocorrencia_cpt: '',
    eta_destino_realizado: '',
    status_eta_destino: 'ON TIME',
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

const SCORE_ON_TIME = 3; // base 1 + origin ON TIME 1 + destino ON TIME 1

// ---------------------------------------------------------------------------
// Test 1 — ajuste_manual clamp
// ---------------------------------------------------------------------------

describe('composeRanking — ajuste_manual', () => {
  it('applies ajuste_manual with clamp(0..100) to the evaluated trip score', () => {
    const sheetTrips = [
      makeTrip({ trip_number: 'T1', driver_id: '100', driver_name: 'X' }),
    ];
    const evaluations: EvaluationRecord[] = [
      {
        trip_id: 'T1',
        driver_id: '100',
        driver_name: 'X',
        comunicacao: 'BOA',
        atendeu: true,
        desvio_rota: 'NENHUM',
        postura: 'OK',
        ajuste_manual: 5,
        observacao: '',
        operador: 'op',
      },
    ];

    const { drivers, trips } = composeRanking({
      sheetTrips,
      evaluations,
      driverBlocks: [],
      routeScores: [],
      drivers: [],
    });

    // trip score: 3 + 5 = 8 (within 0..100, no clamp)
    expect(trips[0].score_final).toBe(SCORE_ON_TIME + 5);
    expect(trips[0].evaluated).toBe(true);
    // driver pontuacao reflects the adjusted score
    expect(drivers).toHaveLength(1);
    expect(drivers[0].pontuacao).toBe(SCORE_ON_TIME + 5);
  });

  it('clamps the adjusted score to the 0..100 range (upper bound)', () => {
    const sheetTrips = [
      makeTrip({ trip_number: 'T1', driver_id: '100', driver_name: 'X' }),
    ];
    const evaluations: EvaluationRecord[] = [
      {
        trip_id: 'T1',
        driver_id: '100',
        driver_name: 'X',
        comunicacao: 'BOA',
        atendeu: true,
        desvio_rota: 'NENHUM',
        postura: 'OK',
        ajuste_manual: 200,
        observacao: '',
        operador: 'op',
      },
    ];

    const { trips } = composeRanking({
      sheetTrips,
      evaluations,
      driverBlocks: [],
      routeScores: [],
      drivers: [],
    });

    expect(trips[0].score_final).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Test 2 — block / manual_override
// ---------------------------------------------------------------------------

describe('composeRanking — blocks', () => {
  it('marks a driver with an active, non-overridden block as BLOQUEADO (rank null, excluded from activeDrivers)', () => {
    const sheetTrips = [
      makeTrip({ trip_number: 'T1', driver_id: '100', driver_name: 'X' }),
      makeTrip({ trip_number: 'T2', driver_id: '200', driver_name: 'Y' }),
    ];
    const driverBlocks: DriverBlockRecord[] = [
      {
        driver_id: '100',
        driver_name: 'X',
        tipo: 'MANUAL',
        motivo: 'test',
        ativo: true,
        manual_override: false,
        created_by: 'op',
      },
    ];

    const { drivers, activeDrivers } = composeRanking({
      sheetTrips,
      evaluations: [],
      driverBlocks,
      routeScores: [],
      drivers: [],
    });

    const blocked = drivers.find((d) => d.id === '100')!;
    expect(blocked.status).toBe('BLOQUEADO');
    expect(blocked.rank).toBeNull();
    expect(activeDrivers.some((d) => d.id === '100')).toBe(false);
    expect(activeDrivers.some((d) => d.id === '200')).toBe(true);
  });

  it('keeps a driver ATIVO and ranked when the block is manual_override=true', () => {
    const sheetTrips = [
      makeTrip({ trip_number: 'T1', driver_id: '100', driver_name: 'X' }),
    ];
    const driverBlocks: DriverBlockRecord[] = [
      {
        driver_id: '100',
        driver_name: 'X',
        tipo: 'MANUAL',
        motivo: 'unblocked',
        ativo: false,
        manual_override: true,
        created_by: 'op',
      },
    ];

    const { drivers, activeDrivers } = composeRanking({
      sheetTrips,
      evaluations: [],
      driverBlocks,
      routeScores: [],
      drivers: [],
    });

    const driver = drivers.find((d) => d.id === '100')!;
    expect(driver.status).toBe('ATIVO');
    expect(driver.rank).toBe(1);
    expect(activeDrivers.some((d) => d.id === '100')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 3 — rank over actives only
// ---------------------------------------------------------------------------

describe('composeRanking — rank', () => {
  it('assigns sequential rank 1..N over ATIVO drivers (pontuacao desc); blocked drivers do not consume a rank number', () => {
    // Driver A: 2 trips → pontuacao 6 (highest)
    // Driver B (blocked): 1 trip → pontuacao 3
    // Driver C: 1 trip → pontuacao 3
    const sheetTrips = [
      makeTrip({ trip_number: 'A1', driver_id: 'A', driver_name: 'A' }),
      makeTrip({ trip_number: 'A2', driver_id: 'A', driver_name: 'A' }),
      makeTrip({ trip_number: 'B1', driver_id: 'B', driver_name: 'B' }),
      makeTrip({ trip_number: 'C1', driver_id: 'C', driver_name: 'C' }),
    ];
    const driverBlocks: DriverBlockRecord[] = [
      {
        driver_id: 'B',
        driver_name: 'B',
        tipo: 'NO_SHOW',
        motivo: 'test',
        ativo: true,
        manual_override: false,
        created_by: 'op',
      },
    ];

    const { drivers } = composeRanking({
      sheetTrips,
      evaluations: [],
      driverBlocks,
      routeScores: [],
      drivers: [],
    });

    const a = drivers.find((d) => d.id === 'A')!;
    const b = drivers.find((d) => d.id === 'B')!;
    const c = drivers.find((d) => d.id === 'C')!;

    expect(a.pontuacao).toBe(SCORE_ON_TIME * 2);
    expect(a.rank).toBe(1); // highest pontuacao, first ATIVO
    expect(b.rank).toBeNull(); // blocked → no rank
    expect(c.rank).toBe(2); // next ATIVO, NOT 3 — blocked B did not consume a number

    // ranks over actives are exactly 1..N with no gaps
    const activeRanks = drivers
      .filter((d) => d.status === 'ATIVO')
      .map((d) => d.rank)
      .sort((x, y) => (x! - y!));
    expect(activeRanks).toEqual([1, 2]);
  });

  it('returns the full array ordered by pontuacao desc (includes blocked)', () => {
    const sheetTrips = [
      makeTrip({ trip_number: 'A1', driver_id: 'A', driver_name: 'A' }),
      makeTrip({ trip_number: 'A2', driver_id: 'A', driver_name: 'A' }),
      makeTrip({ trip_number: 'B1', driver_id: 'B', driver_name: 'B' }),
    ];

    const { drivers } = composeRanking({
      sheetTrips,
      evaluations: [],
      driverBlocks: [],
      routeScores: [],
      drivers: [],
    });

    for (let i = 1; i < drivers.length; i++) {
      expect(drivers[i - 1].pontuacao).toBeGreaterThanOrEqual(drivers[i].pontuacao);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 4 — stats
// ---------------------------------------------------------------------------

describe('composeRanking — stats', () => {
  it('derives coherent { activeDrivers, top3Avg, totalTrips, activeBlocks }', () => {
    // 4 active drivers + 1 blocked; top3Avg = mean of the 3 highest ACTIVE pontuacoes.
    const sheetTrips = [
      // A: 3 trips → 9
      makeTrip({ trip_number: 'A1', driver_id: 'A', driver_name: 'A' }),
      makeTrip({ trip_number: 'A2', driver_id: 'A', driver_name: 'A' }),
      makeTrip({ trip_number: 'A3', driver_id: 'A', driver_name: 'A' }),
      // B: 2 trips → 6
      makeTrip({ trip_number: 'B1', driver_id: 'B', driver_name: 'B' }),
      makeTrip({ trip_number: 'B2', driver_id: 'B', driver_name: 'B' }),
      // C: 1 trip → 3
      makeTrip({ trip_number: 'C1', driver_id: 'C', driver_name: 'C' }),
      // D: 1 trip → 3
      makeTrip({ trip_number: 'D1', driver_id: 'D', driver_name: 'D' }),
      // E (blocked): 1 trip → 3
      makeTrip({ trip_number: 'E1', driver_id: 'E', driver_name: 'E' }),
    ];
    const driverBlocks: DriverBlockRecord[] = [
      {
        driver_id: 'E',
        driver_name: 'E',
        tipo: 'MANUAL',
        motivo: 'test',
        ativo: true,
        manual_override: false,
        created_by: 'op',
      },
    ];

    const { stats } = composeRanking({
      sheetTrips,
      evaluations: [],
      driverBlocks,
      routeScores: [],
      drivers: [],
    });

    expect(stats.totalTrips).toBe(8); // all FECHADA trips counted
    expect(stats.activeDrivers).toBe(4); // A, B, C, D (E blocked)
    expect(stats.activeBlocks).toBe(1); // E
    // top3 ACTIVE pontuacoes: 9, 6, 3 → mean = 6
    expect(stats.top3Avg).toBe((SCORE_ON_TIME * 3 + SCORE_ON_TIME * 2 + SCORE_ON_TIME) / 3);
  });

  it('top3Avg is 0 when there are no active drivers', () => {
    const { stats } = composeRanking({
      sheetTrips: [],
      evaluations: [],
      driverBlocks: [],
      routeScores: [],
      drivers: [],
    });
    expect(stats.activeDrivers).toBe(0);
    expect(stats.top3Avg).toBe(0);
    expect(stats.totalTrips).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// driverName enrichment
// ---------------------------------------------------------------------------

describe('composeRanking — driverName enrichment', () => {
  it('enriches driverName from the drivers table using dot-stripped ids', () => {
    const sheetTrips = [
      makeTrip({ trip_number: 'T1', driver_id: '12.345', driver_name: 'raw' }),
    ];
    const { drivers } = composeRanking({
      sheetTrips,
      evaluations: [],
      driverBlocks: [],
      routeScores: [],
      drivers: [{ driver_id: '12345', driver_name: 'Enriched Name' }],
    });
    // deriveDrivers formats nome as "<name> (<driver_id>)"
    expect(drivers[0].nome).toContain('Enriched Name');
  });
});
