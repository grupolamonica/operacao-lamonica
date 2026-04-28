import type { Trip, SlaStatus, TripStatus } from '@/data/types'

const today = new Date()
const minutesFromNow = (m: number) => { const d = new Date(today); d.setMinutes(d.getMinutes() + m); return d }
const hoursFromNow = (h: number) => { const d = new Date(today); d.setTime(d.getTime() + h * 60 * 60 * 1000); return d }

const canonicalTrips: Trip[] = [
  // === IN PROGRESS — NO PRAZO (4) ===
  {
    id: 'trp-001', code: 'VG-90211', driverId: 'drv-001', driverName: 'Carlos Henrique Souza',
    plate: 'KLP-9081', clientName: 'Shopee', operationName: 'Last Mile SP', routeCode: 'ROTA-SP-001',
    priority: 'alta',
    origin: 'CD Vila Olímpia', destination: 'Bairro Pinheiros',
    originLat: -23.5961, originLng: -46.6856, destLat: -23.5631, destLng: -46.6822,
    windowStart: hoursFromNow(-1), windowEnd: hoursFromNow(2), eta: hoursFromNow(1.2),
    departedAt: hoursFromNow(-1.5),
    status: 'in_progress', slaStatus: 'no_prazo',
    progressPct: 62, distanceTotal: 28.4, distanceDone: 17.6,
  },
  {
    id: 'trp-002', code: 'VG-90234', driverId: 'drv-002', driverName: 'Mariana Oliveira Lima',
    plate: 'JZS-4477', clientName: 'Magazine Luiza', operationName: 'Centro SP', routeCode: 'ROTA-SP-014',
    priority: 'media',
    origin: 'CD Tatuapé', destination: 'Centro de São Paulo',
    originLat: -23.5398, originLng: -46.5765, destLat: -23.5505, destLng: -46.6333,
    windowStart: hoursFromNow(-2), windowEnd: hoursFromNow(1.5), eta: hoursFromNow(0.8),
    departedAt: hoursFromNow(-2.2),
    status: 'in_progress', slaStatus: 'no_prazo',
    progressPct: 78, distanceTotal: 14.2, distanceDone: 11.1,
  },
  {
    id: 'trp-003', code: 'VG-90245', driverId: 'drv-006', driverName: 'Patricia Gomes Ferreira',
    plate: 'XCV-7714', clientName: 'Mercado Livre', operationName: 'Last Mile SP', routeCode: 'ROTA-SP-008',
    priority: 'media',
    origin: 'CD Vila Olímpia', destination: 'Moema',
    originLat: -23.5961, originLng: -46.6856, destLat: -23.5985, destLng: -46.6555,
    windowStart: hoursFromNow(-0.5), windowEnd: hoursFromNow(2.5), eta: hoursFromNow(1.5),
    departedAt: hoursFromNow(-0.8),
    status: 'in_progress', slaStatus: 'no_prazo',
    progressPct: 45, distanceTotal: 9.8, distanceDone: 4.4,
  },
  {
    id: 'trp-004', code: 'VG-90250', driverId: 'drv-008', driverName: 'Fernanda Rocha Mendes',
    plate: 'TGY-2218', clientName: 'Amazon', operationName: 'Express SP', routeCode: 'ROTA-SP-022',
    priority: 'baixa',
    origin: 'CD Vila Mariana', destination: 'Itaim Bibi',
    originLat: -23.5870, originLng: -46.6395, destLat: -23.5851, destLng: -46.6760,
    windowStart: hoursFromNow(-1.2), windowEnd: hoursFromNow(2), eta: hoursFromNow(1),
    departedAt: hoursFromNow(-1.4),
    status: 'in_progress', slaStatus: 'no_prazo',
    progressPct: 55, distanceTotal: 6.5, distanceDone: 3.6,
  },
  // === IN PROGRESS — EM RISCO (2) ===
  {
    id: 'trp-005', code: 'VG-90261', driverId: 'drv-005', driverName: 'Anderson Martins Silva',
    plate: 'MJK-3392', clientName: 'Shopee', operationName: 'Interior SP', routeCode: 'ROTA-CPS-003',
    priority: 'alta',
    origin: 'CD Campinas', destination: 'Sumaré',
    originLat: -22.9099, originLng: -47.0626, destLat: -22.8222, destLng: -47.2667,
    windowStart: hoursFromNow(-3), windowEnd: hoursFromNow(0.5), eta: hoursFromNow(0.7),
    departedAt: hoursFromNow(-3.2),
    status: 'in_progress', slaStatus: 'em_risco',
    progressPct: 84, distanceTotal: 31.2, distanceDone: 26.2,
  },
  {
    id: 'trp-006', code: 'VG-90274', driverId: 'drv-009', driverName: 'Diego Barbosa Nunes',
    plate: 'WPL-5532', clientName: 'Magazine Luiza', operationName: 'Interior SP', routeCode: 'ROTA-CPS-007',
    priority: 'media',
    origin: 'CD Campinas', destination: 'Indaiatuba',
    originLat: -22.9099, originLng: -47.0626, destLat: -23.0907, destLng: -47.2179,
    windowStart: hoursFromNow(-2.5), windowEnd: hoursFromNow(1), eta: hoursFromNow(1.2),
    departedAt: hoursFromNow(-2.7),
    status: 'in_progress', slaStatus: 'em_risco',
    progressPct: 70, distanceTotal: 22.4, distanceDone: 15.7,
  },
  // === IN PROGRESS — ATRASADO (1) ===
  {
    id: 'trp-007', code: 'VG-90288', driverId: 'drv-003', driverName: 'Roberto Almeida Pereira',
    plate: 'PHQ-1023', clientName: 'Shopee', operationName: 'Last Mile SP', routeCode: 'ROTA-GRU-002',
    priority: 'alta',
    origin: 'CD Guarulhos', destination: 'Aeroporto GRU',
    originLat: -23.4322, originLng: -46.4980, destLat: -23.4356, destLng: -46.4731,
    windowStart: hoursFromNow(-4), windowEnd: hoursFromNow(-0.5), eta: hoursFromNow(0.3),
    departedAt: hoursFromNow(-4.2),
    status: 'in_progress', slaStatus: 'atrasado',
    progressPct: 88, distanceTotal: 18.6, distanceDone: 16.4,
  },
  // === IN PROGRESS — SEM SINAL (1) ===
  {
    id: 'trp-008', code: 'VG-90299', driverId: 'drv-007', driverName: 'Lucas Fernandes Cardoso',
    plate: 'NHB-6643', clientName: 'Mercado Livre', operationName: 'Last Mile SP', routeCode: 'ROTA-GRU-005',
    priority: 'media',
    origin: 'CD Guarulhos', destination: 'Tatuapé',
    originLat: -23.4322, originLng: -46.4980, destLat: -23.5398, destLng: -46.5765,
    windowStart: hoursFromNow(-2), windowEnd: hoursFromNow(1.5), eta: hoursFromNow(1.4),
    departedAt: hoursFromNow(-2.1),
    status: 'in_progress', slaStatus: 'sem_sinal',
    progressPct: 40, distanceTotal: 24.0, distanceDone: 9.6,
  },
  // === PLANNED (3) ===
  {
    id: 'trp-009', code: 'VG-90310', driverId: 'drv-004', driverName: 'Juliana Costa Ribeiro',
    plate: 'RFD-8821', clientName: 'Amazon', operationName: 'Express SP', routeCode: 'ROTA-SP-031',
    priority: 'media',
    origin: 'CD Vila Mariana', destination: 'Vila Madalena',
    originLat: -23.5870, originLng: -46.6395, destLat: -23.5446, destLng: -46.6878,
    windowStart: hoursFromNow(2), windowEnd: hoursFromNow(5), eta: hoursFromNow(3.5),
    status: 'planned', slaStatus: 'no_prazo',
    progressPct: 0, distanceTotal: 8.4, distanceDone: 0,
  },
  {
    id: 'trp-010', code: 'VG-90315', driverId: 'drv-010', driverName: 'Beatriz Cunha Alves',
    plate: 'QER-7090', clientName: 'Shopee', operationName: 'Last Mile SP', routeCode: 'ROTA-SP-009',
    priority: 'alta',
    origin: 'CD Vila Mariana', destination: 'Brooklin',
    originLat: -23.5870, originLng: -46.6395, destLat: -23.6024, destLng: -46.6856,
    windowStart: hoursFromNow(3), windowEnd: hoursFromNow(6), eta: hoursFromNow(4.5),
    status: 'planned', slaStatus: 'no_prazo',
    progressPct: 0, distanceTotal: 12.8, distanceDone: 0,
  },
  {
    id: 'trp-011', code: 'VG-90322', driverId: 'drv-004', driverName: 'Juliana Costa Ribeiro',
    plate: 'RFD-8821', clientName: 'Magazine Luiza', operationName: 'Centro SP', routeCode: 'ROTA-SP-012',
    priority: 'baixa',
    origin: 'CD Vila Mariana', destination: 'Bela Vista',
    originLat: -23.5870, originLng: -46.6395, destLat: -23.5577, destLng: -46.6429,
    windowStart: hoursFromNow(5), windowEnd: hoursFromNow(8), eta: hoursFromNow(6),
    status: 'planned', slaStatus: 'no_prazo',
    progressPct: 0, distanceTotal: 5.2, distanceDone: 0,
  },
  // === COMPLETED (3) ===
  {
    id: 'trp-012', code: 'VG-90150', driverId: 'drv-001', driverName: 'Carlos Henrique Souza',
    plate: 'KLP-9081', clientName: 'Shopee', operationName: 'Last Mile SP', routeCode: 'ROTA-SP-001',
    priority: 'media',
    origin: 'CD Vila Olímpia', destination: 'Itaim Bibi',
    originLat: -23.5961, originLng: -46.6856, destLat: -23.5851, destLng: -46.6760,
    windowStart: hoursFromNow(-9), windowEnd: hoursFromNow(-6), eta: hoursFromNow(-7),
    departedAt: hoursFromNow(-9.5), arrivedAt: hoursFromNow(-7.2),
    status: 'completed', slaStatus: 'no_prazo',
    progressPct: 100, distanceTotal: 7.8, distanceDone: 7.8,
  },
  {
    id: 'trp-013', code: 'VG-90160', driverId: 'drv-002', driverName: 'Mariana Oliveira Lima',
    plate: 'JZS-4477', clientName: 'Mercado Livre', operationName: 'Centro SP', routeCode: 'ROTA-SP-014',
    priority: 'media',
    origin: 'CD Tatuapé', destination: 'Liberdade',
    originLat: -23.5398, originLng: -46.5765, destLat: -23.5577, destLng: -46.6356,
    windowStart: hoursFromNow(-8), windowEnd: hoursFromNow(-5), eta: hoursFromNow(-6),
    departedAt: hoursFromNow(-8.2), arrivedAt: hoursFromNow(-5.8),
    status: 'completed', slaStatus: 'no_prazo',
    progressPct: 100, distanceTotal: 11.6, distanceDone: 11.6,
  },
  {
    id: 'trp-014', code: 'VG-90175', driverId: 'drv-008', driverName: 'Fernanda Rocha Mendes',
    plate: 'TGY-2218', clientName: 'Amazon', operationName: 'Express SP', routeCode: 'ROTA-SP-022',
    priority: 'baixa',
    origin: 'CD Vila Mariana', destination: 'Pinheiros',
    originLat: -23.5870, originLng: -46.6395, destLat: -23.5631, destLng: -46.6822,
    windowStart: hoursFromNow(-7), windowEnd: hoursFromNow(-4), eta: hoursFromNow(-5),
    departedAt: hoursFromNow(-7.3), arrivedAt: hoursFromNow(-4.5),
    status: 'completed', slaStatus: 'no_prazo',
    progressPct: 100, distanceTotal: 9.0, distanceDone: 9.0,
  },
  // === DELAYED (1) ===
  {
    id: 'trp-015', code: 'VG-90180', driverId: 'drv-005', driverName: 'Anderson Martins Silva',
    plate: 'MJK-3392', clientName: 'Magazine Luiza', operationName: 'Interior SP', routeCode: 'ROTA-CPS-003',
    priority: 'alta',
    origin: 'CD Campinas', destination: 'Valinhos',
    originLat: -22.9099, originLng: -47.0626, destLat: -22.9716, destLng: -46.9959,
    windowStart: hoursFromNow(-6), windowEnd: hoursFromNow(-3), eta: hoursFromNow(-1),
    departedAt: hoursFromNow(-6.4), arrivedAt: hoursFromNow(-1.2),
    status: 'delayed', slaStatus: 'atrasado',
    progressPct: 100, distanceTotal: 13.2, distanceDone: 13.2,
  },
]

