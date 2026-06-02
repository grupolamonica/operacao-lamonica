import bcrypt from 'bcrypt'
import { db } from '../client'
import {
  users, clients, routes, drivers, driverDocuments, vehicles, trips, alerts,
} from '../schema'
import { tripEvents } from '../schema/trip-events'
import { alertThresholds } from '../schema/alert-thresholds'

const FIRST_NAMES = ['Carlos', 'Lucas', 'Pedro', 'Rafael', 'Tiago', 'Marcos', 'Felipe',
  'Gustavo', 'André', 'Bruno', 'Diego', 'Eduardo', 'Fabio', 'Henrique', 'Igor',
  'João', 'Leonardo', 'Mateus', 'Nicolas', 'Otávio', 'Paulo', 'Rodrigo', 'Sergio']
const LAST_NAMES = ['Souza', 'Silva', 'Oliveira', 'Pereira', 'Santos', 'Lima',
  'Costa', 'Almeida', 'Ferreira', 'Rodrigues', 'Gomes', 'Martins', 'Carvalho',
  'Barbosa', 'Ribeiro', 'Cardoso', 'Nascimento', 'Araújo', 'Castro']
const BASES = ['CD São Paulo', 'CD Guarulhos', 'CD Campinas', 'CD Osasco', 'CD ABC',
  'CD Rio de Janeiro', 'CD Belo Horizonte']
