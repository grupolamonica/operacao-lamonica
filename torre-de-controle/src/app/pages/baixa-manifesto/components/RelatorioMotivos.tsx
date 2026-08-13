import { useMemo, useState } from 'react'
import { BarChart3, ChevronDown, ChevronUp } from 'lucide-react'
import { useAcuraciaSistema, useRelatorioTratativas } from '@/hooks/useManifestoPendencias'

/**
 * Relatório de motivos das justificativas — seção dentro de /baixa-manifesto.
 *
 * Mora aqui por decisão do Danilo (13/08): os 3 operadores, cujo papel é confinado a esta rota,
 * veem o próprio trabalho agregado. SEM quebra por autor — corte de avaliação de desempenho não
 * entra numa tela que os avaliados enxergam.
 *
 * Recolhida por padrão e só busca quando aberta: a função crítica da tela é a fila de manifestos,
 * e o relatório não pode competir com ela nem pesar o polling de 30 s.
 *
 * Gráfico em CSS puro, não Chart.js (que existe no projeto): são ≤7 barras de uma medida só, e
 * barra CSS não precisa de registro de escala, remount por tema nem paleta em hex fora dos tokens.
 */

const DIAS_PADRAO = 30

function isoDiasAtras(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return d.toISOString().slice(0, 10)
}

