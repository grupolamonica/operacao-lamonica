import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { RiskLevel, RiskFactor, AlertSeverity, AlertStatus, Priority, SlaStatus, TripStatus } from '@/data/types'

export interface VehicleContextPayload {
  vehicle: { id: string; plate: string; type: string | null; driverId: string | null }
  driver:  { id: string; name: string; photoUrl: string | null; code: string; phone: string | null } | null
  activeTrip: {
    id:          string
    code:        string
    status:      TripStatus
    slaStatus:   SlaStatus | null
    origin:      string | null
    destination: string | null
    windowStart: string
    windowEnd:   string
    eta:         string | null
    progressPct: number
    clientName:  string
    routeCode:   string
    riskScore:   number | null
    riskLevel:   RiskLevel | null
    riskFactors: RiskFactor[] | null
  } | null
  recentAlerts: Array<{
    id:          string
    type:        string
    severity:    AlertSeverity
    status:      AlertStatus
    priority:    Priority
    title:       string
    occurredAt:  string
    slaDeadline: string | null
  }>
  timeline: Array<{
    id:          string
    source:      'trip_event' | 'alert' | 'treatment'
    kind:        'departure' | 'stop' | 'delivery' | 'alert' | 'arrival' | 'pending'
    eventType:   string
    title:       string
    description?: string
    occurredAt:  string
  }>
}

export function useVehicleContext(vehicleId: string | null) {
  return useQuery({
    queryKey: ['vehicle-context', vehicleId],
    enabled:  !!vehicleId,
    queryFn:  async (): Promise<VehicleContextPayload> => {
      const { data, error } = await (api.api.vehicles as any)[vehicleId!].context.get()
      if (error) throw new Error('Failed to load vehicle context')
      return data as VehicleContextPayload
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}
