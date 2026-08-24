/**
 * Vocabulário visual da Baixa de Manifesto — as cores, os selos e o que cada um
 * quer dizer.
 *
 * Extraído da página em 24/08 para ser importado TAMBÉM pelo guia (`GuiaPage`).
 * O motivo é concreto: nesta mesma manhã descobrimos que o `COMO-FUNCIONA.md` do
 * coletor afirmava ler o atuador da trava quando o código lia o sensor — a
 * documentação tinha divergido do código sem que nada acusasse. Uma tela de ajuda
 * que redeclara os próprios rótulos apodrece do mesmo jeito, em silêncio. Aqui o
 * guia renderiza LITERALMENTE o que a tabela renderiza; mudar a cor ou o texto de
 * um selo muda os dois, ou não compila.
 *
 * Regra ao mexer: nada de I/O e nada de componente neste arquivo — só dado.
 */
import type { EstadoManifesto } from '@/lib/api/manifesto'

export const ESTADOS: { key: EstadoManifesto; emoji: string; label: string; bg: string; fg: string }[] = [
  { key: 'descarregado', emoji: '🔴', label: 'Descarregado', bg: 'var(--status-atrasado-bg)', fg: 'var(--status-atrasado-fg)' },
  { key: 'descarregando', emoji: '🟠', label: 'Descarregando', bg: 'var(--status-em-risco-bg)', fg: 'var(--status-em-risco-fg)' },
  // sem token CSS pronto para amarelo (--status-* só tem verde/laranja/vermelho/cinza) — inline aqui mesmo
  { key: 'aguardando_descarga', emoji: '🟡', label: 'Aguardando descarga', bg: 'oklch(0.870 0.165 95.0 / 0.20)', fg: 'oklch(0.450 0.130 95.0)' },
  { key: 'em_transito', emoji: '🚚', label: 'Em trânsito', bg: 'rgba(26,79,196,0.12)', fg: 'var(--primary)' },
  { key: 'sem_rastreio', emoji: '❓', label: 'Sem rastreio', bg: 'var(--status-sem-sinal-bg)', fg: 'var(--status-sem-sinal-fg)' },
]
export const ESTADO_INFO = Object.fromEntries(ESTADOS.map((e) => [e.key, e])) as Record<EstadoManifesto, typeof ESTADOS[number]>

export const SEM_PRAZO_CHIP = {
  label: 'SEM PRAZO',
  title: 'O prazo cadastrado no Rodopar não serve (vazio, ou anterior à emissão do manifesto) — não dá pra dizer se está atrasado',
} as const

// Selo de comprovação da trava (coluna Estado, só relevante na FROTA — ver
// V2-CONTRATO.md "Regra da comprovação pela trava"). null (DEMAIS/sem
// rastreador) não mostra selo nenhum.
export const TRAVA_CHIP = {
  sim: {
    label: 'TRAVA ✓', bg: 'var(--status-no-prazo-bg)', fg: 'var(--status-no-prazo-fg)',
    title: 'A trava do baú comprovou a descarga no destino',
  },
  nao: {
    label: 'SEM TRAVA', bg: 'var(--status-em-risco-bg)', fg: 'var(--status-em-risco-fg)',
    title: 'A SM confirmou a entrega, mas a trava do baú não comprovou descarga no destino — confirme antes de baixar',
  },
} as const

export const JA_SAIU_CHIP = {
  label: 'JÁ SAIU',
  bg: 'var(--status-atrasado-bg)',
  fg: 'var(--status-atrasado-fg)',
  title: 'O caminhão já descarregou e deixou o cliente — o manifesto continua aberto',
} as const
