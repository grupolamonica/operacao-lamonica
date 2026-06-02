import { eq, asc } from 'drizzle-orm'
import { db } from '../../db/client'
import { tripEvents } from '../../db/schema/trip-events'
import { alerts } from '../../db/schema/alerts'
import { treatments } from '../../db/schema/treatments'

// Unified timeline event surfaced to the UI. The frontend's TimelineEventKind
// (departure|stop|delivery|alert|arrival|pending) is derived from `kind` here.
export type TimelineKind = 'departure' | 'stop' | 'delivery' | 'alert' | 'arrival' | 'pending'

export interface TimelineItem {
  id:           string
  source:       'trip_event' | 'alert' | 'treatment'
  kind:         TimelineKind
  eventType:    string                 // raw eventType / alertType / actionType
  title:        string
  description?: string
  occurredAt:   string                 // ISO
  lat?:         number
  lng?:         number
  geofenceId?:  string
  severity?:    'critico' | 'medio' | 'baixo'
  metadata?:    Record<string, unknown>
  isCompleted?: boolean
  isCurrent?:   boolean
}

// Map trip_events.event_type → UI kind + human label
const EVENT_LABELS: Record<string, { kind: TimelineKind; title: string }> = {
  load_started:      { kind: 'stop',      title: 'Carregamento iniciado'         },
  load_finished:     { kind: 'stop',      title: 'Carregamento finalizado'       },
  departed:          { kind: 'departure', title: 'Saída da origem'               },
  in_route:          { kind: 'departure', title: 'Em rota'                       },
  stopped:           { kind: 'stop',      title: 'Parada'                        },
  resumed:           { kind: 'departure', title: 'Retomada de viagem'            },
  deviation:         { kind: 'alert',     title: 'Desvio de rota'                },
  geofence_entered:  { kind: 'arrival',   title: 'Entrada em geofence'           },
  geofence_exited:   { kind: 'departure', title: 'Saída de geofence'             },
  arrived_client:    { kind: 'arrival',   title: 'Chegada ao cliente'            },
  unload_started:    { kind: 'stop',      title: 'Descarga iniciada'             },
  unload_finished:   { kind: 'delivery',  title: 'Descarga concluída'            },
  closed:            { kind: 'delivery',  title: 'Viagem encerrada'              },
  manual_note:       { kind: 'pending',   title: 'Observação'                    },
  // Sprint 2 — alert workflow lifecycle events
  alert_under_review: { kind: 'alert',    title: 'Ocorrência em análise'         },
  alert_in_treatment: { kind: 'alert',    title: 'Ocorrência em tratativa'       },
  alert_resolved:     { kind: 'delivery', title: 'Ocorrência resolvida'          },
  alert_closed:       { kind: 'delivery', title: 'Ocorrência encerrada'          },
}

const ALERT_LABELS: Record<string, string> = {
  atraso_critico:          'Atraso crítico',
  desvio_nao_autorizado:   'Desvio não autorizado',
  parada_nao_planejada:    'Parada não planejada',
  sinal_gps_intermitente:  'Sinal GPS intermitente',
  tempo_parada_elevado:    'Tempo de parada elevado',
  entrega_fora_janela:     'Entrega fora da janela',
  checklist_incompleto:    'Checklist incompleto',
}

const TREATMENT_LABELS: Record<string, string> = {
  assumiu:              'Operador assumiu',
  registrou_tratativa:  'Tratativa registrada',
  ligou_motorista:      'Ligação para motorista',
  escalou:              'Escalado',
  resolveu:             'Resolvido pelo operador',
}

/**
 * Aggregate trip_events + alerts + treatments into a single ordered timeline.
 * Read-time merge keeps writers simple (one table per concern) while giving the
 * UI a single chronological feed.
 */
export async function getTripTimeline(tripId: string): Promise<TimelineItem[]> {
  const [events, tripAlerts, tripTreatments] = await Promise.all([
    db.select().from(tripEvents).where(eq(tripEvents.tripId, tripId)).orderBy(asc(tripEvents.occurredAt)),
    db.select().from(alerts).where(eq(alerts.tripId, tripId)).orderBy(asc(alerts.occurredAt)),
    db.select().from(treatments).where(eq(treatments.tripId, tripId)).orderBy(asc(treatments.createdAt)),
  ])

  const items: TimelineItem[] = []

  for (const e of events) {
    const meta = EVENT_LABELS[e.eventType] ?? { kind: 'pending' as TimelineKind, title: e.eventType }
    items.push({
      id:          `evt:${e.id}`,
      source:      'trip_event',
      kind:        meta.kind,
      eventType:   e.eventType,
      title:       meta.title,
      description: e.notes ?? undefined,
      occurredAt:  e.occurredAt.toISOString(),
      lat:         e.lat ? Number(e.lat) : undefined,
      lng:         e.lng ? Number(e.lng) : undefined,
      geofenceId:  e.geofenceId ?? undefined,
      metadata:    (e.metadata as Record<string, unknown>) ?? undefined,
      isCompleted: true,
    })
  }

  for (const a of tripAlerts) {
    items.push({
      id:          `alt:${a.id}`,
      source:      'alert',
      kind:        'alert',
      eventType:   a.type,
      title:       `${ALERT_LABELS[a.type] ?? a.type} — ${a.title}`,
      description: a.description ?? undefined,
      occurredAt:  a.occurredAt.toISOString(),
      lat:         a.lat ? Number(a.lat) : undefined,
      lng:         a.lng ? Number(a.lng) : undefined,
      severity:    a.severity as 'critico' | 'medio' | 'baixo',
      isCompleted: a.status === 'resolvido',
    })
  }

  for (const tr of tripTreatments) {
    items.push({
      id:          `trt:${tr.id}`,
      source:      'treatment',
      kind:        'pending',
      eventType:   tr.actionType ?? 'tratativa',
      title:       TREATMENT_LABELS[tr.actionType ?? ''] ?? 'Tratativa',
      description: tr.notes ?? undefined,
      occurredAt:  tr.createdAt.toISOString(),
      isCompleted: tr.outcome === 'resolvido',
    })
  }

  items.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  if (items.length > 0) items[items.length - 1]!.isCurrent = true
  return items
}
