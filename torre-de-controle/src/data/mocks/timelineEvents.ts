import type { TimelineEvent } from '@/data/types'

const today = new Date()
const hoursAgo = (h: number) => { const d = new Date(today); d.setTime(d.getTime() - h * 60 * 60 * 1000); return d }
const hoursFromNow = (h: number) => { const d = new Date(today); d.setTime(d.getTime() + h * 60 * 60 * 1000); return d }

export const mockTimelineByTrip: Record<string, TimelineEvent[]> = {
  'trp-001': [
    { id: 'tl-001-1', tripId: 'trp-001', kind: 'departure', title: 'Saída do CD Vila Olímpia', occurredAt: hoursAgo(1.5), isCompleted: true, isCurrent: false },
    { id: 'tl-001-2', tripId: 'trp-001', kind: 'stop', title: 'Parada em ponto de coleta', description: 'Parada de 8 min em ponto autorizado', occurredAt: hoursAgo(0.9), isCompleted: true, isCurrent: false },
    { id: 'tl-001-3', tripId: 'trp-001', kind: 'pending', title: 'Em rota para destino', description: 'ETA: 1h12 — Bairro Pinheiros', occurredAt: today, isCompleted: false, isCurrent: true },
    { id: 'tl-001-4', tripId: 'trp-001', kind: 'arrival', title: 'Entrega prevista', description: 'Bairro Pinheiros', occurredAt: hoursFromNow(1.2), isCompleted: false, isCurrent: false },
  ],
  'trp-005': [
    { id: 'tl-005-1', tripId: 'trp-005', kind: 'departure', title: 'Saída do CD Campinas', occurredAt: hoursAgo(3.2), isCompleted: true, isCurrent: false },
    { id: 'tl-005-2', tripId: 'trp-005', kind: 'alert', title: 'Alerta — desvio detectado', description: '4.2 km da rota planejada', occurredAt: hoursAgo(0.13), isCompleted: true, isCurrent: false },
    { id: 'tl-005-3', tripId: 'trp-005', kind: 'pending', title: 'Em rota — risco de atraso', description: 'ETA pode ultrapassar janela', occurredAt: today, isCompleted: false, isCurrent: true },
    { id: 'tl-005-4', tripId: 'trp-005', kind: 'arrival', title: 'Entrega prevista', description: 'Sumaré', occurredAt: hoursFromNow(0.7), isCompleted: false, isCurrent: false },
  ],
  'trp-007': [
    { id: 'tl-007-1', tripId: 'trp-007', kind: 'departure', title: 'Saída do CD Guarulhos', occurredAt: hoursAgo(4.2), isCompleted: true, isCurrent: false },
    { id: 'tl-007-2', tripId: 'trp-007', kind: 'stop', title: 'Parada em ponto de coleta', occurredAt: hoursAgo(2.5), isCompleted: true, isCurrent: false },
    { id: 'tl-007-3', tripId: 'trp-007', kind: 'alert', title: 'Janela de entrega ultrapassada', description: '+30 min após fechamento', occurredAt: hoursAgo(0.5), isCompleted: true, isCurrent: false },
    { id: 'tl-007-4', tripId: 'trp-007', kind: 'pending', title: 'Aproximação do destino', description: 'Aeroporto GRU', occurredAt: today, isCompleted: false, isCurrent: true },
  ],
  'trp-008': [
    { id: 'tl-008-1', tripId: 'trp-008', kind: 'departure', title: 'Saída do CD Guarulhos', occurredAt: hoursAgo(2.1), isCompleted: true, isCurrent: false },
    { id: 'tl-008-2', tripId: 'trp-008', kind: 'alert', title: 'Sinal GPS perdido', description: 'Última posição: Av. Salim Farah Maluf', occurredAt: hoursAgo(0.2), isCompleted: true, isCurrent: true },
    { id: 'tl-008-3', tripId: 'trp-008', kind: 'arrival', title: 'Entrega prevista', description: 'Tatuapé', occurredAt: hoursFromNow(1.4), isCompleted: false, isCurrent: false },
  ],
  'trp-002': [
    { id: 'tl-002-1', tripId: 'trp-002', kind: 'departure', title: 'Saída do CD Tatuapé', occurredAt: hoursAgo(2.2), isCompleted: true, isCurrent: false },
    { id: 'tl-002-2', tripId: 'trp-002', kind: 'stop', title: 'Parada em ponto de entrega', description: 'Cliente recebeu mercadoria', occurredAt: hoursAgo(1.0), isCompleted: true, isCurrent: false },
    { id: 'tl-002-3', tripId: 'trp-002', kind: 'pending', title: 'Em rota — último trecho', description: 'ETA: 48 min — Centro SP', occurredAt: today, isCompleted: false, isCurrent: true },
    { id: 'tl-002-4', tripId: 'trp-002', kind: 'arrival', title: 'Entrega prevista', description: 'Centro de São Paulo', occurredAt: hoursFromNow(0.8), isCompleted: false, isCurrent: false },
  ],
}
