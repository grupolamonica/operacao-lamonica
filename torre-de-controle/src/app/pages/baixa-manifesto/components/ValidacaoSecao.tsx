import { useState } from 'react'
import { Check, X } from 'lucide-react'
import {
  useRegistrarValidacao,
  type PendenciaManifesto,
  type ValidacaoRegistro,
} from '@/hooks/useManifestoPendencias'

/**
 * Validação do sistema pelo operador.
 *
 * Objetivo: medir se o alerta está CERTO. Hoje o sistema é confiável "por impressão"; com a
 * amostragem acumulada sai a precisão real — e, por origem do sinal, aponta qual limiar ajustar.
 *
 * Custo para o operador (decisão Danilo): acerto em 1 clique, erro em 2. O erro é o que interessa
 * investigar, então só ele pede detalhe.
 *
 * ⚠️ O corpo enviado carrega a FOTO do que a tela mostrava (estado, origem, evidências,
 * estado_desde). O servidor não pode reconstruir isso: o snapshot é sobrescrito a cada 5 min e
 * pode já ter mudado entre o operador ler e clicar. Sem a foto, não há como calcular acurácia.
 */
export function ValidacaoSecao({
  pendencia: p,
  validacao,
  motivosErro,
  podeEscrever,
}: {
  pendencia: PendenciaManifesto
  validacao?: ValidacaoRegistro
  motivosErro: Record<string, string>
  podeEscrever: boolean
}) {
  const registrar = useRegistrarValidacao()
  const [negando, setNegando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  if (p.codman == null || p.filial == null) return null

  const estado = p.estado ?? (p.estagio === 'descarregado' ? 'descarregado' : undefined)
  const evidencias = Array.isArray(p.evidencias) ? p.evidencias : null

  // a foto do momento vai em toda validação
  const foto = {
    codman: p.codman,
    filial: p.filial,
    serie: p.serie ?? '',
    estado_sistema: estado ?? 'desconhecido',
    origem_estado: p.origem_estado ?? null,
    evidencias,
    comprovacao_trava: p.comprovacao_trava ?? null,
    na_frota: p.na_frota_sascar ?? null,
    estado_desde: p.estado_desde_local ?? null,
    placa: p.cavalo || p.placa || undefined,
    destino: p.destino || undefined,
  }

  const enviar = (veredito: 'correto' | 'incorreto', extras: Record<string, unknown> = {}) => {
    setErro(null)
    registrar.mutate(
      { ...foto, veredito, ...extras },
      {
        onSuccess: () => { setNegando(false); setMotivo('') },
        onError: (e) => setErro((e as Error).message),
      },
    )
  }

  if (validacao) {
    const ok = validacao.veredito === 'correto'
    return (
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground">Validação</h4>
        <div
          className="rounded-md p-2.5 text-xs"
          style={{
            background: ok ? 'var(--status-no-prazo-bg)' : 'var(--status-em-risco-bg)',
            color: ok ? 'var(--status-no-prazo-fg)' : 'var(--status-em-risco-fg)',
          }}
        >
          <p className="font-semibold">
            {ok ? 'Operador confirmou: o sistema acertou' : 'Operador registrou que o sistema errou'}
            {validacao.motivo_erro_rotulo && ` — ${validacao.motivo_erro_rotulo}`}
          </p>
          <p className="mt-1 text-[10px]">
            {validacao.autor ?? 'autor não identificado'} · {new Date(validacao.criado_em).toLocaleString('pt-BR')}
            {validacao.horas_ate_baixa != null && ` · baixado ${validacao.horas_ate_baixa}h após o alerta`}
          </p>
        </div>
      </div>
    )
  }

  if (!podeEscrever) return null

  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground">
        Validação
        {estado === 'descarregado' && (
          <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold"
            style={{ background: 'var(--status-atrasado-bg)', color: 'var(--status-atrasado-fg)' }}>
            pendente
          </span>
        )}
      </h4>

      {!negando ? (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            {estado === 'descarregado'
              ? 'O sistema diz que este manifesto pode ser baixado. Confere?'
              : 'O sistema NÃO aponta este manifesto para baixa. Se já podia ser baixado, registre — é como medimos o que o sistema deixa passar.'}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => enviar('correto', { baixou: true })}
              disabled={registrar.isPending}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--status-no-prazo-fg)' }}
            >
              <Check className="h-3.5 w-3.5" />
              {estado === 'descarregado' ? 'Baixei — estava certo' : 'Já podia baixar'}
            </button>
            {estado === 'descarregado' && (
              <button
                type="button"
                onClick={() => setNegando(true)}
                disabled={registrar.isPending}
                className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                style={{ borderColor: 'var(--border)', color: 'var(--status-atrasado-fg)' }}
              >
                <X className="h-3.5 w-3.5" />
                Não era
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[10px] italic text-muted-foreground">
            {estado === 'descarregado'
              ? 'Registra também o horário da baixa — é como medimos o tempo entre o aviso e a baixa.'
              : 'Serve para medir quando o sistema é conservador demais.'}
          </p>
        </>
      ) : (
        <div className="rounded-md border p-2.5" style={{ borderColor: 'var(--border)' }}>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            O que estava acontecendo de verdade?
          </label>
          <select
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-xs text-foreground"
            style={{ borderColor: 'var(--border)' }}
          >
            <option value="">Selecione…</option>
            {Object.entries(motivosErro).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
          <div className="mt-2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => enviar('incorreto', { motivo_erro: motivo })}
              disabled={!motivo || registrar.isPending}
              className="rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--status-atrasado-fg)' }}
            >
              {registrar.isPending ? 'Registrando…' : 'Registrar erro do sistema'}
            </button>
            <button
              type="button"
              onClick={() => { setNegando(false); setMotivo('') }}
              className="rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground"
              style={{ borderColor: 'var(--border)' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {erro && (
        <p className="mt-1.5 text-[10px] font-semibold" style={{ color: 'var(--destructive)' }}>{erro}</p>
      )}
    </div>
  )
}
