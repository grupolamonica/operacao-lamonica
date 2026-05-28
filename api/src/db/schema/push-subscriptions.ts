import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

/**
 * Web Push subscriptions per user.
 *
 * Persisted client-side endpoint + keys returned by PushManager.subscribe().
 * Backend dispatches notifications via web-push.sendNotification(subscription, payload).
 *
 * Semantics:
 *  - One user → many subscriptions (one per browser/device).
 *  - `endpoint` UNIQUE: prevents duplicate inserts when the same client
 *    re-subscribes (browser returns the same endpoint URL).
 *  - ON DELETE CASCADE: when a user is hard-deleted (rare; we soft-delete
 *    via isActive=false), drop their subscriptions automatically.
 *
 * Threat coverage:
 *  - T-06.01-04 (Tampering / duplicate endpoint) — UNIQUE constraint.
 *
 * @see CONTEXT D-13 (opt-in flow + Claude's discretion on PK/FK/indexes)
 */
export const pushSubscriptions = pgTable('push_subscriptions', {
  id:        uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint:  text('endpoint').notNull().unique(),
  p256dh:    text('p256dh').notNull(),
  auth:      text('auth').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdIdx: index('idx_push_subscriptions_user_id').on(t.userId),
}))

export type SelectPushSubscription = typeof pushSubscriptions.$inferSelect
export type InsertPushSubscription = typeof pushSubscriptions.$inferInsert
