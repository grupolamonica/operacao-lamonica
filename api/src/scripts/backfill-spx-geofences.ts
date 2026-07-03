/**
 * Backfill das docas SPX (carregamento/descarga) → geofences de estação.
 *
 * Varre as rotas SPX da janela (default 45d atrás / 15d à frente), coleta as
 * estações distintas (origem+destino) e busca o geofence de cada uma via
 * check_info_log. Mesma lógica do job diário `spx-geofences`.
 *
 * Uso (a partir de api/, com .env carregado pelo bun):
 *   bun run src/scripts/backfill-spx-geofences.ts                 # DRY-RUN (não grava)
 *   bun run src/scripts/backfill-spx-geofences.ts --apply         # grava no banco (upsert)
 *   bun run src/scripts/backfill-spx-geofences.ts --days-back=90  # janela maior
 *
 * DRY-RUN só LÊ o SPX — não abre conexão com o Postgres.
 */
import { collectStationGeofences, syncSpxGeofences } from '../adapters/spx-portal/spx-geofences.adapter'

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.split('=')[1] : undefined
}

const apply = process.argv.includes('--apply')
const daysBack = Number(arg('days-back')) || 45
const daysFwd = Number(arg('days-fwd')) || 15
const station = arg('station')

async function main() {
  console.log(`[backfill-spx-geofences] modo=${apply ? 'APPLY (grava)' : 'DRY-RUN (só leitura)'} janela=${daysBack}d/${daysFwd}d station=${station || 'default'}`)

  if (apply) {
    const r = await syncSpxGeofences({ daysBack, daysFwd, station })
    console.log(`\n✅ estações=${r.stations} | upserted=${r.upserted} | skipped=${r.skipped} | errors=${r.errors}`)
    process.exit(0)
  }

  const r = await collectStationGeofences({ daysBack, daysFwd, station })
  console.log(`\n📍 estações distintas=${r.stations} | com geofence=${r.geofences.length} | sem geofence=${r.skipped.length} | erros=${r.errors.length}\n`)

  const sample = [...r.geofences].sort((a, b) => a.stationId - b.stationId).slice(0, 30)
  console.log('station_id | raio(m) |     lat,lng      | nome')
  for (const g of sample) {
    console.log(`${String(g.stationId).padStart(8)} | ${String(g.radius).padStart(6)} | ${g.lat.toFixed(5)},${g.lng.toFixed(5)} | ${g.name}`)
  }
  if (r.geofences.length > sample.length) console.log(`... +${r.geofences.length - sample.length} estações`)

  if (r.skipped.length) console.log(`\n⚠️ sem geofence (${r.skipped.length}):`, r.skipped.slice(0, 10).map((s) => `${s.stationId}(${s.reason})`).join(', '))
  if (r.errors.length) console.log(`\n❌ erros (${r.errors.length}):`, r.errors.slice(0, 10).map((e) => `${e.stationId}:${e.error}`).join(', '))
  process.exit(0)
}

main().catch((e) => {
  console.error('[backfill-spx-geofences] falhou:', e)
  process.exit(1)
})
