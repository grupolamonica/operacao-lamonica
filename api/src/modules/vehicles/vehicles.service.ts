import { db } from '../../db/client'
import { vehicles } from '../../db/schema/vehicles'

export async function listVehicles() {
  return db.select().from(vehicles)
}
