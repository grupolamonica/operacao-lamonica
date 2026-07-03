/**
 * Aplica um arquivo .sql cru no DATABASE_URL (uso: migrations manuais aditivas).
 *   bun run src/scripts/apply-sql.ts drizzle/phase16-station-geofences.sql
 * Executa o arquivo inteiro (protocolo simples, suporta múltiplas statements + comentários).
 * NUNCA use drizzle-kit push (dropa a coluna PostGIS geom — ver postgis-manual.sql).
 */
import postgres from 'postgres'

const file = process.argv[2]
if (!file) { console.error('uso: bun run src/scripts/apply-sql.ts <arquivo.sql>'); process.exit(1) }
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL ausente'); process.exit(1) }

const sqlText = await Bun.file(file).text()
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false })
try {
  await sql.unsafe(sqlText)
  console.log(`✅ aplicado: ${file}`)
} catch (e) {
  console.error(`❌ falhou: ${(e as Error).message}`)
  process.exitCode = 1
} finally {
  await sql.end()
}
