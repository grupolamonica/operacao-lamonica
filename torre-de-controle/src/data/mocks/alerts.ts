import type { Alert, AlertSeverity, AlertStatus, AlertType } from '@/data/types'

const today = new Date()
const minsAgo = (m: number) => { const d = new Date(today); d.setMinutes(d.getMinutes() - m); return d }
const minsFromNow = (m: number) => { const d = new Date(today); d.setMinutes(d.getMinutes() + m); return d }

const canonicalAlerts: Alert[] = [
  // === CRÍTICOS (5) ===
  {
    id: 'alt-001', type: 'atraso_critico', severity: 'critico', status: 'aberto',
    tripId: 'trp-007', tripCode: 'VG-90288', driverId: 'drv-003', driverName: 'Roberto Almeida Pereira',
    plate: 'PHQ-1023', clientName: 'Shopee', routeCode: 'ROTA-GRU-002',
    title: 'Atraso crítico — janela ultrapassada',
    description: 'Veículo passou da janela de entrega há 30 min. Cliente notificado.',
    source: 'GPS', delayMinutes: 32, occurredAt: minsAgo(30), slaDeadline: minsFromNow(15),
    lat: -23.4356, lng: -46.4731,
  },
  {
    id: 'alt-002', type: 'desvio_nao_autorizado', severity: 'critico', status: 'aberto',
    tripId: 'trp-005', tripCode: 'VG-90261', driverId: 'drv-005', driverName: 'Anderson Martins Silva',
    plate: 'MJK-3392', clientName: 'Shopee', routeCode: 'ROTA-CPS-003',
    title: 'Desvio de rota não autorizado',
    description: 'Veículo a 4.2 km da rota planejada por mais de 8 minutos.',
    source: 'GPS', deviationKm: 4.2, occurredAt: minsAgo(8), slaDeadline: minsFromNow(20),
    lat: -22.8222, lng: -47.2667,
  },
  {
    id: 'alt-003', type: 'sinal_gps_intermitente', severity: 'critico', status: 'em_tratativa',
    tripId: 'trp-008', tripCode: 'VG-90299', driverId: 'drv-007', driverName: 'Lucas Fernandes Cardoso',
    plate: 'NHB-6643', clientName: 'Mercado Livre', routeCode: 'ROTA-GRU-005',
    title: 'Sinal GPS perdido há 12 min',
    description: 'Última posição: Av. Salim Farah Maluf. Sem reconexão.',
    source: 'Telemetria', occurredAt: minsAgo(12), slaDeadline: minsFromNow(10),
    assignedTo: 'op-001',
  },
  {
    id: 'alt-004', type: 'atraso_critico', severity: 'critico', status: 'aberto',
    tripId: 'trp-015', tripCode: 'VG-90180', driverId: 'drv-005', driverName: 'Anderson Martins Silva',
    plate: 'MJK-3392', clientName: 'Magazine Luiza', routeCode: 'ROTA-CPS-003',
    title: 'Entrega fora da janela cliente',
    description: 'Entrega concluída 1h12 após fechamento de janela.',
    source: 'GPS', delayMinutes: 72, occurredAt: minsAgo(75),
  },
  {
    id: 'alt-005', type: 'parada_nao_planejada', severity: 'critico', status: 'aberto',
    tripId: 'trp-006', tripCode: 'VG-90274', driverId: 'drv-009', driverName: 'Diego Barbosa Nunes',
    plate: 'WPL-5532', clientName: 'Magazine Luiza', routeCode: 'ROTA-CPS-007',
    title: 'Parada não planejada > 25 min',
    description: 'Veículo parado em via lateral fora de geofence.',
    source: 'GPS', occurredAt: minsAgo(25), slaDeadline: minsFromNow(35),
    lat: -23.0500, lng: -47.1800,
  },
  // === MÉDIOS (6) ===
  {
    id: 'alt-006', type: 'tempo_parada_elevado', severity: 'medio', status: 'aberto',
    tripId: 'trp-002', tripCode: 'VG-90234', driverId: 'drv-002', driverName: 'Mariana Oliveira Lima',
    plate: 'JZS-4477', clientName: 'Magazine Luiza', routeCode: 'ROTA-SP-014',
    title: 'Tempo elevado em ponto de entrega',
    description: 'Parado há 18 min no ponto. Threshold: 15 min.',
    source: 'GPS', occurredAt: minsAgo(18),
  },
  {
    id: 'alt-007', type: 'tempo_parada_elevado', severity: 'medio', status: 'aberto',
    tripId: 'trp-001', tripCode: 'VG-90211', driverId: 'drv-001', driverName: 'Carlos Henrique Souza',
    plate: 'KLP-9081', clientName: 'Shopee', routeCode: 'ROTA-SP-001',
    title: 'Velocidade média abaixo do esperado',
    description: 'Velocidade média 18 km/h vs prevista 32 km/h.',
    source: 'Telemetria', occurredAt: minsAgo(22),
  },
  {
    id: 'alt-008', type: 'desvio_nao_autorizado', severity: 'medio', status: 'aberto',
    tripId: 'trp-003', tripCode: 'VG-90245', driverId: 'drv-006', driverName: 'Patricia Gomes Ferreira',
    plate: 'XCV-7714', clientName: 'Mercado Livre', routeCode: 'ROTA-SP-008',
    title: 'Desvio menor de rota detectado',
    description: 'Veículo a 1.8 km da rota planejada.',
    source: 'GPS', deviationKm: 1.8, occurredAt: minsAgo(10),
  },
  {
    id: 'alt-009', type: 'parada_nao_planejada', severity: 'medio', status: 'em_tratativa',
    tripId: 'trp-004', tripCode: 'VG-90250', driverId: 'drv-008', driverName: 'Fernanda Rocha Mendes',
    plate: 'TGY-2218', clientName: 'Amazon', routeCode: 'ROTA-SP-022',
    title: 'Parada não planejada > 8 min',
    description: 'Parada em rua não cadastrada como ponto de entrega.',
    source: 'GPS', occurredAt: minsAgo(8), assignedTo: 'op-002',
  },
  {
    id: 'alt-010', type: 'sinal_gps_intermitente', severity: 'medio', status: 'aberto',
    tripId: 'trp-005', tripCode: 'VG-90261', driverId: 'drv-005', driverName: 'Anderson Martins Silva',
    plate: 'MJK-3392', clientName: 'Shopee', routeCode: 'ROTA-CPS-003',
    title: 'Sinal GPS intermitente',
    description: '3 perdas de sinal nas últimas 15 min.',
    source: 'Telemetria', occurredAt: minsAgo(5),
  },
  {
    id: 'alt-011', type: 'checklist_incompleto', severity: 'medio', status: 'aberto',
    tripId: 'trp-009', tripCode: 'VG-90310', driverId: 'drv-004', driverName: 'Juliana Costa Ribeiro',
    plate: 'RFD-8821', clientName: 'Amazon', routeCode: 'ROTA-SP-031',
    title: 'Checklist pré-viagem incompleto',
    description: '2 itens pendentes no checklist de saída.',
    source: 'Checklist', occurredAt: minsAgo(45),
  },
  // === BAIXOS (4) ===
  {
    id: 'alt-012', type: 'tempo_parada_elevado', severity: 'baixo', status: 'aberto',
    tripId: 'trp-001', tripCode: 'VG-90211', driverId: 'drv-001', driverName: 'Carlos Henrique Souza',
    plate: 'KLP-9081', clientName: 'Shopee', routeCode: 'ROTA-SP-001',
    title: 'Pequena parada não planejada',
    description: 'Parado por 5 min em sinal de trânsito.',
    source: 'GPS', occurredAt: minsAgo(40),
  },
  {
    id: 'alt-013', type: 'sinal_gps_intermitente', severity: 'baixo', status: 'resolvido',
    tripId: 'trp-002', tripCode: 'VG-90234', driverId: 'drv-002', driverName: 'Mariana Oliveira Lima',
    plate: 'JZS-4477', clientName: 'Magazine Luiza', routeCode: 'ROTA-SP-014',
    title: 'Falha breve de sinal GPS',
    description: 'Sinal recuperado em 1m20s.',
    source: 'Telemetria', occurredAt: minsAgo(120), resolvedAt: minsAgo(118),
  },
  {
    id: 'alt-014', type: 'checklist_incompleto', severity: 'baixo', status: 'resolvido',
    tripId: 'trp-012', tripCode: 'VG-90150', driverId: 'drv-001', driverName: 'Carlos Henrique Souza',
    plate: 'KLP-9081', clientName: 'Shopee', routeCode: 'ROTA-SP-001',
    title: 'Checklist preenchido com atraso',
    description: 'Concluído 3 min após prazo.',
    source: 'Checklist', occurredAt: minsAgo(540), resolvedAt: minsAgo(530),
  },
  {
    id: 'alt-015', type: 'tempo_parada_elevado', severity: 'baixo', status: 'aberto',
    tripId: 'trp-006', tripCode: 'VG-90274', driverId: 'drv-009', driverName: 'Diego Barbosa Nunes',
    plate: 'WPL-5532', clientName: 'Magazine Luiza', routeCode: 'ROTA-CPS-007',
    title: 'Velocidade reduzida em trecho',
    description: 'Velocidade média baixa em trecho de 2 km.',
    source: 'Telemetria', occurredAt: minsAgo(60),
  },
]

