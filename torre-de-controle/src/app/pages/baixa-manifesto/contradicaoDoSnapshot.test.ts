/**
 * Testes de snapshotContradizRobo.
 *
 * Runner: o front nao tem suite (sem vitest). Roda como script de asserts, no mesmo padrao
 * de src/lib/mojibake.test.ts: `npx --yes tsx torre-de-controle/src/app/pages/baixa-manifesto/contradicaoDoSnapshot.test.ts`
 * (sai com codigo != 0 se algum assert falhar).
 *
 * Linha do tempo REAL do 6642 (horarios de Brasilia, UTC-3): o robo respondeu rc=4 em
 * 28/10 as 03:48 e o manifesto segue aberto — todo snapshot desde entao e posterior.
 */
import assert from 'node:assert/strict'
import { MARGEM_LEITURA_ERP_MS, snapshotContradizRobo } from './contradicaoDoSnapshot.ts'

const brt = (dia: string, hhmm: string, seg = '00') => new Date(`${dia}T${hhmm}:${seg}-03:00`)

// --- o 6642: snapshot de 31/10 e muito posterior a resposta de 28/10 -> contradito --------
assert.equal(snapshotContradizRobo(brt('2026-10-28', '03:48'), brt('2026-10-31', '09:33')), true)

// --- o 70329: o snapshot das 12:33 e ANTERIOR a baixa (13:10) -> nao contradiz ------------
assert.equal(snapshotContradizRobo(brt('2026-10-13', '13:50'), brt('2026-10-13', '12:33')), false)

// --- a folga: snapshot que chega ate 59 s depois pode ter sido LIDO antes da resposta -----
assert.equal(snapshotContradizRobo(brt('2026-10-28', '03:48', '06'), brt('2026-10-28', '03:48', '30')), false)
assert.equal(snapshotContradizRobo(brt('2026-10-28', '03:48', '00'), brt('2026-10-28', '03:48', '59')), false)
// ... e a partir de 60 s e leitura posterior
assert.equal(snapshotContradizRobo(brt('2026-10-28', '03:48', '00'), brt('2026-10-28', '03:49', '00')), true)
assert.equal(MARGEM_LEITURA_ERP_MS, 60_000)

// --- mesma hora exata: nao contradiz (e o caso do snapshot que ainda nao viu a baixa) -----
assert.equal(snapshotContradizRobo(brt('2026-10-28', '03:48'), brt('2026-10-28', '03:48')), false)

// --- margem explicita (parametro) ----------------------------------------------------------
assert.equal(snapshotContradizRobo(brt('2026-10-28', '03:48'), brt('2026-10-28', '03:48', '10'), 5_000), true)

// --- strings ISO e Date valem igual (o Eden revive ISO com fuso em Date) -------------------
assert.equal(snapshotContradizRobo('2026-10-28T06:48:00.000Z', '2026-10-31T12:33:00.000Z'), true)
assert.equal(snapshotContradizRobo('2026-10-28T06:48:00.000Z', brt('2026-10-31', '09:33')), true)
assert.equal(snapshotContradizRobo(brt('2026-10-28', '03:48'), '2026-10-13T15:33:00.000Z'), false)

// --- sem dado dos dois lados nao ha como afirmar contradicao -------------------------------
assert.equal(snapshotContradizRobo(null, brt('2026-10-31', '09:33')), false)
assert.equal(snapshotContradizRobo(undefined, brt('2026-10-31', '09:33')), false)
assert.equal(snapshotContradizRobo(brt('2026-10-28', '03:48'), null), false)
assert.equal(snapshotContradizRobo(brt('2026-10-28', '03:48'), undefined), false)
assert.equal(snapshotContradizRobo('', ''), false)
assert.equal(snapshotContradizRobo('isto nao e data', brt('2026-10-31', '09:33')), false)
assert.equal(snapshotContradizRobo(brt('2026-10-28', '03:48'), 'isto nao e data'), false)

console.log('contradicaoDoSnapshot: todos os asserts passaram')
