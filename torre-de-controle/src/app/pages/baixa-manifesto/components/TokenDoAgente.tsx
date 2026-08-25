/**
 * Token do agente — onde a pessoa liga a sessão dela ao robô do PC dela.
 *
 * O valor completo aparece UMA VEZ, no instante em que é gerado, e o servidor guarda
 * só o hash. Não é limitação técnica: um cofre que devolve o segredo depois é um cofre
 * que vaza quando o banco vaza. Perdeu, gera outro — e gerar outro derruba o anterior.
 *
 * Por isso a tela precisa ser insistente no momento certo: o painel do token recém
 * gerado é o único lugar onde ele existe, e fechar sem copiar significa gerar de novo.
 */
import { useState } from 'react'
import { Check, Copy, KeyRound, RotateCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  useGerarTokenAgente,
  useRevogarTokenAgente,
  useTokenAgente,
} from '@/hooks/useManifestoPendencias'

function fmtQuando(iso: string | null): string {
  if (!iso) return 'nunca'
  // Vem do Postgres via Eden: ISO com fuso, revivido em Date. Aceita os dois — foi
  // string tratada como string que derrubou esta página em 22/08.
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR')
}

export function TokenDoAgente() {
  const { data: token, isLoading } = useTokenAgente()
  const gerar = useGerarTokenAgente()
  const revogar = useRevogarTokenAgente()
  const [valor, setValor] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    if (!valor) return
    try {
      await navigator.clipboard.writeText(valor)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // clipboard bloqueado (http, permissão): o valor está à vista para copiar à mão
    }
  }

  return (
    <div className="rounded-xl bg-card p-5" style={{ border: '1px solid var(--border)' }}>
      <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-primary">
        <KeyRound className="h-4 w-4" />
        Token do meu robô
      </h3>
      <p className="mb-4 text-xs text-muted-foreground">
        Liga esta conta ao robô que roda no seu computador. Com ele, os manifestos que{' '}
        <strong>você</strong> mandar baixar vão para o <strong>seu</strong> robô — e não para o de
        outro operador.
      </p>

      {/* O valor recém-gerado. Único lugar onde ele existe. */}
      {valor && (
        <div
          className="mb-4 rounded-lg p-3"
          style={{ background: 'var(--status-em-risco-bg)', color: 'var(--status-em-risco-fg)' }}
        >
          <p className="mb-2 text-xs font-semibold">
            Copie agora. Este valor não aparece de novo — se perder, gere outro.
          </p>
          <div className="flex items-center gap-2">
            <code
              className="flex-1 overflow-x-auto rounded px-2 py-1.5 font-mono text-[11px]"
              style={{ background: 'var(--card)', color: 'var(--foreground)' }}
            >
              {valor}
            </code>
            <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={copiar}>
              {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copiado ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
          <p className="mt-2 text-xs">
            Cole no <strong>Configurar-Robo.bat</strong>, no campo <em>Token do torre</em>, na
            máquina onde o robô roda.
          </p>
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando…</p>
      ) : token ? (
        <div className="space-y-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="text-muted-foreground">
              Token ativo:{' '}
              <code className="rounded px-1.5 py-0.5 font-mono" style={{ background: 'var(--muted)' }}>
                {token.prefixo}…
              </code>
            </span>
            <span className="text-muted-foreground">criado em {fmtQuando(token.criado_em)}</span>
          </div>
          <p className="text-muted-foreground">
            Última vez que o robô apareceu: <strong>{fmtQuando(token.usado_em)}</strong>
            {token.usado_em === null && ' — ainda não foi usado em máquina nenhuma'}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Você ainda não tem token. Sem ele, o robô da sua máquina não consegue se identificar.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          className="gap-1.5 text-xs"
          disabled={gerar.isPending}
          onClick={async () => {
            const r = await gerar.mutateAsync({})
            setValor(r.token)
            setCopiado(false)
          }}
        >
          <RotateCw className="h-3.5 w-3.5" />
          {token ? 'Gerar novo (revoga o atual)' : 'Gerar token'}
        </Button>
        {token && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            disabled={revogar.isPending}
            onClick={async () => {
              await revogar.mutateAsync()
              setValor(null)
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Revogar
          </Button>
        )}
      </div>

      {(gerar.error || revogar.error) && (
        <p className="mt-3 text-xs" style={{ color: 'var(--status-atrasado-fg)' }}>
          {(gerar.error ?? revogar.error)?.message}
        </p>
      )}

      <p className="mt-4 text-[11px] text-muted-foreground">
        Gerar um token novo <strong>derruba o anterior na hora</strong>. É o caminho para trocar de
        computador, ou para tirar do ar uma máquina que você perdeu o acesso.
      </p>
    </div>
  )
}
