import { useEffect, useRef, useCallback } from 'react'
import { create } from 'zustand'

export type VehiclePosition = {
  vehicleId: string
  lat: number
  lng: number
  speed: number
  heading: number
  capturedAt: string
  slaStatus: 'no_prazo' | 'em_risco' | 'atrasado' | 'sem_sinal'
}

type PositionsStore = {
  positions: Map<string, VehiclePosition>
  setPosition: (pos: VehiclePosition) => void
  connected: boolean
  setConnected: (v: boolean) => void
}

export const usePositionsStore = create<PositionsStore>((set) => ({
  positions:    new Map(),
  connected:    false,
  setConnected: (v) => set({ connected: v }),
  setPosition:  (pos) => set(s => {
    const next = new Map(s.positions)
    next.set(pos.vehicleId, pos)
    return { positions: next }
  }),
}))

const WS_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000')
  .replace(/^http/, 'ws') + '/ws/vehicles'

export function useVehiclePositions() {
  const wsRef       = useRef<WebSocket | null>(null)
  const retryRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { setPosition, setConnected } = usePositionsStore()

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      // keepalive ping every 25s
      const ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('ping'), 25_000)
      ws.addEventListener('close', () => clearInterval(ping))
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string)
        if (msg.type === 'position:update') {
          setPosition(msg.data as VehiclePosition)
        }
      } catch { /* ignore malformed */ }
    }

    ws.onclose = () => {
      setConnected(false)
      // Reconnect after 3s
      retryRef.current = setTimeout(connect, 3000)
    }

    ws.onerror = () => ws.close()
  }, [setPosition, setConnected])

  useEffect(() => {
    connect()
    return () => {
      retryRef.current && clearTimeout(retryRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  return usePositionsStore(s => ({ positions: s.positions, connected: s.connected }))
}
