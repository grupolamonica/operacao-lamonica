import Redis from 'ioredis'

if (!process.env.REDIS_URL) {
  throw new Error('REDIS_URL is not defined')
}

export const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
  enableReadyCheck: true,
})

redis.on('error', (err) => {
  console.error('[redis] error:', err.message)
})

export type RedisClient = typeof redis
