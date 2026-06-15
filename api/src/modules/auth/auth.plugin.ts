import { Elysia, t } from 'elysia'
import { eq } from 'drizzle-orm'
import { jwtPlugin } from '../../lib/jwt'
import { authGuard } from '../../lib/rbac'
import { redis } from '../../redis/client'
import { logger } from '../../lib/logger'
import { db } from '../../db/client'
import { users } from '../../db/schema/users'
import { validateCredentials, blacklistJti } from './auth.service'

const LOGIN_RATE_WINDOW_SEC = 60
const LOGIN_RATE_MAX_ATTEMPTS = 10

const COOKIE_MAX_AGE = 60 * 60 * 24  // 24h

async function isLoginRateLimited(ip: string): Promise<boolean> {
  const key = `ratelimit:login:${ip}`
  const count = await redis.incr(key)
  if (count === 1) {
    await redis.expire(key, LOGIN_RATE_WINDOW_SEC)
  }
  return count > LOGIN_RATE_MAX_ATTEMPTS
}

export const authPlugin = new Elysia({ name: 'auth' })
  .use(jwtPlugin)
  .group('/api/auth', (app) =>
    app
      .post('/login', async ({ jwt, cookie, body, set, request }) => {
        const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown'
        if (await isLoginRateLimited(ip)) {
          set.status = 429
          return { error: 'Too many login attempts. Try again later.' }
        }
        const user = await validateCredentials(body.email, body.password)
        if (!user) {
          set.status = 401
          logger.warn({ email: body.email, ip }, 'login failed')
          return { error: 'Invalid credentials' }
        }
        const jti = crypto.randomUUID()
        const token = await jwt.sign({ sub: user.id, role: user.role as 'admin'|'supervisor'|'analyst'|'viewer', jti })
        cookie.access_token.set({
          value:    token,
          httpOnly: true,
          sameSite: 'strict',
          secure:   process.env.NODE_ENV === 'production',
          path:     '/',
          maxAge:   COOKIE_MAX_AGE,
        })
        logger.info({ userId: user.id, email: user.email }, 'login success')
        return { user: { id: user.id, name: user.name, email: user.email, role: user.role } }
      }, {
        body: t.Object({
          email:    t.String({ format: 'email' }),
          password: t.String({ minLength: 6 }),
        }),
        detail: { tags: ['auth'], summary: 'Login with email + password' },
      })

      .post('/logout', async ({ jwt, cookie, set }) => {
        const token = cookie.access_token?.value as string | undefined
        if (token) {
          const payload = await jwt.verify(token)
          if (payload && payload.jti && payload.exp) {
            await blacklistJti(payload.jti as string, payload.exp as number)
          }
        }
        cookie.access_token.remove()
        set.status = 204
        return ''
      }, {
        detail: { tags: ['auth'], summary: 'Logout — blacklist current token' },
      })

      .use(authGuard)

      .get('/me', async ({ user }) => {
        const [u] = await db
          .select({
            id: users.id, name: users.name, email: users.email, role: users.role,
            // sino de notificações: prefs (inclui seenAt do "marcar como lida")
            notificationPreferences: users.notificationPreferences,
          })
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1)
        return { user: u ?? { id: user.id, role: user.role } }
      }, {
        detail: { tags: ['auth'], summary: 'Current authenticated user' },
      })

      .post('/refresh', async ({ jwt, cookie, user }) => {
        await blacklistJti(user.jti, Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE)
        const newJti = crypto.randomUUID()
        const newToken = await jwt.sign({ sub: user.id, role: user.role, jti: newJti })
        cookie.access_token.set({
          value:    newToken,
          httpOnly: true,
          sameSite: 'strict',
          secure:   process.env.NODE_ENV === 'production',
          path:     '/',
          maxAge:   COOKIE_MAX_AGE,
        })
        return { ok: true }
      }, {
        detail: { tags: ['auth'], summary: 'Issue a fresh token, invalidating the previous one' },
      })
  )