const driverPool = [
  { id: 'drv-001', name: 'Carlos Henrique Souza',   plate: 'KLP-9081' },
  { id: 'drv-002', name: 'Mariana Oliveira Lima',    plate: 'JZS-4477' },
  { id: 'drv-003', name: 'Roberto Almeida Pereira',  plate: 'PHQ-1023' },
  { id: 'drv-005', name: 'Anderson Martins Silva',   plate: 'MJK-3392' },
  { id: 'drv-006', name: 'Patricia Gomes Ferreira',  plate: 'XCV-7714' },
  { id: 'drv-008', name: 'Fernanda Rocha Mendes',    plate: 'TGY-2218' },
  { id: 'drv-009', name: 'Diego Barbosa Nunes',      plate: 'WPL-5532' },
] as const

const clientPool = ['Shopee', 'Shopee', 'Magazine Luiza', 'Mercado Livre', 'Amazon'] as const

// i 0-14: in_progress (10 no_prazo, 3 em_risco, 1 atrasado, 1 sem_sinal)
// i 15-20: planned (no_prazo)
// i 21-29: completed (no_prazo)
const generatedTrips: Trip[] = Array.from({ length: 30 }, (_, i): Trip => {
  const n = i + 16
  const drv = driverPool[i % driverPool.length]
  const client = clientPool[i % clientPool.length]
  const slaPool: SlaStatus[] = [
    'no_prazo', 'no_prazo', 'no_prazo', 'no_prazo', 'no_prazo',
    'no_prazo', 'no_prazo', 'no_prazo', 'no_prazo', 'no_prazo',
    'em_risco', 'em_risco', 'em_risco', 'atrasado', 'sem_sinal',
  ]
  const slaStatus: SlaStatus = i < 15 ? slaPool[i] : 'no_prazo'
  const tripStatus: TripStatus =
    i < 15 ? 'in_progress' :
    i < 21 ? 'planned' : 'completed'

  return {
    id: `trp-${String(n).padStart(3, '0')}`,
    code: `VG-${91000 + n}`,
    driverId: drv.id,
    driverName: drv.name,
    plate: drv.plate,
    clientName: client,
    operationName: 'Last Mile SP',
    routeCode: `ROTA-SP-${String((i % 20) + 10).padStart(3, '0')}`,
    priority: (['alta', 'media', 'baixa'] as const)[i % 3],
    origin: 'CD Vila Olímpia',
    destination: `Bairro ${(['Pinheiros', 'Moema', 'Itaim', 'Perdizes', 'Brooklin'] as const)[i % 5]}`,
    originLat: -23.5961, originLng: -46.6856,
    destLat: -23.54 + (i * 0.008), destLng: -46.64 + (i * 0.007),
    windowStart: hoursFromNow(-2 - (i * 0.15)),
    windowEnd: hoursFromNow(2 + (i * 0.1)),
    eta: slaStatus === 'em_risco'
      ? hoursFromNow(2.2 + (i * 0.1))
      : hoursFromNow(1 + (i * 0.1)),
    departedAt: tripStatus !== 'planned' ? hoursFromNow(-2 - (i * 0.15)) : undefined,
    arrivedAt: tripStatus === 'completed' ? hoursFromNow(-0.5 - (i * 0.1)) : undefined,
    status: tripStatus,
    slaStatus,
    progressPct:
      tripStatus === 'planned' ? 0 :
      tripStatus === 'completed' ? 100 :
      Math.min(95, 20 + i * 2),
    distanceTotal: 8 + (i % 18),
    distanceDone:
      tripStatus === 'planned' ? 0 :
      tripStatus === 'completed' ? 8 + (i % 18) :
      Math.round((20 + i * 2) / 100 * (8 + i % 18)),
  }
})

export const mockTrips: Trip[] = [...canonicalTrips, ...generatedTrips]

// suppress unused variable warning — minutesFromNow kept for future use
void minutesFromNow
