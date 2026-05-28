import { Elysia, t } from 'elysia'
import { jwt } from '@elysiajs/jwt'

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not defined')
}
if (process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 chars (HS256 — RESEARCH.md Pitfall #1)')
}

export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '24h'

export const jwtPayloadSchema = t.Object({
  sub:  t.String(),
  role: t.Union([t.Literal('admin'), t.Literal('supervisor'), t.Literal('analyst'), t.Literal('viewer')]),
  jti:  t.String(),
})

export const jwtPlugin = new Elysia({ name: 'jwt' })
  .use(jwt({
    name: 'jwt',
    secret: process.env.JWT_SECRET,
    exp: JWT_EXPIRES_IN,
    schema: jwtPayloadSchema,
    // Algorithm defaults to HS256 in @elysiajs/jwt
  }))
