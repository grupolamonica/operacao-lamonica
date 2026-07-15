/**
 * Sync do GR (Cargas → Torre). Materializa o cache `gr_vigencias` a partir do
 * Supabase de Cargas: uma linha por (entidade × provider). É CACHE (replace a
 * cada run), idempotente. Padrão do cargas.sync (db.delete + db.insert em lote).
 */
import { db } from '../../db/client'
import { grVigencias, type InsertGrVigencia } from '../../db/schema/gr'
import { classifyExpiry } from './gr.risk-status'
import { fetchCargasDriverRisk, fetchCargasVehicleRisk } from './gr.reads'

export interface GrSyncResult {
  drivers: number
  vehicles: number
  rows: number
  ts: string
}

const onlyDigits = (s: string | null | undefined): string => (s ? s.replace(/\D/g, '') : '')
const normPlate = (s: string | null | undefined): string => (s ? s.toUpperCase().replace(/[^A-Z0-9]/g, '') : '')
const toIsoDate = (v: string | null | undefined): string | null => (v ? String(v).slice(0, 10) : null)
const toDate = (v: string | null | undefined): Date | null => (v ? new Date(v) : null)

export async function syncGr(nowMs: number = Date.now()): Promise<GrSyncResult> {
  const [drivers, vehicles] = await Promise.all([fetchCargasDriverRisk(), fetchCargasVehicleRisk()])
  const rows: InsertGrVigencia[] = []

  for (const d of drivers) {
    const cpf = onlyDigits(d.document_number)
    if (!cpf) continue

    if (d.angellira_status || d.angellira_valid_until) {
      const validUntil = toIsoDate(d.angellira_valid_until)
      const { daysUntilExpiry, alertLevel } = classifyExpiry(validUntil, { nowMs })
      rows.push({
        entityType: 'driver', entityKey: cpf, displayName: d.full_name, provider: 'angellira',
        rawStatus: d.angellira_status, statusText: d.angellira_status_text, validUntil, daysUntilExpiry,
        status: alertLevel ?? 'STATE', checkedAt: toDate(d.angellira_checked_at), source: 'cargas',
      })
    }

    if (d.brk_status || d.brk_valid_until || d.brk_conjunto_apto != null) {
      const validUntil = toIsoDate(d.brk_valid_until)
      const { daysUntilExpiry, alertLevel } = classifyExpiry(validUntil, { nowMs })
      rows.push({
        entityType: 'driver', entityKey: cpf, displayName: d.full_name, provider: 'brk',
        rawStatus: d.brk_status, statusText: d.brk_status_text, validUntil, daysUntilExpiry,
        conjuntoApto: d.brk_conjunto_apto ?? null,
        status: alertLevel ?? (d.brk_conjunto_apto === false ? 'STATE' : 'UNKNOWN'),
        checkedAt: toDate(d.brk_checked_at), source: 'cargas',
      })
    }

    if (d.spx_vigency_status) {
      rows.push({
        entityType: 'driver', entityKey: cpf, displayName: d.full_name, provider: 'spx',
        rawStatus: d.spx_vigency_status, statusText: d.spx_vigency_status_text, validUntil: null,
        daysUntilExpiry: null, status: 'STATE', checkedAt: toDate(d.spx_vigency_checked_at), source: 'cargas',
      })
    }
  }

  for (const v of vehicles) {
    const plate = normPlate(v.plate)
    if (!plate) continue
    if (v.angellira_status || v.angellira_valid_until) {
      const validUntil = toIsoDate(v.angellira_valid_until)
      const { daysUntilExpiry, alertLevel } = classifyExpiry(validUntil, { nowMs })
      rows.push({
        entityType: 'vehicle', entityKey: plate, displayName: v.angellira_display_name, plateRole: v.plate_role,
        provider: 'angellira', rawStatus: v.angellira_status, statusText: v.angellira_status_text, validUntil,
        daysUntilExpiry, status: alertLevel ?? 'STATE', linkedDriverCpf: onlyDigits(v.linked_driver_cpf) || null,
        checkedAt: toDate(v.angellira_checked_at), source: 'cargas',
      })
    }
  }

  // Replace o cache inteiro (idempotente).
  await db.delete(grVigencias)
  const B = 500
  for (let i = 0; i < rows.length; i += B) {
    await db.insert(grVigencias).values(rows.slice(i, i + B))
  }

  const driverKeys = new Set(rows.filter((r) => r.entityType === 'driver').map((r) => r.entityKey))
  const vehicleKeys = new Set(rows.filter((r) => r.entityType === 'vehicle').map((r) => r.entityKey))
  return { drivers: driverKeys.size, vehicles: vehicleKeys.size, rows: rows.length, ts: new Date().toISOString() }
}