export function RelatorioMotivos() {
  const [aberto, setAberto] = useState(false)
  const [dias, setDias] = useState(DIAS_PADRAO)
  const { inicio, fim } = useMemo(
    () => ({ inicio: isoDiasAtras(dias), fim: new Date().toISOString().slice(0, 10) }),
    [dias],
  )
  const { relatorio, isLoading, isError, error } = useRelatorioTratativas(inicio, fim, aberto)
  const { acuracia } = useAcuraciaSistema(dias, aberto)

  const maxManifestos = Math.max(1, ...(relatorio?.por_motivo ?? []).map((m) => m.manifestos))
  const comDado = (relatorio?.por_motivo ?? []).filter((m) => m.notas > 0)
  const cob = relatorio?.cobertura

  return (
    <div className="rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <BarChart3 className="h-4 w-4 text-primary" />
          Por que os manifestos ficam abertos
          <span className="text-xs font-normal text-muted-foreground">— motivos registrados pelos operadores</span>
        </span>
        {aberto ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {aberto && (
        <div className="border-t px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <div className="mb-3 flex items-center gap-1.5">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDias(d)}
                className="rounded-md border px-2 py-1 text-xs font-semibold"
                style={{
                  borderColor: 'var(--border)',
                  background: dias === d ? 'var(--primary)' : 'transparent',
                  color: dias === d ? '#fff' : 'var(--muted-foreground)',
                }}
              >
                {d} dias
              </button>
            ))}
          </div>

          {isLoading && <p className="text-xs text-muted-foreground">carregando…</p>}

          {isError && (
            <p className="text-xs font-semibold" style={{ color: 'var(--destructive)' }}>
              {(error as Error)?.message ?? 'Não foi possível montar o relatório.'}
            </p>
          )}

          {/* Precisão do alerta — medida pelas validações dos operadores. Fica ANTES dos motivos
              porque responde a pergunta mais básica: o sistema está certo? */}
          {acuracia && (
            <div className="mb-3 rounded-md border p-2.5" style={{ borderColor: 'var(--border)' }}>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                O sistema está acertando?
              </p>
              {acuracia.alertas_validados === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhum alerta validado ainda neste período. A precisão aparece aqui quando os
                  operadores começarem a confirmar os manifestos marcados como descarregados.
                </p>
              ) : (
                <>
                  <p className="text-xs text-foreground">
                    <b className="text-base">{acuracia.precisao_pct}%</b> de precisão
                    {acuracia.margem_pp != null && (
                      <span className="text-muted-foreground"> (± {acuracia.margem_pp} pontos)</span>
                    )}
                    {' — '}
                    <b>{acuracia.alertas_corretos}</b> de <b>{acuracia.alertas_validados}</b> alertas
                    confirmados.
                  </p>
                  {/* amostra pequena precisa de aviso: 5 validações não sustentam conclusão */}
                  {acuracia.alertas_validados < 30 && (
                    <p className="mt-1 text-[10px] font-semibold" style={{ color: 'var(--status-em-risco-fg)' }}>
                      Amostra ainda pequena — com ~7 alertas por dia, duas semanas de validação dão
                      base firme. Até lá, trate como indicativo.
                    </p>
                  )}
                  {acuracia.por_origem.length > 1 && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Por origem do sinal:{' '}
                      {acuracia.por_origem.map((o, i) => (
                        <span key={o.origem}>
                          {i > 0 && ' · '}
                          <b className="text-foreground">{o.origem}</b> {o.precisao_pct}% ({o.total})
                        </span>
                      ))}
                    </p>
                  )}
                  {acuracia.por_motivo_erro.length > 0 && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Quando errou:{' '}
                      {acuracia.por_motivo_erro.map((m, i) => (
                        <span key={m.motivo}>{i > 0 && ' · '}{m.motivo_rotulo} ({m.total})</span>
                      ))}
                    </p>
                  )}
                  {acuracia.falsos_negativos > 0 && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      <b className="text-foreground">{acuracia.falsos_negativos}</b> manifesto(s) que
                      o operador considerou prontos sem o sistema ter apontado — indício de que a
                      regra está conservadora (não é medida completa).
                    </p>
                  )}
                  {acuracia.baixas_declaradas > 0 && acuracia.horas_ate_baixa_mediana != null && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Tempo entre o alerta e a baixa: mediana de{' '}
                      <b className="text-foreground">{acuracia.horas_ate_baixa_mediana} h</b>
                      {acuracia.horas_ate_baixa_media != null && ` (média ${acuracia.horas_ate_baixa_media} h)`}
                      {' '}em {acuracia.baixas_declaradas} baixa(s) declarada(s).
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {relatorio && !isLoading && !isError && (
            <>
              {/* A faixa de cobertura É o relatório: sem ela a distribuição parece explicar TODOS
                  os manifestos vencidos, quando explica só os que alguém justificou. */}
              {cob && (
                <div
                  className="mb-3 rounded-md p-2.5 text-xs"
                  style={{
                    background: cob.snapshot_ok ? 'var(--muted)' : 'var(--status-atrasado-bg)',
                    color: cob.snapshot_ok ? 'var(--foreground)' : 'var(--status-atrasado-fg)',
                  }}
                >
                  {!cob.snapshot_ok ? (
                    <span className="font-semibold">
                      Sem dados recentes do coletor — não é possível afirmar a cobertura agora.
                    </span>
                  ) : (
                    <>
                      Agora há <b>{cob.vencidos}</b> manifestos com prazo vencido e{' '}
                      <b>{cob.vencidos_com_justificativa}</b> com justificativa
                      {' '}({cob.cobertura_pct}%).{' '}
                      {cob.vencidos_sem_justificativa > 0 && (
                        <span style={{ color: 'var(--status-atrasado-fg)' }}>
                          <b>{cob.vencidos_sem_justificativa}</b> ainda sem explicação — o gráfico abaixo
                          descreve apenas os que têm.
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}

              {comDado.length === 0 ? (
                // Ausência de REGISTRO não é ausência de problema — dizer isso explicitamente, em
                // vez de mostrar gráfico vazio que se lê como "não houve atraso".
                <div className="rounded-md p-3 text-xs" style={{ background: 'var(--status-em-risco-bg)' }}>
                  <p className="font-semibold" style={{ color: 'var(--status-em-risco-fg)' }}>
                    Nenhuma justificativa registrada neste período.
                  </p>
                  <p className="mt-1" style={{ color: 'var(--status-em-risco-fg)' }}>
                    Isso não significa que não houve atraso — significa que não houve registro.
                  </p>
                </div>
              ) : (
                <>
                  <p className="mb-2 text-xs text-muted-foreground">
                    <b className="text-foreground">{relatorio.total_manifestos}</b> manifestos justificados
                    {' · '}
                    <b className="text-foreground">{relatorio.total_notas}</b> registros nos últimos {dias} dias
                  </p>
                  <div className="space-y-1.5">
                    {relatorio.por_motivo.map((m) => (
                      <div key={m.motivo} className="flex items-center gap-2">
                        <span
                          className="w-44 shrink-0 truncate text-right text-[11px]"
                          style={{ color: m.ativo ? 'var(--foreground)' : 'var(--muted-foreground)' }}
                          title={m.motivo_rotulo}
                        >
                          {m.motivo_rotulo}
                        </span>
                        <span className="flex h-4 flex-1 items-center">
                          <span
                            className="h-4 rounded-sm"
                            style={{
                              width: `${Math.max(m.manifestos ? 2 : 0, (m.manifestos * 100) / maxManifestos)}%`,
                              background: m.ativo ? 'var(--primary)' : 'var(--muted-foreground)',
                            }}
                          />
                        </span>
                        {/* número sempre escrito: a barra dá a proporção, o texto dá o fato */}
                        <span className="w-24 shrink-0 text-[11px] text-muted-foreground">
                          <b className="text-foreground">{m.manifestos}</b> manif.
                          {m.notas !== m.manifestos && ` · ${m.notas} reg.`}
                        </span>
                      </div>
                    ))}
                  </div>

                  {relatorio.por_destino.length > 0 && (
                    <div className="mt-3 border-t pt-2.5" style={{ borderColor: 'var(--border)' }}>
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Destinos que mais aparecem
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {relatorio.por_destino.map((d) => (
                          <span
                            key={d.destino}
                            className="rounded-full px-2 py-0.5 text-[11px]"
                            style={{ background: 'var(--muted)', color: 'var(--foreground)' }}
                          >
                            {d.destino} <b>{d.manifestos}</b>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
