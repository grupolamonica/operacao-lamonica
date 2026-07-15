/**
 * Serviço GR — lê o cache local `gr_vigencias`, reconstrói as entradas por
 * entidade e aplica a lógica pura (risk-status) para servir /api/gr/*:
 *  - overview  → contagem por veredito (motorista/veículo) + alertas + last sync
 *  - drivers   → motoristas + veredito consolidado + status por provider
 *  - vehicles  → veículos + vigência Angellira
 *
 * Read-only nesta camada (o cache é populado por gr.sync).
 */
import { db } from '../../db/client'
import { grVigencias, type SelectGrVigencia } from '../../db/schema/gr'
import {
  consolidateVerdict,
  deriveDriverAlerts,
  deriveVehicleAlerts,
  sortByUrgency,
  type AlertLevel,
  type AngelliraInput,
  type BrkInput,
  type SpxInput,
  type GrAlert,
} from './gr.risk-status'
import type {
  GrProvider,
  GrProviderStatus,
  GrDriverView,
  GrVehicleView,
  GrOverview,
  GrVerdictCounts,
} from './gr.types'

const ALERT_LEVELS = new Set(['OK', 'EXPIRING_SOON', 'EXPIRED'])

function isoOrNull(v: unknown): string | null {
  if (!v) return null
  try {
    return new Date(v as string | Date).toISOString()
  } catch {
    return null
  }
}

function toProviderStatus(row: SelectGrVigencia): GrProviderStatus {
  return {
    provider: row.provider as GrProvider,
    status: row.status,
    rawStatus: row.rawStatus ?? null,
    statusText: row.statusText ?? null,
    validUntil: row.validUntil ?? null,
    daysUntilExpiry: row.daysUntilExpiry ?? null,
    conjuntoApto: row.conjuntoApto ?? null,
    checkedAt: isoOrNull(row.checkedAt),
  }
}

/** Linha do cache → entrada normalizada para as funções de domínio. */
function toRiskInput(row: SelectGrVigencia): AngelliraInput | BrkInput | SpxInput {
  const alertLevel = (ALERT_LEVELS.has(row.status) ? row.status : null) as AlertLevel | null
  const checkedAt = isoOrNull(row.checkedAt)
  if (row.provider === 'spx') {
    return { status: row.rawStatus, statusText: row.statusText, encontrado: null, checkedAt } satisfies SpxInput
  }
  const base = {
    status: row.rawStatus,
    statusText: row.statusText,
    validUntil: row.validUntil ?? null,
    daysUntilExpiry: row.daysUntilExpiry ?? null,
    alertLevel,
    checkedAt,
  }
  if (row.provider === 'brk') return { ...base, conjuntoApto: row.conjuntoApto ?? null } satisfies BrkInput
  return base satisfies AngelliraInput
}

interface GrModel {
  drivers: GrDriverView[]
  vehicles: GrVehicleView[]
  alerts: GrAlert[]
  lastSyncAt: string | null
}

async function loadGrModel(): Promise<GrModel> {
  const rows = await db.select().from(grVigencias)

  const driverRows = new Map<string, SelectGrVigencia[]>()
  const vehicleRows = new Map<string, SelectGrVigencia[]>()
  let lastSyncAt: string | null = null

  for (const row of rows) {
    const iso = isoOrNull(row.updatedAt)
    if (iso && (!lastSyncAt || iso > lastSyncAt)) lastSyncAt = iso
    const bucket = row.entityType === 'vehicle' ? vehicleRows : driverRows
    const list = bucket.get(row.entityKey) ?? []
    list.push(row)
    bucket.set(row.entityKey, list)
  }

  const drivers: GrDriverView[] = []
  const alerts: GrAlert[] = []

  for (const [cpf, list] of driverRows) {
    const byProvider = new Map(list.map((r) => [r.provider, r]))
    const angellira = byProvider.get('angellira')
    const brk = byProvider.get('brk')
    const spx = byProvider.get('spx')
    const input = {
      angellira: angellira ? (toRiskInput(angellira) as AngelliraInput) : null,
      brk: brk ? (toRiskInput(brk) as BrkInput) : null,
      spx: spx ? (toRiskInput(spx) as SpxInput) : null,
    }
    const { status: verdict, reasons } = consolidateVerdict(input)
    const displayName = list.find((r) => r.displayName)?.displayName ?? null
    drivers.push({ cpf, displayName, verdict, reasons, providers: list.map(toProviderStatus) })
    alerts.push(...deriveDriverAlerts({ entityId: `driver:${cpf}`, displayName, document: cpf, ...input }))
  }

  const vehicles: GrVehicleView[] = []
  for (const [plate, list] of vehicleRows) {
    const angRow = list.find((r) => r.provider === 'angellira') ?? null
    const angInput = angRow ? (toRiskInput(angRow) as AngelliraInput) : null
    const { status: verdict } = consolidateVerdict({ angellira: angInput })
    const displayName = list.find((r) => r.displayName)?.displayName ?? null
    const plateRole = list.find((r) => r.plateRole)?.plateRole ?? null
    const linkedDriverCpf = list.find((r) => r.linkedDriverCpf)?.linkedDriverCpf ?? null
    vehicles.push({
      plate, plateRole, displayName, linkedDriverCpf, verdict,
      angellira: angRow ? toProviderStatus(angRow) : null,
    })
    alerts.push(...deriveVehicleAlerts({
      entityId: `vehicle:${plate}`, plate, plateRole,
      linkedDriver: linkedDriverCpf ? { name: displayName, cpf: linkedDriverCpf } : null,
      angellira: angInput,
    }))
  }

  return { drivers, vehicles, alerts: sortByUrgency(alerts), lastSyncAt }
}

function countVerdicts(items: { verdict: string }[]): GrVerdictCounts {
  const c: GrVerdictCounts = { total: items.length, ok: 0, atencao: 0, critico: 0, semDado: 0 }
  for (const it of items) {
    if (it.verdict === 'OK') c.ok++
    else if (it.verdict === 'ATENCAO') c.atencao++
    else if (it.verdict === 'CRITICO') c.critico++
    else c.semDado++
  }
  return c
}

export async function getGrOverview(): Promise<GrOverview> {
  const model = await loadGrModel()
  const criticos = model.alerts.filter((a) => a.severity === 'crit').length
  return {
    drivers: countVerdicts(model.drivers),
    vehicles: countVerdicts(model.vehicles),
    alertas: { total: model.alerts.length, criticos, atencao: model.alerts.length - criticos },
    lastSyncAt: model.lastSyncAt,
  }
}

export async function getGrDrivers(): Promise<GrDriverView[]> {
  const model = await loadGrModel()
  return model.drivers
}

export async function getGrVehicles(): Promise<GrVehicleView[]> {
  const model = await loadGrModel()
  return model.vehicles
}

/** Feed de alertas de vigência/estado (motoristas + veículos), ordenado por urgência. */
export async function getGrAlerts(): Promise<GrAlert[]> {
  const model = await loadGrModel()
  return model.alerts
}
