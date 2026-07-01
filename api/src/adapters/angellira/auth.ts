/**
 * Auth Angellira — porte TS do fluxo de 3 passos (D-12-30 / D-12-32).
 * Espelha obter_token_automatico() do apiangellirasheets.py:
 *   1) POST /auth            (login → cookies de sessão)
 *   2) POST /auth/grant      (company → JWT)
 *   3) GET  /api/map/83      (Bearer JWT → token de sessão do Maps "/t/<hash>/")
 *
 * Credenciais via env (sem default — fail-closed em produção).
 * Retorna o token do Maps usado para montar as URLs /t/<token>/sub/*.
 */

import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { integrationCredentials } from '../../db/schema/integration-credentials'

const AUTH_BASE = 'https://auth.angellira.com.br'
const MAPS_BASE = 'https://maps.angellira.com.br'

export interface AngelliraSession {
  mapsToken: string
  obtainedAt: number
}

/**
 * Credenciais: tabela `integration_credentials` (service='angellira') PRIMEIRO,
 * env como fallback. Assim a rotação de senha é só um UPDATE no banco — sem
 * mexer em env/secret/deploy. Se o banco estiver fora, cai no env.
 */
async function cfg() {
  let row: { login: string | null; password: string | null; empresa: string | null } | undefined
  try {
    const r = await db
      .select({ login: integrationCredentials.login, password: integrationCredentials.password, empresa: integrationCredentials.empresa })
      .from(integrationCredentials)
      .where(eq(integrationCredentials.service, 'angellira'))
      .limit(1)
    row = r[0]
  } catch { /* tabela ausente / DB off → fallback env */ }

  const user = (row?.login || process.env.ANGELLIRA_USER || '').trim()
  const pass = (row?.password || process.env.ANGELLIRA_PASS || '').trim()
  const empresa = (row?.empresa || process.env.ANGELLIRA_EMPRESA || '').trim()
  if (!user || !pass || !empresa) {
    throw new Error('Angellira: defina a senha em integration_credentials (service=angellira) ou nas envs ANGELLIRA_USER/PASS/EMPRESA')
  }
  return { user, pass, empresa }
}

/** Junta Set-Cookie de uma resposta num header Cookie (name=value; ...). */
function collectCookies(res: Response): string {
  const set = (res.headers as any).getSetCookie?.() as string[] | undefined
  if (!set || set.length === 0) return ''
  return set.map((c) => c.split(';')[0]).join('; ')
}

export async function obterTokenMaps(): Promise<string> {
  const { user, pass, empresa } = await cfg()

  // 1) login → cookies
  const resLogin = await fetch(`${AUTH_BASE}/auth`, {
    method: 'POST',
    headers: { 'Accept': 'application/json, text/plain, */*', 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: user, pass, lang: 'pt-br' }),
    redirect: 'manual',
  })
  if (!resLogin.ok && resLogin.status !== 302) {
    throw new Error(`Angellira login falhou: ${resLogin.status}`)
  }
  const cookies = collectCookies(resLogin)

  // 2) grant → JWT
  const resGrant = await fetch(`${AUTH_BASE}/auth/grant`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': AUTH_BASE,
      'Referer': `${AUTH_BASE}/grant?client=Angellira&scope=&company=${empresa}`,
      ...(cookies ? { 'Cookie': cookies } : {}),
    },
    body: new URLSearchParams({ company: String(empresa), user: '{"userName":"","userId":-1}' }).toString(),
    redirect: 'manual',
  })
  let jwt: string | null = null
  try {
    const j = (await resGrant.clone().json()) as { token?: string }
    jwt = j?.token ?? null
  } catch { /* not json */ }
  if (!jwt) {
    const loc = resGrant.headers.get('location') ?? resGrant.url ?? ''
    if (loc.includes('access_token=')) jwt = loc.split('access_token=')[1].split('&')[0]
    else if (loc.includes('token=')) jwt = loc.split('token=')[1].split('&')[0]
  }
  if (!jwt) throw new Error(`Angellira grant sem JWT (status ${resGrant.status})`)

  // 3) maps token
  const resMaps = await fetch(`${MAPS_BASE}/api/map/83`, {
    headers: { 'Authorization': `Bearer ${jwt}` },
  })
  if (!resMaps.ok) throw new Error(`Angellira map/83 falhou: ${resMaps.status}`)
  const raw = (await resMaps.text()).trim().replace(/"/g, '')
  if (raw.includes('/t/')) {
    const token = raw.split('/t/')[1].split('/')[0]
    if (token) return token
  }
  throw new Error(`Angellira: formato inesperado de map/83: ${raw.slice(0, 80)}`)
}

let cached: AngelliraSession | null = null
const TTL_MS = 20 * 60 * 1000 // 20 min

/** Token cacheado (revalida após TTL ou on-demand via force). */
export async function getMapsToken(force = false): Promise<string> {
  if (!force && cached && Date.now() - cached.obtainedAt < TTL_MS) return cached.mapsToken
  const mapsToken = await obterTokenMaps()
  cached = { mapsToken, obtainedAt: Date.now() }
  return mapsToken
}

export function mapsUrl(token: string, path: string): string {
  return `${MAPS_BASE}/t/${token}/sub/${path}`
}
