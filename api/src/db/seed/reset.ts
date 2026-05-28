import { sql } from 'drizzle-orm'
import { db } from '../client'

async function reset() {
  await db.execute(sql`TRUNCATE TABLE
    treatments,
    alerts,
    trips,
    driver_documents,
    vehicles,
    drivers,
    routes,
    clients,
    users
    RESTART IDENTITY CASCADE`)
  console.log('[reset] all tables truncated')
  process.exit(0)
}

reset().catch((err) => {
  console.error('[reset] failed:', err)
  process.exit(1)
})
