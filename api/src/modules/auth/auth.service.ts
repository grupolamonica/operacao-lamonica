import bcrypt from 'bcrypt'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { users, type SelectUser } from '../../db/schema/users'
import { redis } from '../../redis/client'

const BCRYPT_COST = 10

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST)
}

// Constant-time defense: always bcrypt.compare even when user not found
const DUMMY_HASH = '$2b$10$abcdefghijklmnopqrstuvOIo2Oh5oP1pP0V8zY5gZ8GlVlZGGGGGG'

export async function validateCredentials(email: string, password: string): Promise<SelectUser | null> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  const hashToCompare = user?.passwordHash ?? DUMMY_HASH
  const ok = await bcrypt.compare(password, hashToCompare)
  if (!user || !user.isActive || !ok) return null
  return user
}

export async function blacklistJti(jti: string, exp: number): Promise<void> {
  const nowSec = Math.floor(Date.now() / 1000)
  const ttl = exp - nowSec
  if (ttl > 0) {
    await redis.set(`session:blacklist:${jti}`, '1', 'EX', ttl)
  }
}

export async function isJtiBlacklisted(jti: string): Promise<boolean> {
  const v = await redis.get(`session:blacklist:${jti}`)
  return v !== null
}
