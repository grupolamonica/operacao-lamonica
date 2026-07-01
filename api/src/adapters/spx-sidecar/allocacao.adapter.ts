/**
 * Adapter de ALOCAÇÃO — chama o sidecar Python (spx-bot) que fala com o SPX.
 *
 * O sidecar (porta 8766, env SPX_SIDECAR_URL) já tem a lógica do fluxo:
 *   GET  /spx/drivers/assignable  → motoristas atribuíveis (driver_id + nome)
 *   POST /spx/trips/alocar        → accept (opcional) + assign_multiple_driver
 *
 * Aqui só fazemos HTTP (fetch nativo do Bun), sem libs novas. A escrita real
 * (dry_run=false) é decidida pelo plugin; este adapter só repassa.
 *
 * driver_id do dropdown = mesmo nº do [id]NOME da API do ASP (Jira DC-138).
 */

function sidecarBase(): string {
  const v = process.env.SPX_SIDECAR_URL
  const base = v && v.trim() ? v.replace(/\/+$/, '') : ''
  if (!base) throw new Error('SPX_SIDECAR_URL não definido — aponte para o sidecar spx-bot (ex.: http://localhost:8766)')
  return base
}

/** agency_id do driverservice p/ o dropdown (ex.: 1297). NÃO é o agency_id básico (297). */
function dropdownAgencyId(): number {
  return Number(process.env.SPX_DROPDOWN_AGENCY_ID || 1297)
}

export interface AssignableDriver {
  driver_id: number
  profile_id: number
  name: string
  station_id?: number
  vehicle_type?: number
  license_type?: number
  status?: number
}

export async function getAssignableDrivers(opts: { agencyId?: number; count?: number } = {}): Promise<{
  total: number
  agency_id: number
  drivers: AssignableDriver[]
}> {
  const base = sidecarBase()
  const aid = opts.agencyId || dropdownAgencyId()
  const count = opts.count ?? 200
  const url = `${base}/spx/drivers/assignable?agency_id=${aid}&count=${count}`
  const r = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!r.ok) throw new Error(`sidecar /spx/drivers/assignable ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const j = (await r.json()) as { drivers?: AssignableDriver[]; total?: number; agency_id?: number }
  return { total: j.total ?? (j.drivers?.length ?? 0), agency_id: j.agency_id ?? aid, drivers: j.drivers ?? [] }
}

export interface AssignableTrip {
  trip_id: number
  trip_number: string
  origem: string | null
  destino: string | null
  vehicle_type: string
  std: number | null
}

export async function getAssignableTrips(opts: { stationId?: number } = {}): Promise<{
  total: number
  trips: AssignableTrip[]
}> {
  const base = sidecarBase()
  const sid = opts.stationId ?? 0
  const url = `${base}/spx/trips/assignable?station_id=${sid}`
  const r = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  if (!r.ok) throw new Error(`sidecar /spx/trips/assignable ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const j = (await r.json()) as { trips?: AssignableTrip[]; total?: number }
  return { total: j.total ?? (j.trips?.length ?? 0), trips: j.trips ?? [] }
}

export interface AllocateInput {
  tripId: number
  driverIds: number[]
  vehiclePlates?: string[]
  stationId?: number
  aceitar?: boolean
  dryRun: boolean
}

export async function allocateTrip(inp: AllocateInput): Promise<any> {
  const base = sidecarBase()
  const r = await fetch(`${base}/spx/trips/alocar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      trip_id: inp.tripId,
      driver_ids: inp.driverIds,
      vehicle_plates: inp.vehiclePlates ?? [],
      station_id: inp.stationId ?? 0,
      aceitar: !!inp.aceitar,
      dry_run: inp.dryRun,
    }),
    signal: AbortSignal.timeout(120_000),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((j as any)?.detail || `sidecar /spx/trips/alocar ${r.status}`)
  return j
}