const generatedAlerts: Alert[] = Array.from({ length: 25 }, (_, i): Alert => {
  const n = i + 16
  const severityPool: AlertSeverity[] = [
    'critico', 'critico', 'critico',
    'medio', 'medio', 'medio', 'medio', 'medio',
    'baixo', 'baixo',
  ]
  const severity: AlertSeverity = severityPool[i % severityPool.length]
  const statusPool: AlertStatus[] = ['aberto', 'aberto', 'em_tratativa', 'resolvido']
  const typePool: AlertType[] = [
    'atraso_critico', 'desvio_nao_autorizado', 'parada_nao_planejada',
    'sinal_gps_intermitente', 'tempo_parada_elevado', 'entrega_fora_janela', 'checklist_incompleto',
  ]
  const tripIdx = (i % 8) + 1
  const tripId = `trp-${String(tripIdx).padStart(3, '0')}`
  const tripCodes: Record<string, string> = {
    'trp-001': 'VG-90211', 'trp-002': 'VG-90234', 'trp-003': 'VG-90245', 'trp-004': 'VG-90250',
    'trp-005': 'VG-90261', 'trp-006': 'VG-90274', 'trp-007': 'VG-90288', 'trp-008': 'VG-90299',
  }
  const driverMeta: Record<string, { id: string; name: string; plate: string; client: string; route: string }> = {
    'trp-001': { id: 'drv-001', name: 'Carlos Henrique Souza',   plate: 'KLP-9081', client: 'Shopee',         route: 'ROTA-SP-001' },
    'trp-002': { id: 'drv-002', name: 'Mariana Oliveira Lima',   plate: 'JZS-4477', client: 'Magazine Luiza', route: 'ROTA-SP-014' },
    'trp-003': { id: 'drv-006', name: 'Patricia Gomes Ferreira', plate: 'XCV-7714', client: 'Mercado Livre',  route: 'ROTA-SP-008' },
    'trp-004': { id: 'drv-008', name: 'Fernanda Rocha Mendes',   plate: 'TGY-2218', client: 'Amazon',         route: 'ROTA-SP-022' },
    'trp-005': { id: 'drv-005', name: 'Anderson Martins Silva',  plate: 'MJK-3392', client: 'Shopee',         route: 'ROTA-CPS-003' },
    'trp-006': { id: 'drv-009', name: 'Diego Barbosa Nunes',     plate: 'WPL-5532', client: 'Magazine Luiza', route: 'ROTA-CPS-007' },
    'trp-007': { id: 'drv-003', name: 'Roberto Almeida Pereira', plate: 'PHQ-1023', client: 'Shopee',         route: 'ROTA-GRU-002' },
    'trp-008': { id: 'drv-007', name: 'Lucas Fernandes Cardoso', plate: 'NHB-6643', client: 'Mercado Livre',  route: 'ROTA-GRU-005' },
  }
  const d = driverMeta[tripId]
  const alertType = typePool[i % typePool.length]
  const alertStatus = statusPool[i % statusPool.length]

  return {
    id: `alt-${String(n).padStart(3, '0')}`,
    type: alertType,
    severity,
    status: alertStatus,
    tripId,
    tripCode: tripCodes[tripId],
    driverId: d.id,
    driverName: d.name,
    plate: d.plate,
    clientName: d.client,
    routeCode: d.route,
    title: `${(['Alerta', 'Ocorrência', 'Exceção'] as const)[i % 3]} ${alertType.replace(/_/g, ' ')} — ${d.name.split(' ')[0]}`,
    description: `Alerta gerado automaticamente para teste de volume. Viagem ${tripCodes[tripId]}.`,
    source: (['GPS', 'Telemetria', 'Checklist', 'Manual'] as const)[i % 4],
    delayMinutes: alertType === 'atraso_critico' ? 10 + (i * 3) : undefined,
    deviationKm: alertType === 'desvio_nao_autorizado' ? 1 + (i % 5) : undefined,
    occurredAt: minsAgo(5 + i * 8),
    resolvedAt: alertStatus === 'resolvido' ? minsAgo(i * 4) : undefined,
  }
})

export const mockAlerts: Alert[] = [...canonicalAlerts, ...generatedAlerts]
