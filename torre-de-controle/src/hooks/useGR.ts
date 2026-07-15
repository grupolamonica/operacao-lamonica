/**
 * Hooks do GR (Gerenciamento de Risco) — consome /api/gr/* (PR1–PR3).
 * Padrão dos demais hooks: useQuery + EMPTY fallback + refetch 30s; mutations
 * invalidam as queries no onSuccess. A senha revelada NUNCA entra no cache do
 * React Query — vai direto pro estado local da página.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

// ── Tipos (espelham api/src/modules/gr/gr.types.ts + gr.risk-status.ts) ──────
export type GrVerdict = 'OK' | 'ATENCAO' | 'CRITICO' | 'SEM_DADO'
export type GrSource = 'ANGELLIRA' | 'BRK' | 'SPX'

export interface GrProviderStatus {
  provider: 'angellira' | 'brk' | 'spx'
  status: string
  rawStatus: string | null
  statusText: string | null
  validUntil: string | null
  daysUntilExpiry: number | null
  conjuntoApto: boolean | null
  checkedAt: string | null
}

export interface GrDriver {
  cpf: string
  displayName: string | null
  verdict: GrVerdict
  reasons: GrSource[]
  providers: GrProviderStatus[]
}

export interface GrVehicle {
  plate: string
  plateRole: string | null
  displayName: string | null
  linkedDriverCpf: string | null
  verdict: GrVerdict
  angellira: GrProviderStatus | null
}

export interface GrAlertItem {
  id: string
  entityType: 'motorista' | 'veiculo'
  entityId: string
  displayName: string | null
  document: string | null
  plate: string | null
  plateRole: string | null
  linkedDriver: { name: string | null; cpf: string | null } | null
  source: GrSource
  alertType: 'EXPIRY' | 'STATE' | 'NOT_FOUND'
  severity: 'crit' | 'warn'
  daysUntilExpiry: number | null
  dueDate: string | null
  message: string
  checkedAt: string | null
}

export interface GrVerdictCounts { total: number; ok: number; atencao: number; critico: number; semDado: number }

export interface GrOverview {
  drivers: GrVerdictCounts
  vehicles: GrVerdictCounts
  alertas: { total: number; criticos: number; atencao: number }
  lastSyncAt: string | null
}

// ── SPX / Shopee (espelham api/src/modules/gr/gr.spx.types.ts) ────────────────
export interface SpxEspelhamento {
  lastAt: string | null
  status: 'ok' | 'stale' | 'sem_sinal'
}
export interface SpxRow {
  lh: string
  data: string | null
  horario: string | null
  tipo: string | null
  vinculo: string | null
  motorista: string | null
  cpf: string | null
  cavalo: string | null
  carreta: string | null
  origem: string | null
  destino: string | null
  statusViagem: string | null
  perfilCavalo: string | null
  perfilCarreta: string | null
  checklistCavalo: string | null
  checklistCarreta: string | null
  checklistCavaloDias: number | null
  checklistCarretaDias: number | null
  espelhamento: SpxEspelhamento
  hasDriver: boolean
  isAvailable: boolean
  pendencia: boolean
  conforme: boolean
}
export interface SpxOverview {
  date: string
  escaladosHoje: number
  programadosAmanha: number
  frotasConformes: number
  semEspelhamento: number
  naoConforme: number
  lastSyncAt: string | null
}

export interface VaultItem {
  plate: string
  provider: string
  login: string
  username: string
  hasPassword: boolean
  rastreadorId: string | null
  embarcador: string | null
  notes: string | null
  updatedAt: string | null
}

export interface VaultUpsertInput {
  plate: string
  provider?: string
  login?: string
  username?: string
  senha?: string
  rastreadorId?: string
  embarcador?: string
  notes?: string
}

export interface VaultRevealResult {
  plate: string
  provider: string
  login: string
  username: string
  senha: string | null
}

const EMPTY_COUNTS: GrVerdictCounts = { total: 0, ok: 0, atencao: 0, critico: 0, semDado: 0 }
const EMPTY_OVERVIEW: GrOverview = {
  drivers: EMPTY_COUNTS,
  vehicles: EMPTY_COUNTS,
  alertas: { total: 0, criticos: 0, atencao: 0 },
  lastSyncAt: null,
}

// ── Queries ──────────────────────────────────────────────────────────────────
export function useGROverview() {
  const q = useQuery({
    queryKey: ['gr-overview'],
    queryFn: async () => {
      const { data, error } = await api.api.gr.overview.get()
      if (error) throw error
      return (data ?? EMPTY_OVERVIEW) as GrOverview
    },
    refetchInterval: 30_000,
  })
  return { data: q.data ?? EMPTY_OVERVIEW, isLoading: q.isLoading, isError: q.isError }
}

export function useGRDrivers() {
  const q = useQuery({
    queryKey: ['gr-drivers'],
    queryFn: async () => {
      const { data, error } = await api.api.gr.drivers.get()
      if (error) throw error
      return (data ?? []) as GrDriver[]
    },
    refetchInterval: 30_000,
  })
  return { data: q.data ?? [], isLoading: q.isLoading }
}

export function useGRVehicles() {
  const q = useQuery({
    queryKey: ['gr-vehicles'],
    queryFn: async () => {
      const { data, error } = await api.api.gr.vehicles.get()
      if (error) throw error
      return (data ?? []) as GrVehicle[]
    },
    refetchInterval: 30_000,
  })
  return { data: q.data ?? [], isLoading: q.isLoading }
}

export function useGRAlerts() {
  const q = useQuery({
    queryKey: ['gr-alerts'],
    queryFn: async () => {
      const { data, error } = await api.api.gr.alerts.get()
      if (error) throw error
      return (data ?? []) as GrAlertItem[]
    },
    refetchInterval: 30_000,
  })
  return { data: q.data ?? [], isLoading: q.isLoading }
}

const EMPTY_SPX_OVERVIEW: SpxOverview = {
  date: '', escaladosHoje: 0, programadosAmanha: 0, frotasConformes: 0, semEspelhamento: 0, naoConforme: 0, lastSyncAt: null,
}

export function useSpxOverview(enabled: boolean) {
  const q = useQuery({
    queryKey: ['spx-overview'],
    queryFn: async () => {
      const { data, error } = await api.api.gr.spx.overview.get()
      if (error) throw error
      return (data ?? EMPTY_SPX_OVERVIEW) as SpxOverview
    },
    enabled,
    refetchInterval: 60_000,
  })
  return { data: q.data ?? EMPTY_SPX_OVERVIEW, isLoading: q.isLoading }
}

export function useSpxRows(scope: 'today' | 'tomorrow', enabled: boolean) {
  const q = useQuery({
    queryKey: ['spx-rows', scope],
    queryFn: async () => {
      const { data, error } = await api.api.gr.spx.rows.get({ query: { scope } })
      if (error) throw error
      return (data ?? []) as SpxRow[]
    },
    enabled,
    refetchInterval: 60_000,
  })
  return { data: q.data ?? [], isLoading: q.isLoading }
}

export function useGRVault(enabled: boolean) {
  const q = useQuery({
    queryKey: ['gr-vault'],
    queryFn: async () => {
      const { data, error } = await api.api.gr.vault.get()
      if (error) throw error
      return (data ?? []) as VaultItem[]
    },
    enabled,
  })
  return { data: q.data ?? [], isLoading: q.isLoading }
}

// ── Mutations ────────────────────────────────────────────────────────────────
const GR_KEYS = [['gr-overview'], ['gr-drivers'], ['gr-vehicles'], ['gr-alerts']] as const

export function useGRSync() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await api.api.gr.sync.post()
      if (error) throw error
      return data as { drivers: number; vehicles: number; rows: number; ts: string }
    },
    onSuccess: () => {
      for (const key of GR_KEYS) qc.invalidateQueries({ queryKey: [...key] })
    },
  })
}

export function useVaultUpsert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: VaultUpsertInput) => {
      const { data, error } = await api.api.gr.vault.put(input)
      if (error) throw error
      return data as { plate: string }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gr-vault'] }),
  })
}

export function useVaultReveal() {
  return useMutation({
    mutationFn: async (plate: string) => {
      const { data, error } = await api.api.gr.vault.reveal.post({ plate })
      if (error) throw error
      return data as VaultRevealResult
    },
  })
}

export function useVaultDelete() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (plate: string) => {
      // Segmento dinâmico do treaty (bypass de tipo — padrão do projeto p/ :param)
      const vault = (api as unknown as { api: { gr: { vault: Record<string, { delete: () => Promise<{ data: unknown; error: unknown }> }> } } }).api.gr.vault
      const { error } = await vault[plate]!.delete()
      if (error) throw error
      return true
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gr-vault'] }),
  })
}
