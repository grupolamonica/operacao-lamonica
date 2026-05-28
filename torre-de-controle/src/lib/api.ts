import { treaty } from '@elysiajs/eden'
import type { App } from '@/types/api'

// ts-ignore: Elysia type version mismatch in monorepo (separate node_modules) — runtime works correctly
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
export const api = treaty<App>(
  import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
  { fetch: { credentials: 'include' } },
)
