import type { Alert } from '@/data/types'

/**
 * Regra do "piscar vermelho" (.blink-red) das Ocorrências.
 *
 * Pisca SÓ os riscos de janela que exigem ação imediata e que ninguém assumiu ainda:
 *   - `atraso`    → vai chegar DEPOIS da janela
 *   - `adiantado` → vai chegar 0–30min ANTES (igual ao `tr.linha-alerta-risco` que pisca no painel GAS)
 *
 * Os demais automáticos (parada / sem_sinal / prazo_proximo / proximo_entrega) e os manuais
 * NÃO piscam — usam só a cor de severidade. Antes piscava todo automático `aberto`, o que fazia
 * quase tudo piscar (o detector gera muito ticket que fica aberto) e matava o destaque.
 *
 * Para de piscar assim que sai de `aberto` (operador assumiu / concluiu).
 */
export const BLINK_TYPES = new Set<string>(['atraso', 'adiantado'])

export const shouldBlinkAlert = (a: Pick<Alert, 'type' | 'status'>) =>
  a.status === 'aberto' && BLINK_TYPES.has(a.type)
