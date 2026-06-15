import { Elysia, t } from 'elysia'
import { authGuard, requireRole } from '../../lib/rbac'
import {
  createUser,
  deactivateUser,
  getUserById,
  listUsers,
  markMyNotificationsSeen,
  updateMyNotificationPreferences,
  updateUser,
} from './users.service'

/**
 * Users plugin — Phase 6, plan 06-03.
 *
 * Endpoints:
 *   PATCH /api/users/me/notification-preferences  (any authenticated user)
 *   GET    /api/users                              (admin only — list)
 *   GET    /api/users/:id                          (admin only — get one)
 *   POST   /api/users                              (admin only — create)
 *   PATCH  /api/users/:id                          (admin only — role/isActive/prefs)
 *   DELETE /api/users/:id                          (admin only — SOFT delete via deactivate)
 *
 * SECURITY:
 *   - `passwordHash` never leaves the service projection — defense in depth.
 *   - Self-update endpoint derives `user.id` from JWT cookie via authGuard;
 *     the request body cannot impersonate another user.
 *   - Duplicate email returns HTTP 409 with a generic error (no internal
 *     details leaked).
 */
const roleSchema = t.Union([
  t.Literal('admin'),
  t.Literal('supervisor'),
  t.Literal('analyst'),
  t.Literal('viewer'),
])

const notificationPrefsSchema = t.Object({
  critico: t.Optional(t.Boolean()),
  medio:   t.Optional(t.Boolean()),
  baixo:   t.Optional(t.Boolean()),
})

// Self-update endpoint: any authenticated user updates their own prefs.
// Lives outside the admin scope so non-admin roles can reach it.
const selfPlugin = new Elysia({ name: 'users-self' })
  .use(authGuard)
  .patch(
    '/api/users/me/notification-preferences',
    async ({ body, user, set }) => {
      const updated = await updateMyNotificationPreferences(user.id, body)
      if (!updated) {
        set.status = 404
        return { error: 'User not found' }
      }
      return updated
    },
    {
      body: notificationPrefsSchema,
      detail: {
        tags: ['users'],
        summary: 'Update my notification preferences (any role)',
      },
    },
  )
  // "Marcar todas como lidas" do sino — carimba seenAt=agora (sem corpo).
  .post(
    '/api/users/me/notifications-seen',
    async ({ user, set }) => {
      const updated = await markMyNotificationsSeen(user.id)
      if (!updated) {
        set.status = 404
        return { error: 'User not found' }
      }
      return updated
    },
    {
      detail: {
        tags: ['users'],
        summary: 'Mark all notifications as read (stamp seenAt=now, any role)',
      },
    },
  )

// Admin CRUD endpoints. requireRole('admin') chains authGuard internally
// and returns 403 to non-admin callers.
const adminPlugin = new Elysia({ name: 'users-admin' })
  .use(requireRole('admin'))
  .group('/api/users', (app) =>
    app
      .get('/', () => listUsers(), {
        detail: { tags: ['users'], summary: 'List all users (admin)' },
      })

      .get(
        '/:id',
        async ({ params, set }) => {
          const u = await getUserById(params.id)
          if (!u) {
            set.status = 404
            return { error: 'User not found' }
          }
          return u
        },
        {
          params: t.Object({ id: t.String({ format: 'uuid' }) }),
          detail: { tags: ['users'], summary: 'Get user by id (admin)' },
        },
      )

      .post(
        '/',
        async ({ body, set }) => {
          try {
            return await createUser(body)
          } catch (e: any) {
            // postgres-js exposes unique-violation as code '23505'.
            if (e?.code === '23505') {
              set.status = 409
              return { error: 'Email already exists' }
            }
            throw e
          }
        },
        {
          body: t.Object({
            name:     t.String({ minLength: 1, maxLength: 100 }),
            email:    t.String({ format: 'email', maxLength: 150 }),
            role:     roleSchema,
            password: t.String({ minLength: 6, maxLength: 200 }),
          }),
          detail: { tags: ['users'], summary: 'Create user (admin)' },
        },
      )

      .patch(
        '/:id',
        async ({ params, body, set }) => {
          const r = await updateUser(params.id, body)
          if (!r) {
            set.status = 404
            return { error: 'User not found' }
          }
          return r
        },
        {
          params: t.Object({ id: t.String({ format: 'uuid' }) }),
          body: t.Object({
            role:     t.Optional(roleSchema),
            isActive: t.Optional(t.Boolean()),
            notificationPreferences: t.Optional(notificationPrefsSchema),
          }),
          detail: { tags: ['users'], summary: 'Update user (admin)' },
        },
      )

      .delete(
        '/:id',
        async ({ params, set }) => {
          // SOFT DELETE per CONTEXT D-18 — never hard-delete user rows so
          // assigned alerts / treatments preserve their FK chain.
          const r = await deactivateUser(params.id)
          if (!r) {
            set.status = 404
            return { error: 'User not found' }
          }
          set.status = 204
          return ''
        },
        {
          params: t.Object({ id: t.String({ format: 'uuid' }) }),
          detail: {
            tags: ['users'],
            summary: 'Soft-delete user — sets isActive=false (admin)',
          },
        },
      ),
  )

export const usersPlugin = new Elysia({ name: 'users' })
  .use(selfPlugin)
  .use(adminPlugin)
