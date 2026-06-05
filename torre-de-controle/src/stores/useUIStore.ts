import { create } from 'zustand'

export type TripsTab = 'todas' | 'em_andamento' | 'planejadas' | 'concluidas' | 'atrasadas'

// NOTA: isSidebarCollapsed NÃO está neste store — shadcn SidebarProvider gerencia seu próprio
// estado de colapso via useSidebar(). Adicionar isSidebarCollapsed aqui criaria dois sources of truth.
// Pages que precisam controlar sidebar: usar useSidebar() do shadcn.
interface UIState {
  selectedTripId: string | null
  setSelectedTripId: (id: string | null) => void

  selectedDriverId: string | null
  setSelectedDriverId: (id: string | null) => void

  selectedAlertId: string | null
  setSelectedAlertId: (id: string | null) => void

  activeTripsTab: TripsTab
  setActiveTripsTab: (tab: TripsTab) => void
}

export const useUIStore = create<UIState>((set) => ({
  selectedTripId: null,
  setSelectedTripId: (id) => set({ selectedTripId: id }),

  selectedDriverId: null,
  setSelectedDriverId: (id) => set({ selectedDriverId: id }),

  selectedAlertId: null,
  setSelectedAlertId: (id) => set({ selectedAlertId: id }),

  activeTripsTab: 'todas',
  setActiveTripsTab: (tab) => set({ activeTripsTab: tab }),
}))
