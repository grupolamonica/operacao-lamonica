/**
 * Guia da tela de Baixa de Manifesto — para o OPERADOR.
 *
 * Documento separado de propósito do `COMO-FUNCIONA.md` do coletor, que é para
 * quem mantém o código. Aqui a pergunta é outra: "esse selo apareceu, e agora?".
 * Se um dia os dois disserem a mesma coisa com as mesmas palavras, é sinal de que
 * este aqui virou documentação técnica e perdeu a serventia.
 *
 * As cores e os selos vêm de `./chips` — os MESMOS objetos que a tabela usa. Mudar
 * um rótulo lá muda aqui, ou não compila. Já o texto das regras é escrito à mão e
 * PODE divergir do coletor: ao mexer nos limiares do `coletor_v2.py`, a tabela
 * "Os números" desta página é o segundo lugar a atualizar.
 */
import { ArrowLeft, BookOpen } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ESTADOS, JA_SAIU_CHIP, SEM_PRAZO_CHIP, TRAVA_CHIP } from './chips'

function Secao({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-card p-5" style={{ border: '1px solid var(--border)' }}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-primary">
        <span
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold"
          style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
        >
          {n}
        </span>
        {titulo}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-foreground">{children}</div>
    </section>
  )
}

/** Selo renderizado igual ao da tabela, para o operador reconhecer de olho. */
function Selo({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: bg, color: fg }}
    >
      {label}
    </span>
  )
}

function Chave({ children }: { children: React.ReactNode }) {
  return (
    <code
      className="rounded px-1.5 py-0.5 font-mono text-[11px]"
      style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
    >
      {children}
    </code>
  )
}

/** O que fazer diante de cada cor. É a coluna que o operador realmente lê. */
const ACAO_POR_ESTADO: Record<string, string> = {
  descarregado:
    'Pode baixar. O sistema tem prova de que a descarga terminou. Confira o selo da trava antes: '
    + 'com SEM TRAVA a prova é só da SM, e a SM erra para mais.',
  descarregando:
    'Não baixe ainda. Ou a descarga está em curso, ou o sistema tem suspeita sem prova. '
    + 'Abra a linha e leia as evidências — é aqui que mora o julgamento humano.',
  aguardando_descarga:
    'Chegou e está esperando. Nada a fazer além de acompanhar; vira laranja sozinho quando começar.',
  em_transito: 'Ainda rodando. Só entra na sua fila quando chegar.',
  sem_rastreio:
    'A posição está com mais de 3 h. Não é erro do manifesto, é falta de sinal — '
    + 'trate como veículo sem telemetria e use o telefone.',
}

