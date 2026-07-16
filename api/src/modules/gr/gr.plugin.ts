/**
 * GR (Gerenciamento de Risco) HTTP plugin — endpoints atrás do authGuard.
 *   GET  /api/gr/overview  → KPIs (veredito + alertas + última sync)
 *   GET  /api/gr/drivers   → motoristas + veredito consolidado
 *   GET  /api/gr/vehicles  → veículos + vigência Angellira por placa
 *   GET  /api/gr/alerts    → feed de alertas (vencimento/estado) por urgência
 *   POST /api/gr/sync      → materializa gr_vigencias do Cargas (admin|supervisor)
 *   GET    /api/gr/vault          → cofre: lista mascarada (admin|supervisor|analyst)
 *   PUT    /api/gr/vault          → cofre: upsert cifrado (admin|supervisor|analyst)
 *   POST   /api/gr/vault/reveal   → cofre: decifra 1 placa + audita (admin|supervisor|analyst)
 *   DELETE /api/gr/vault/:plate   → cofre: remove + audita (admin|supervisor)
 *
 * Módulo 'gr' (NÃO 'risk' — modules/risk é risco de ENTREGA). O dado de risco
 * cadastral vem do Cargas via gr.reads/gr.sync. Registrar ANTES do wsPlugin.
 */
import { Elysia, t } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { getGrOverview, getGrDrivers, getGrVehicles, getGrAlerts } from './gr.service'
import { syncGr } from './gr.sync'
import { getSpxOverview, getSpxRows } from './gr.spx.service'
import { upsertRowOverride, deleteRowOverride } from './gr.override'
import {
  listVaultCredentials,
  upsertVaultCredential,
  revealVaultCredential,
  deleteVaultCredential,
  normalizePlate,
} from './gr.vault'

// Cofre operado pelos operadores do GR (analistas) + supervisão + admin: ver,
// preencher/editar e revelar — toda revelação vai pra trilha de auditoria
// (gr_vault_events). Excluir é destrutivo → restrito a supervisão + admin.
const CAN_VAULT = new Set(['admin', 'supervisor', 'analyst'])
const CAN_VAULT_DELETE = new Set(['admin', 'supervisor'])

const vaultUpsertSchema = t.Object({
  plate: t.String(),
  provider: t.Optional(t.String()),
  login: t.Optional(t.String()),
  username: t.Optional(t.String()),
  senha: t.Optional(t.String()),
  rastreadorId: t.Optional(t.String()),
  embarcador: t.Optional(t.String()),
  notes: t.Optional(t.String()),
})

