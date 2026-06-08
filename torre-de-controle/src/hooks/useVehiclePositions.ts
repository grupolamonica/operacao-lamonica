import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { useQueryClient } from '@tanstack/react-query'

export type VehiclePosition = {
  vehicleId: string
  lat: number
  lng: number
  speed: number
  heading: number
  capturedAt: string
  slaStatus: 'no_prazo' | 'em_risco' | 'atrasado' | 'sem_sinal'
  motorista?: string | null   // enriquecido no broadcast WS (viagem ativa do veículo)
  destino?: string | null
}

type PositionsStore = {
  positions: Map<string, VehiclePosition>
  setPosition: (pos: VehiclePosition) => void
  connected: boolean
  setConnected: (v: boolean) => void
  newAlertCount: number
  incrementAlerts: () => void
  clearAlerts: () => void
}

export const usePositionsStore = create<PositionsStore>((set) => ({
  positions:       new Map(),
  connected:       false,
  newAlertCount:   0,
  setConnected:    (v) => set({ connected: v }),
  incrementAlerts: () => set(s => ({ newAlertCount: s.newAlertCount + 1 })),
  clearAlerts:     () => set({ newAlertCount: 0 }),
  setPosition:     (pos) => set(s => {
    const next = new Map(s.positions)
    next.set(pos.vehicleId, pos)
    return { positions: next }
  }),
}))

const WS_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000')
  .replace(/^http/, 'ws') + '/ws/vehicles'

// Manages the WebSocket connection singleton — call once per app, not per component.
// Read positions via usePositionsStore(s => s.positions) directly.
export function useVehiclePositions() {
  const wsRef    = useRef<WebSocket | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const qc       = useQueryClient()

  useEffect(() => {
    function connect() {
      if (wsRef.current?.readyState === WebSocket.OPEN) return

      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        usePositionsStore.getState().setConnected(true)
        const ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('ping'), 25_000)
        ws.addEventListener('close', () => clearInterval(ping))
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string)
          if (msg.type === 'position:update') {
            usePositionsStore.getState().setPosition(msg.data as VehiclePosition)
          } else if (msg.type === 'alert:new') {
            usePositionsStore.getState().incrementAlerts()
            // Sprint 5 — refresh affected views without a manual reload.
            // WS hub wraps the original payload in `data`, so read fields off `data`.
            const tripId = msg.data?.tripId as string | undefined
            qc.invalidateQueries({ queryKey: ['alerts'] })
            qc.invalidateQueries({ queryKey: ['alert-stats'] })
            qc.invalidateQueries({ queryKey: ['vehicle-context'] })
            if (tripId) {
              qc.invalidateQueries({ queryKey: ['trip-timeline', tripId] })
              qc.invalidateQueries({ queryKey: ['trip-risk',     tripId] })
            }
          } else if (msg.type === 'timeline:new') {
            const tripId = msg.data?.tripId as string | undefined
            if (tripId) qc.invalidateQueries({ queryKey: ['trip-timeline', tripId] })
            qc.invalidateQueries({ queryKey: ['vehicle-context'] })
          }
        } catch { /* ignore malformed */ }
      }

      ws.onclose = () => {
        usePositionsStore.getState().setConnected(false)
        retryRef.current = setTimeout(connect, 3000)
      }

      ws.onerror = () => ws.close()
    }

    connect()
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, []) // empty deps — connect once on mount
}