const VEHICLE_TYPES = ['Van', 'Furgão', 'VUC']
const SP_REGIONS = ['Zona Leste — SP', 'Zona Norte — SP', 'Zona Sul — SP', 'Zona Oeste — SP',
  'Centro — SP', 'Guarulhos — SP', 'Campinas — SP', 'Osasco — SP', 'Santo André — SP']

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]! }
function int(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min }
function randomPlate(): string {
  const letters = () => String.fromCharCode(65 + int(0, 25)) + String.fromCharCode(65 + int(0, 25)) + String.fromCharCode(65 + int(0, 25))
  if (Math.random() > 0.5) {
    return `${letters()}-${int(0, 9)}${String.fromCharCode(65 + int(0, 25))}${int(10, 99)}`
  }
  return `${letters()}-${int(1000, 9999)}`
}
function brName(): string { return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}` }
function brPhone(): string { return `(11) 9${int(8000, 9999)}-${int(1000, 9999)}` }

async function seed() {
  if (process.env.NODE_ENV === 'production' && process.env.FORCE_SEED !== '1') {
    console.error('[seed] BLOCKED: NODE_ENV=production. Set FORCE_SEED=1 to override.')
    process.exit(1)
  }

  console.log('[seed] starting')

  const passwordHash = await bcrypt.hash('senha123', 10)
  const insertedUsers = await db.insert(users).values([
    { name: 'Admin Torre',    email: 'admin@torre.fic',      passwordHash, role: 'admin' },
    { name: 'Supervisor SP',  email: 'supervisor@torre.fic', passwordHash, role: 'supervisor' },
    { name: 'Analista Ops',   email: 'analista@torre.fic',   passwordHash, role: 'analyst' },
    { name: 'Viewer Gestor',  email: 'viewer@torre.fic',     passwordHash, role: 'viewer' },
  ]).returning()
  console.log(`[seed] users: ${insertedUsers.length}`)

  const insertedClients = await db.insert(clients).values([
    { name: 'Shopee',         code: 'SHP' },
    { name: 'Magazine Luiza', code: 'MAG' },
    { name: 'Mercado Livre',  code: 'MLA' },
    { name: 'Americanas',     code: 'AME' },
    { name: 'Casas Bahia',    code: 'CBS' },
  ]).returning()
  console.log(`[seed] clients: ${insertedClients.length}`)

  const routeRows = []
  for (let i = 0; i < 10; i++) {
    const client = insertedClients[i % insertedClients.length]!
    routeRows.push({
      code: `ROTA-SP-${String(i + 1).padStart(3, '0')}`,
      name: `Rota ${pick(SP_REGIONS)} #${i + 1}`,
      clientId: client.id,
      region: pick(['SP', 'MG', 'RJ']),
    })
  }
  const insertedRoutes = await db.insert(routes).values(routeRows).returning()
  console.log(`[seed] routes: ${insertedRoutes.length}`)

  const driverStatuses: Array<'on_route' | 'available' | 'unavailable'> =
    [...Array(12).fill('on_route'), ...Array(6).fill('available'), ...Array(4).fill('unavailable')]
  const driverRows = driverStatuses.map((status, i) => ({
    code:             `MTR-${7800 + i}`,
    name:             brName(),
    phone:            brPhone(),
    email:            `driver${i}@torre.fic`,
    photoUrl:         null,
    status,
    operationalScore: int(70, 99),
    base:             pick(BASES),
    deliveriesToday:  status === 'on_route' ? int(3, 14) : 0,
    avgDelayMinutes:  int(-10, 25),
    lat:              String(-23.5505 + (Math.random() - 0.5) * 0.4),
    lng:              String(-46.6333 + (Math.random() - 0.5) * 0.4),
    address:          `Av. ${pick(['Paulista', 'Faria Lima', 'Brigadeiro', 'Rebouças'])}, ${int(100, 3000)} — São Paulo/SP`,
  }))
  const insertedDrivers = await db.insert(drivers).values(driverRows).returning()
  console.log(`[seed] drivers: ${insertedDrivers.length}`)

  const docRows = []
  for (const drv of insertedDrivers) {
    const today = new Date()
    docRows.push(
      { driverId: drv.id, type: 'CNH',                   status: 'valido' as const,         expiresAt: new Date(today.getFullYear() + 1, today.getMonth(), today.getDate()).toISOString().split('T')[0]! },
      { driverId: drv.id, type: 'Exame Toxicológico',    status: 'valido' as const,         expiresAt: new Date(today.getFullYear(), today.getMonth() + 8, today.getDate()).toISOString().split('T')[0]! },
      { driverId: drv.id, type: 'Treinamento Defensivo', status: (int(0, 3) === 0 ? 'vence_em_breve' : 'valido') as 'vence_em_breve' | 'valido', expiresAt: new Date(today.getFullYear(), today.getMonth() + 1, today.getDate()).toISOString().split('T')[0]! },
    )
  }
  await db.insert(driverDocuments).values(docRows)
  console.log(`[seed] driver_documents: ${docRows.length}`)

  const vehicleRows = insertedDrivers.map((drv, i) => ({
    plate:       randomPlate(),
    type:        pick(VEHICLE_TYPES),
    model:       `Modelo ${pick(['Sprinter', 'Master', 'Daily', 'Iveco', 'Boxer'])} ${int(2018, 2024)}`,
    driverId:    drv.id,
    gpsDeviceId: `GPS-${String(i).padStart(4, '0')}`,
  }))
  const insertedVehicles = await db.insert(vehicles).values(vehicleRows).returning()
  console.log(`[seed] vehicles: ${insertedVehicles.length}`)

  type Combo = { status: 'planned'|'in_progress'|'completed'|'delayed'|'cancelled'; slaStatus: 'no_prazo'|'em_risco'|'atrasado'|'sem_sinal'|null }
  const combos: Combo[] = [
    ...Array(12).fill({ status: 'in_progress', slaStatus: 'no_prazo' } as Combo),
    ...Array(4).fill({ status:  'in_progress', slaStatus: 'em_risco' } as Combo),
    ...Array(1).fill({ status:  'in_progress', slaStatus: 'atrasado' } as Combo),
    ...Array(1).fill({ status:  'in_progress', slaStatus: 'sem_sinal' } as Combo),
    ...Array(12).fill({ status: 'planned',    slaStatus: null } as Combo),
    ...Array(24).fill({ status: 'completed',  slaStatus: 'no_prazo' } as Combo),
    ...Array(6).fill({ status:  'delayed',    slaStatus: 'atrasado' } as Combo),
  ]
  const tripRows = combos.map((combo, i) => {
    const driver  = pick(insertedDrivers)
    const vehicle = pick(insertedVehicles)
    const client  = pick(insertedClients)
    const route   = pick(insertedRoutes)
    const now = new Date()
    const windowStart = new Date(now.getTime() - int(0, 6) * 3600_000)
    const windowEnd   = new Date(windowStart.getTime() + int(2, 8) * 3600_000)
    const eta         = new Date(windowEnd.getTime() + (combo.slaStatus === 'atrasado' ? int(15, 60) : -int(0, 30)) * 60_000)
    return {
      code:          `TRP-${String(9000 + i).padStart(5, '0')}`,
      driverId:      driver.id,
      vehicleId:     vehicle.id,
      clientId:      client.id,
      routeId:       route.id,
      priority:      pick(['alta', 'media', 'baixa'] as const),
      origin:        `CD ${pick(['São Paulo', 'Guarulhos', 'Campinas'])}`,
      destination:   pick(SP_REGIONS),
      originLat:     '-23.5505',
      originLng:     '-46.6333',
      destLat:       String(-23.55 + (Math.random() - 0.5) * 0.3),
      destLng:       String(-46.63 + (Math.random() - 0.5) * 0.3),
      windowStart,
      windowEnd,
      eta,
      status:        combo.status,
      slaStatus:     combo.slaStatus,
      progressPct:   combo.status === 'completed' ? 100 : combo.status === 'planned' ? 0 : int(20, 90),
      distanceTotal: String(int(15, 80)),
      distanceDone:  String(combo.status === 'completed' ? int(15, 80) : int(0, 50)),
      departedAt:    combo.status === 'planned' ? null : windowStart,
      arrivedAt:     combo.status === 'completed' ? windowEnd : null,
    }
  })
  const insertedTrips = await db.insert(trips).values(tripRows).returning()
  console.log(`[seed] trips: ${insertedTrips.length}`)

  const alertTypes = ['atraso_critico', 'desvio_nao_autorizado', 'parada_nao_planejada',
    'sinal_gps_intermitente', 'tempo_parada_elevado', 'entrega_fora_janela', 'checklist_incompleto'] as const
  const severityPlan: Array<'critico'|'medio'|'baixo'> = [
    ...Array(6).fill('critico'), ...Array(8).fill('medio'), ...Array(4).fill('baixo'),
  ] as Array<'critico'|'medio'|'baixo'>
  const inProgressTrips = insertedTrips.filter(t => t.status === 'in_progress' || t.status === 'delayed')
  const alertRows = severityPlan.map((severity, i) => {
    const trip    = pick(inProgressTrips)
    const driver  = insertedDrivers.find(d => d.id === trip.driverId)!
    const vehicle = insertedVehicles.find(v => v.id === trip.vehicleId)!
    const type    = alertTypes[i % alertTypes.length]!
    return {
      type,
      severity,
      status:       (i % 4 === 0 ? 'resolvido' : (i % 3 === 0 ? 'em_tratativa' : 'aberto')) as 'resolvido'|'em_tratativa'|'aberto',
      tripId:       trip.id,
      driverId:     driver.id,
      vehicleId:    vehicle.id,
      title:        `${type.replaceAll('_', ' ')} — ${trip.code}`,
      description:  `Detectado em ${pick(SP_REGIONS)}`,
      source:       pick(['GPS', 'Telemetria', 'Checklist'] as const),
      lat:          '-23.5505',
      lng:          '-46.6333',
      delayMinutes: severity === 'critico' ? int(45, 120) : int(5, 30),
      occurredAt:   new Date(Date.now() - int(0, 6) * 3600_000),
      slaDeadline:  new Date(Date.now() + int(1, 4) * 3600_000),
    }
  })
  await db.insert(alerts).values(alertRows)
  console.log(`[seed] alerts: ${alertRows.length}`)

  // Seed realistic trip_events per in-progress trip — 3-6 events forming a
  // coherent timeline (load → depart → in_route → stops → arrival).
  type EvtType =
    | 'load_started' | 'load_finished' | 'departed' | 'in_route'
    | 'stopped' | 'resumed' | 'arrived_client' | 'unload_started' | 'unload_finished'
  const eventTemplates: Array<{ type: EvtType; offsetMin: number; note?: string }> = [
    { type: 'load_started',    offsetMin: -360, note: 'CD origem'                          },
    { type: 'load_finished',   offsetMin: -300                                              },
    { type: 'departed',        offsetMin: -290, note: 'Saída da origem'                    },
    { type: 'in_route',        offsetMin: -270                                              },
    { type: 'stopped',         offsetMin: -180, note: 'Posto de combustível'               },
    { type: 'resumed',         offsetMin: -160                                              },
    { type: 'arrived_client',  offsetMin: -45,  note: 'Chegada no cliente'                 },
    { type: 'unload_started',  offsetMin: -30                                               },
    { type: 'unload_finished', offsetMin: -10                                               },
  ]
  const evtRows: Array<typeof tripEvents.$inferInsert> = []
  for (const t of insertedTrips) {
    const baseTime = t.departedAt?.getTime() ?? Date.now()
    // pick the prefix of template that matches trip status
    const stopIdx =
      t.status === 'completed'     ? eventTemplates.length :
      t.status === 'in_progress'   ? int(4, 6)             :
      t.status === 'delayed'       ? int(3, 5)             :
      t.status === 'planned'       ? 0                     :
      eventTemplates.length
    for (let i = 0; i < stopIdx; i++) {
      const tpl = eventTemplates[i]!
      evtRows.push({
        tripId:     t.id,
        eventType:  tpl.type,
        occurredAt: new Date(baseTime + tpl.offsetMin * 60_000),
        notes:      tpl.note,
        lat:        t.originLat ?? null,
        lng:        t.originLng ?? null,
      })
    }
  }
  if (evtRows.length > 0) {
    await db.insert(tripEvents).values(evtRows)
  }
  console.log(`[seed] trip_events: ${evtRows.length}`)

  // Phase 6 / CONTEXT D-19: seed default alert engine thresholds.
  // Idempotent via onConflictDoNothing — re-running seed never clobbers
  // values that an admin may have edited via the Configurações UI.
  await db.insert(alertThresholds).values([
    { type: 'atraso_critico_minutes', value: 30 },
    { type: 'desvio_km_threshold',    value: 2  },
    { type: 'stop_duration_minutes',  value: 15 },
  ]).onConflictDoNothing()
  console.log('[seed] alert_thresholds: 3 defaults')

  console.log('[seed] complete')
  process.exit(0)
}

seed().catch((err) => {
  console.error('[seed] failed:', err)
  process.exit(1)
})
