import { relations } from 'drizzle-orm'
import { drivers } from './drivers'
import { driverDocuments } from './driver-documents'
import { vehicles } from './vehicles'
import { trips } from './trips'
import { alerts } from './alerts'
import { treatments } from './treatments'
import { clients } from './clients'
import { routes } from './routes'
import { users } from './users'

export const driversRelations = relations(drivers, ({ many }) => ({
  documents: many(driverDocuments),
  vehicles:  many(vehicles),
  trips:     many(trips),
  alerts:    many(alerts),
}))

export const driverDocumentsRelations = relations(driverDocuments, ({ one }) => ({
  driver: one(drivers, { fields: [driverDocuments.driverId], references: [drivers.id] }),
}))

export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  driver: one(drivers, { fields: [vehicles.driverId], references: [drivers.id] }),
  trips:  many(trips),
}))

export const clientsRelations = relations(clients, ({ many }) => ({
  routes: many(routes),
  trips:  many(trips),
}))

export const routesRelations = relations(routes, ({ one, many }) => ({
  client: one(clients, { fields: [routes.clientId], references: [clients.id] }),
  trips:  many(trips),
}))

export const tripsRelations = relations(trips, ({ one, many }) => ({
  driver:  one(drivers,  { fields: [trips.driverId],  references: [drivers.id]  }),
  vehicle: one(vehicles, { fields: [trips.vehicleId], references: [vehicles.id] }),
  client:  one(clients,  { fields: [trips.clientId],  references: [clients.id]  }),
  route:   one(routes,   { fields: [trips.routeId],   references: [routes.id]   }),
  alerts:  many(alerts),
}))

export const alertsRelations = relations(alerts, ({ one, many }) => ({
  trip:        one(trips,    { fields: [alerts.tripId],     references: [trips.id]    }),
  driver:      one(drivers,  { fields: [alerts.driverId],   references: [drivers.id]  }),
  vehicle:     one(vehicles, { fields: [alerts.vehicleId],  references: [vehicles.id] }),
  assignee:    one(users,    { fields: [alerts.assignedTo], references: [users.id]    }),
  treatments:  many(treatments),
}))

export const treatmentsRelations = relations(treatments, ({ one }) => ({
  alert:    one(alerts, { fields: [treatments.alertId],    references: [alerts.id]   }),
  trip:     one(trips,  { fields: [treatments.tripId],     references: [trips.id]    }),
  operator: one(users,  { fields: [treatments.operatorId], references: [users.id]    }),
}))

export const usersRelations = relations(users, ({ many }) => ({
  assignedAlerts: many(alerts),
  treatments:     many(treatments),
}))
