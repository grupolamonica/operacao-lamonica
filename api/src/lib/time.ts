// Convenção de tempo do sistema: timestamps operacionais (window_end, occurred_at dos
// tickets vindos do painel) são o RELÓGIO-DE-PAREDE de Brasília gravado como se fosse UTC.
// O front exibe lendo os componentes UTC. Brasil não tem mais horário de verão → offset fixo -03:00.
const BR_OFFSET_MS = 3 * 3_600_000

/** "Agora" de Brasília rotulado como UTC — p/ gravar occurred_at no mesmo convênio do painel. */
export function brWallNow(): Date {
  return new Date(Date.now() - BR_OFFSET_MS)
}