/** As chaves que o coletor pode publicar em `evidencias`, na ordem em que fazem sentido ler. */
const EVIDENCIAS: { chave: string; oque: string }[] = [
  { chave: 'sm_entrega_realizada', oque: 'A gerenciadora marcou a entrega como Realizada.' },
  { chave: 'sm_status_entrega_concluida', oque: 'A viagem inteira foi concluída na SM.' },
  { chave: 'sm_todas_entregas_realizadas', oque: 'Todas as entregas da sequência estão Realizadas.' },
  { chave: 'sm_entrega_iniciada', oque: 'A entrega começou na SM, mas ninguém a fechou ainda.' },
  { chave: 'sm_aguardando_descarga', oque: 'A SM diz que o veículo está esperando para descarregar.' },
  { chave: 'sm_transito_para_descarga', oque: 'A SM ainda considera o veículo a caminho.' },
  {
    chave: 'sm_entrega_nao_iniciada',
    oque: 'A SM afirma que a entrega NÃO começou. Enquanto isso valer, sinal físico não promove '
      + 'para descarregado — foi o que impediu um manifesto recém-carregado de virar vermelho.',
  },
  {
    chave: 'sm_sem_comprovacao_trava',
    oque: 'A SM diz Realizada, mas a trava não comprovou. Na frota isso segura em laranja de propósito. '
      + 'O selo SEM TRAVA na linha é a mesma coisa dita em uma palavra.',
  },
  {
    chave: 'aguardando_comprovacao_trava',
    oque: 'Tudo indica descarga (macro de fim, ou parada longa no cliente) e falta só a trava. '
      + 'É a evidência mais comum em laranja e a que mais pede telefone.',
  },
  {
    chave: 'trava_destravou_destino',
    oque: 'O baú foi aberto dentro do destino. Sozinho não prova nada: conferência de doca abre o baú igual.',
  },
  {
    chave: 'trava_ciclo_completo',
    oque: 'Abriu no destino, ficou aberto tempo suficiente e tornou a fechar. É a prova física forte — '
      + 'vale mais que uma SM parada.',
  },
  {
    chave: 'trava_ciclo_curto',
    oque: 'Abriu e fechou rápido demais para ser descarga. Quase sempre conferência de doca. '
      + 'Nasceu de um manifesto que ficou 11 min com o baú aberto e saiu com a carga inteira dentro.',
  },
  { chave: 'macro_fim_de_viagem', oque: 'O motorista apontou FIM DE VIAGEM no computador de bordo.' },
  { chave: 'macro_fim_no_destino', oque: 'Mesmo apontamento, e dentro do raio do destino.' },
  { chave: 'macro_parada_no_cliente', oque: 'Apontou parada ou chegada no cliente.' },
  { chave: 'parado_40min_destino', oque: 'Parado 40 min ou mais dentro do destino: começou a descarregar.' },
  { chave: 'parado_90min_destino', oque: 'Parado 90 min ou mais: tempo de descarga inteira.' },
  {
    chave: 'permaneceu_no_destino',
    oque: 'Chegou de verdade e ficou. "Chegou" exige ter sido visto vindo de longe — sem essa condição, '
      + 'caminhão parado na doca de ORIGEM contava como descarga.',
  },
  {
    chave: 'ja_saiu_do_destino',
    oque: 'Descarregou e já deixou o cliente, com o manifesto ainda aberto. É o selo JÁ SAIU.',
  },
]

const LIMIARES: { nome: string; valor: string; oque: string }[] = [
  { nome: 'Raio do destino', valor: '60 km', oque: 'A partir daqui o veículo conta como "no cliente".' },
  { nome: 'Raio de saída', valor: '8 km', oque: 'Passou disso depois de ter chegado, saiu.' },
  { nome: 'Deslocamento mínimo', valor: '5 km', oque: 'Para a chegada ser real, e não o caminhão que nunca saiu da origem.' },
  { nome: 'Parado = descarregando', valor: '40 min', oque: 'Dentro do destino.' },
  { nome: 'Parado = descarregou', valor: '90 min', oque: 'Só vale sozinho fora da frota.' },
  { nome: 'Baú aberto mínimo', valor: '30 min', oque: 'Abaixo disso é conferência, não descarga.' },
  { nome: 'Posição velha', valor: '3 h', oque: 'Acima disso vira "sem rastreio".' },
]

export function GuiaBaixaManifestoPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-10">
      {/* Header */}
      <div
        className="flex items-center justify-between rounded-xl bg-card px-5 py-4"
        style={{ border: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-3">
          <div className="rounded-lg p-2" style={{ background: 'linear-gradient(310deg,#0d2055,#1a4fc4)' }}>
            <BookOpen className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-primary">Guia da Baixa de Manifesto</h1>
            <p className="text-xs text-muted-foreground">
              O que a tela decide sozinha, o que ela pede para você decidir, e por quê
            </p>
          </div>
        </div>
        <Button asChild size="sm" variant="outline" className="gap-1.5 text-xs">
          <Link to="/baixa-manifesto">
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar
          </Link>
        </Button>
      </div>

      <Secao n={1} titulo="Para que serve esta tela">
        <p>
          Ela responde uma pergunta só: <strong>quais manifestos já podem ser baixados no Rodopar</strong>.
          A cada 5 minutos um robô cruza três fontes — o manifesto aberto no Rodopar, a posição e os
          sensores da Sascar, e a SM da Angellira — e classifica cada manifesto em uma das cinco cores.
        </p>
        <p>
          Ele <strong>não baixa nada sozinho</strong>. A baixa continua sendo ato humano: o sistema avisa,
          você decide, e o botão BAIXAR manda o robô executar o que você decidiu.
        </p>
        <div
          className="rounded-lg p-3 font-mono text-[11px] leading-relaxed"
          style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
        >
          Rodopar + Sascar + Angellira → coletor (5 min) → esta tela → [BAIXAR] → robô → Rodopar
        </div>
        <p className="text-xs text-muted-foreground">
          Quando o manifesto é baixado ele deixa de estar aberto e some daqui no ciclo seguinte. Se um item
          sumiu, ele foi baixado — por você, pelo robô, ou por alguém direto no Rodopar.
        </p>
      </Secao>

      <Secao n={2} titulo="As cinco cores, e o que fazer com cada uma">
        <div className="space-y-2">
          {ESTADOS.map((e) => (
            <div
              key={e.key}
              className="flex items-start gap-3 rounded-lg p-3"
              style={{ background: 'var(--muted)' }}
            >
              <Selo label={`${e.emoji} ${e.label}`} bg={e.bg} fg={e.fg} />
              <p className="text-xs leading-relaxed">{ACAO_POR_ESTADO[e.key]}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          A tela toca um som quando um manifesto <strong>entra</strong> em "descarregado" — as outras
          transições são silenciosas de propósito.
        </p>
      </Secao>

      <Secao n={3} titulo="Os selos das linhas">
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <Selo label={TRAVA_CHIP.sim.label} bg={TRAVA_CHIP.sim.bg} fg={TRAVA_CHIP.sim.fg} />
            <p className="text-xs">{TRAVA_CHIP.sim.title}. Só aparece na frota.</p>
          </div>
          <div className="flex items-start gap-3">
            <Selo label={TRAVA_CHIP.nao.label} bg={TRAVA_CHIP.nao.bg} fg={TRAVA_CHIP.nao.fg} />
            <p className="text-xs">{TRAVA_CHIP.nao.title}.</p>
          </div>
          <div className="flex items-start gap-3">
            <Selo label={JA_SAIU_CHIP.label} bg={JA_SAIU_CHIP.bg} fg={JA_SAIU_CHIP.fg} />
            <p className="text-xs">{JA_SAIU_CHIP.title}. É o mais urgente da tela: já não há o que esperar.</p>
          </div>
          <div className="flex items-start gap-3">
            <Selo label={SEM_PRAZO_CHIP.label} bg="var(--status-sem-sinal-bg)" fg="var(--status-sem-sinal-fg)" />
            <p className="text-xs">
              {SEM_PRAZO_CHIP.title}. Não é o manifesto que está errado — é o cadastro. Acontece em cerca
              de <strong>1 a cada 5</strong>, e antes de agosto esses lideravam a lista como os mais atrasados.
            </p>
          </div>
        </div>
      </Secao>

      <Secao n={4} titulo="O aviso mais importante da tela">
        <p>
          No topo, um ponto verde pulsando com <strong>Atualizado</strong> quer dizer que o coletor está
          enviando. Quando ele para, aparece no lugar uma faixa amarela:
        </p>
        {/* MESMAS classes do banner real na BaixaManifestoPage — se o estilo de lá
            mudar, este exemplo passa a mentir. Vale conferir junto. */}
        <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          <span>⚠ Coletor sem enviar há 47 min</span>
        </div>
        <p className="text-xs">
          Enquanto essa faixa estiver na tela, <strong>tudo abaixo dela é foto antiga</strong>. As cores, os
          selos e os quilômetros são o que era verdade quando o número diz. Um caminhão marcado "em trânsito"
          pode já ter descarregado; um 🔴 pode já ter sido baixado por outra pessoa.
        </p>
        <p className="text-xs">
          Ela aparece a partir de <strong>15 minutos</strong> — três ciclos perdidos, o que já não é atraso
          normal. Se ela ficar, avise quem cuida do coletor; não adianta atualizar a página, porque o problema
          não está no navegador.
        </p>
        <p
          className="rounded-lg p-3 text-xs"
          style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
        >
          Aconteceu em <strong>24/08</strong>: o coletor travou e a tela ficou 80 minutos parada. O aviso
          estava lá o tempo todo — é a diferença entre uma tela velha e uma tela mentirosa.
        </p>
      </Secao>

      <Secao n={5} titulo="O botão BAIXAR e o robô">
        <p>
          O robô roda em <strong>um PC específico</strong>, não no servidor: ele precisa abrir o Rodopar como
          se fosse gente. O selo no topo da tela diz se ele está de plantão.
        </p>
        <ul className="ml-4 list-disc space-y-1.5 text-xs">
          <li><strong>Robô conectado</strong> — o botão funciona de verdade.</li>
          <li>
            <strong>Robô desconectado</strong> — clicar só enfileira; nada chega ao Rodopar. Para religar,
            dois cliques em <Chave>Iniciar-Robo.bat</Chave> na máquina do robô.
          </li>
        </ul>
        <p className="text-xs">E o que o botão mostra depois do clique:</p>
        <ul className="ml-4 list-disc space-y-1.5 text-xs">
          <li><strong>NA FILA</strong> — aceito, esperando a vez.</li>
          <li><strong>SEM ROBÔ</strong> — na fila, mas não há ninguém para executar.</li>
          <li><strong>EXECUTANDO</strong> — o robô está no Rodopar agora.</li>
          <li><strong>BAIXADO</strong> — terminou. O item some no próximo ciclo.</li>
          <li><strong>CONFERIR</strong> — o robô parou no meio e quer olho humano. Abra a linha e leia o motivo.</li>
        </ul>
        <p
          className="rounded-lg p-3 text-xs"
          style={{ background: 'var(--status-em-risco-bg)', color: 'var(--status-em-risco-fg)' }}
        >
          <strong>Um por vez.</strong> O Rodopar aceita uma sessão só por login, então o robô processa um
          manifesto de cada vez mesmo com dez na fila. Não é lentidão — é o que impede duas baixas de se
          atropelarem.
        </p>
      </Secao>

      <Secao n={6} titulo="Como o sistema decide a cor">
        <p className="text-xs text-muted-foreground">
          Na ordem. A primeira regra que se aplica decide, e as de baixo nem são consultadas.
        </p>
        <ol className="ml-4 list-decimal space-y-2 text-xs">
          <li>
            <strong>SM diz Realizada</strong> → descarregado. Exceto na frota, onde ainda exige a trava:
            sem ela para em laranja com <Chave>sm_sem_comprovacao_trava</Chave>.
          </li>
          <li>
            <strong>SM diz Não Iniciada</strong> → nada físico promove a descarga; no máximo "aguardando".
            É a trava de segurança contra abrir o baú para carregar ou conferir.
            <em> Exceção:</em> se o veículo chegou, ficou e já foi embora, a evidência física volta a mandar.
          </li>
          <li>
            <strong>Ciclo completo da trava</strong> → descarregado, mesmo com a SM ainda aberta. A SM não
            fecha quando a descarga acaba — fecha quando o cliente dá baixa, e isso atrasa horas.
          </li>
          <li><strong>SM Iniciada / Aguardando</strong> → descarregando ou aguardando, conforme o status.</li>
          <li>
            <strong>Já houve descarga neste manifesto</strong> → descarregado, e não volta atrás. O caminhão
            ir embora não desfaz a descarga.
          </li>
          <li>
            <strong>Sinais do momento</strong> — macro de fim de viagem, ou parada longa dentro do destino.
            Na frota tudo isso para em laranja aguardando a trava.
          </li>
          <li><strong>Posição fresca</strong> → em trânsito. <strong>Posição velha</strong> → sem rastreio.</li>
        </ol>
        <p
          className="rounded-lg p-3 text-xs"
          style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
        >
          A regra que explica quase toda a tela: <strong>na frota, "descarregado" exige prova física da
          trava</strong>. Sem ela o item para em laranja com a evidência à vista, e quem julga é você. É
          deliberado — errar para o lado de "não baixe ainda" custa uma ligação; errar para o outro lado
          baixa manifesto com carga dentro.
        </p>
      </Secao>

      <Secao n={7} titulo="O que cada evidência quer dizer">
        <p className="text-xs text-muted-foreground">
          Abrindo a linha, o painel lista as evidências com o nome técnico. Esta é a tradução.
        </p>
        <div className="space-y-2">
          {EVIDENCIAS.map((e) => (
            <div key={e.chave} className="flex flex-col gap-1 border-b pb-2" style={{ borderColor: 'var(--border)' }}>
              <Chave>{e.chave}</Chave>
              <p className="text-xs leading-relaxed text-muted-foreground">{e.oque}</p>
            </div>
          ))}
        </div>
      </Secao>

      <Secao n={8} titulo="Os números">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="pb-2 pr-3 font-semibold">Limiar</th>
                <th className="pb-2 pr-3 font-semibold">Valor</th>
                <th className="pb-2 font-semibold">Para quê</th>
              </tr>
            </thead>
            <tbody>
              {LIMIARES.map((l) => (
                <tr key={l.nome} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="py-2 pr-3 font-semibold">{l.nome}</td>
                  <td className="py-2 pr-3 font-mono">{l.valor}</td>
                  <td className="py-2 text-muted-foreground">{l.oque}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Secao>

      <Secao n={9} titulo="Quando NÃO confiar na tela">
        <p>
          Três casos deste mês só se resolveram por telefone. Vale conhecê-los, porque a forma de todos
          vai se repetir.
        </p>
        <ul className="ml-4 list-disc space-y-2 text-xs">
          <li>
            <strong>A SM estava errada para menos.</strong> O motorista já tinha descarregado havia horas e a
            SM ainda dizia que estava descarregando. Quem fecha a SM é o cliente, não a descarga.
          </li>
          <li>
            <strong>O baú abriu, mas não era descarga.</strong> Encostaram na doca, abriram, conferiram e
            avisaram que a descarga seria no dia seguinte. Onze minutos de baú aberto. Hoje isso vira{' '}
            <Chave>trava_ciclo_curto</Chave> e não promove mais, mas a forma do erro vai voltar.
          </li>
          <li>
            <strong>Sensor quebrado fica preso em laranja para sempre.</strong> Há pelo menos um veículo cuja
            trava lê "destravado" desde antes deste sistema existir. Para ele a prova física é inalcançável e
            nenhuma espera resolve.
          </li>
        </ul>
        <p
          className="rounded-lg p-3 text-xs font-semibold"
          style={{ background: 'var(--status-ok-bg)', color: 'var(--status-ok-fg)' }}
        >
          Quando a tela e o campo divergirem, o campo ganha. O telefone do motorista está na própria linha
          por causa disso.
        </p>
      </Secao>

      <p className="px-1 text-[11px] text-muted-foreground">
        Regras vigentes em 24/08/2026. Cada uma nasceu de um caso real que deu errado — o detalhe técnico e o
        histórico completo estão no repositório <Chave>alerta-manifesto</Chave>, em{' '}
        <Chave>COMO-FUNCIONA.md</Chave> e <Chave>CONTEXTO.md</Chave>.
      </p>
    </div>
  )
}