export const grPlugin = new Elysia({ name: 'gr' })
  .use(authGuard)
  .group('/api/gr', (app) =>
    app
      .get('/overview', () => getGrOverview(), {
        detail: { tags: ['gr'], summary: 'KPIs de risco: veredito (motorista/veículo) + alertas + última sync' },
      })
      .get('/drivers', () => getGrDrivers(), {
        detail: { tags: ['gr'], summary: 'Motoristas + veredito consolidado (Angellira/BRK/SPX) + status por provider' },
      })
      .get('/vehicles', () => getGrVehicles(), {
        detail: { tags: ['gr'], summary: 'Veículos + vigência Angellira por placa' },
      })
      .get('/alerts', () => getGrAlerts(), {
        detail: { tags: ['gr'], summary: 'Feed de alertas de vigência/estado (motoristas + veículos), ordenado por urgência' },
      })
      // ── SPX / Shopee: matriz de operação por viagem (dados no nosso banco) ──
      .get('/spx/overview', ({ query }) => getSpxOverview(query.source ?? 'shopee'), {
        query: t.Object({ source: t.Optional(t.Union([t.Literal('shopee'), t.Literal('nestle')])) }),
        detail: { tags: ['gr'], summary: 'SPX: KPIs da operação (escalados hoje/amanhã, frotas conformes, sem sinal, não conforme)' },
      })
      .get('/spx/rows', ({ query }) => getSpxRows(query.scope ?? 'today', query.source ?? 'shopee'), {
        query: t.Object({
          scope: t.Optional(t.Union([t.Literal('today'), t.Literal('tomorrow')])),
          source: t.Optional(t.Union([t.Literal('shopee'), t.Literal('nestle')])),
        }),
        detail: { tags: ['gr'], summary: 'SPX: matriz de operação por viagem (escala + perfil 3D + checklist + espelhamento AL + sinal); default hoje/shopee' },
      })
      .post(
        '/sync',
        async ({ user, set }) => {
          if (user.role !== 'admin' && user.role !== 'supervisor') {
            set.status = 403
            return { error: 'Forbidden: requires admin|supervisor' }
          }
          return syncGr()
        },
        {
          detail: {
            tags: ['gr'],
            summary: 'Sync manual: materializa gr_vigencias a partir do Cargas (driver_profiles + vehicles)',
          },
        },
      )
      // ── Override manual + Observação (col AA do PainelGR; auditado) ──────────
      .put(
        '/spx/override',
        async ({ user, body, set }) => {
          if (!CAN_VAULT.has(user.role)) {
            set.status = 403
            return { error: 'Forbidden: requires admin|supervisor|analyst' }
          }
          if (!String(body.lh ?? '').trim()) {
            set.status = 422
            return { error: 'lh obrigatório.' }
          }
          return upsertRowOverride(body, user.id)
        },
        {
          body: t.Object({
            lh: t.String(),
            liberado: t.Optional(t.Boolean()),
            observacao: t.Optional(t.String()),
          }),
          detail: { tags: ['gr'], summary: 'SPX: anotar/liberar com ressalva uma viagem (override auditado em gr_override_events)' },
        },
      )
      .delete(
        '/spx/override/:lh',
        async ({ user, params, set }) => {
          if (!CAN_VAULT.has(user.role)) {
            set.status = 403
            return { error: 'Forbidden: requires admin|supervisor|analyst' }
          }
          const removed = await deleteRowOverride(params.lh, user.id)
          if (!removed) {
            set.status = 404
            return { error: 'Override não encontrado para essa viagem.' }
          }
          return { ok: true }
        },
        { detail: { tags: ['gr'], summary: 'SPX: remove o override de uma viagem (auditado)' } },
      )
      // ── Cofre de credenciais do rastreador (senha CIFRADA; ver gr.vault.ts) ──
      .get(
        '/vault',
        ({ user, set }) => {
          if (!CAN_VAULT.has(user.role)) {
            set.status = 403
            return { error: 'Forbidden: requires admin|supervisor|analyst' }
          }
          return listVaultCredentials()
        },
        { detail: { tags: ['gr'], summary: 'Cofre: credenciais do rastreador por placa (lista MASCARADA, sem senha)' } },
      )
      .put(
        '/vault',
        async ({ user, body, set }) => {
          if (!CAN_VAULT.has(user.role)) {
            set.status = 403
            return { error: 'Forbidden: requires admin|supervisor|analyst' }
          }
          if (!normalizePlate(body.plate)) {
            set.status = 422
            return { error: 'Placa de cavalo inválida.' }
          }
          return upsertVaultCredential(body, user.id)
        },
        {
          body: vaultUpsertSchema,
          detail: { tags: ['gr'], summary: 'Cofre: upsert de credencial (senha entra cifrada; omitida = preserva a atual)' },
        },
      )
      .post(
        '/vault/reveal',
        async ({ user, body, set }) => {
          if (!CAN_VAULT.has(user.role)) {
            set.status = 403
            return { error: 'Forbidden: requires admin|supervisor|analyst' }
          }
          if (!normalizePlate(body.plate)) {
            set.status = 422
            return { error: 'Placa de cavalo inválida.' }
          }
          const credential = await revealVaultCredential(body.plate, user.id)
          if (!credential) {
            set.status = 404
            return { error: 'Credencial não encontrada para essa placa.' }
          }
          return credential
        },
        {
          body: t.Object({ plate: t.String() }),
          detail: { tags: ['gr'], summary: 'Cofre: decifra a senha de UMA placa (fail-closed: audita na mesma transação)' },
        },
      )
      .delete(
        '/vault/:plate',
        async ({ user, params, set }) => {
          if (!CAN_VAULT_DELETE.has(user.role)) {
            set.status = 403
            return { error: 'Forbidden: requires admin|supervisor' }
          }
          if (!normalizePlate(params.plate)) {
            set.status = 422
            return { error: 'Placa de cavalo inválida.' }
          }
          const removed = await deleteVaultCredential(params.plate, user.id)
          if (!removed) {
            set.status = 404
            return { error: 'Credencial não encontrada para essa placa.' }
          }
          return { ok: true }
        },
        { detail: { tags: ['gr'], summary: 'Cofre: remove a credencial de uma placa (audita)' } },
      ),
  )
