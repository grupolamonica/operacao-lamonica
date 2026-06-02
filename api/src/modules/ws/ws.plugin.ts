import { Elysia } from 'elysia'
import Redis from 'ioredis'
import { logger } from '../../lib/logger'

if (!process.env.REDIS_URL) throw new Error('REDIS_URL is not defined')

// Separate subscriber connection — ioredis subscriber cannot send commands
const subscriber = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  enableReadyCheck: true,
})

const POSITIONS_CHANNEL = 'positions:update'
const ALERTS_CHANNEL    = 'alerts:new'
const TIMELINE_CHANNEL  = 'timeline:new'

const CHANNEL_TO_TYPE: Record<string, string> = {
  [POSITIONS_CHANNEL]: 'position:update',
  [ALERTS_CHANNEL]:    'alert:new',
  [TIMELINE_CHANNEL]:  'timeline:new',
}

// Connected WebSocket clients
const clients = new Set<{ send: (msg: string) => void; id: string }>()

let subscribed = false

async function ensureSubscribed() {
  if (subscribed) return
  await subscriber.connect().catch(() => {})
  await subscriber.subscribe(POSITIONS_CHANNEL, ALERTS_CHANNEL, TIMELINE_CHANNEL)
  subscriber.on('message', (channel, message) => {
    const eventType = CHANNEL_TO_TYPE[channel] ?? channel
    let parsed: unknown
    try { parsed = JSON.parse(message) } catch { parsed = { raw: message } }
    const dead: Array<{ send: (msg: string) => void; id: string }> = []
    for (const client of clients) {
      try {
        client.send(JSON.stringify({ type: eventType, data: parsed }))
      } catch {
        dead.push(client)
      }
    }
    for (const d of dead) clients.delete(d)
  })
  subscribed = true
  logger.info({ channels: Object.keys(CHANNEL_TO_TYPE) }, 'WS hub subscribed to Redis PubSub')
}

export const wsPlugin = new Elysia({ name: 'ws' })
  .ws('/ws/vehicles', {
    open(ws) {
      const client = { send: (msg: string) => ws.send(msg), id: ws.id }
      clients.add(client)
      logger.debug({ id: ws.id, total: clients.size }, 'WS client connected')
      ws.send(JSON.stringify({ type: 'connected', data: { clientCount: clients.size } }))
      // Lazy-subscribe on first connection
      ensureSubscribed().catch(e => logger.error({ error: e.message }, 'WS subscribe failed'))
    },
    close(ws) {
      for (const c of clients) {
        if (c.id === ws.id) { clients.delete(c); break }
      }
      logger.debug({ id: ws.id, total: clients.size }, 'WS client disconnected')
    },
    message(ws, message) {
      // Ping/pong keepalive
      if (typeof message === 'string' && message === 'ping') {
        ws.send('pong')
      }
    },
  })
