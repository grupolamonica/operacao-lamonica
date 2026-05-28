import { Elysia } from 'elysia'
import { jwtPlugin } from './jwt'
import { redis } from '../redis/client'

export type AuthUser = { id: string; role: 'admin' | 'supervisor' | 'analyst' | 'viewer'; jti: string }

export const authGuard = new Elysia({ name: 'auth-guard' })
  .use(jwtPlugin)
  .derive({ as: 'scoped' }, async ({ jwt, cookie, set }) => {
    const token = cookie.access_token?.value as string | undefined
    if (!token) {
      set.status = 401
      throw new Error('Unauthorized: no session cookie')
    }
    const payload = await jwt.verify(token)
    if (!payload) {
      set.status = 401
      throw new Error('Unauthorized: invalid token')
    }
    const blacklisted = await redis.get(`session:blacklist:${payload.jti}`)
    if (blacklisted) {
      set.status = 401
      throw new Error('Unauthorized: token revoked')
    }
    return {
      user: {
        id:   payload.sub as string,
        role: payload.role as AuthUser['role'],
        jti:  payload.jti as string,
      } satisfies AuthUser,
    }
  })

export function requireRole(...roles: AuthUser['role'][]) {
  return new Elysia({ name: `require-role-${roles.join('-')}` })
    .use(authGuard)
    .onBeforeHandle(({ user, set }) => {
      if (!roles.includes(user.role)) {
        set.status = 403
        throw new Error(`Forbidden: requires role ${roles.join('|')}`)
      }
    })
}
