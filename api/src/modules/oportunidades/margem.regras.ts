/**
 * Margem de uma oportunidade de carga — DC-565, versão 1. REGRAS PURAS.
 *
 * Sem import de banco de propósito: é o que permite o teste rodar sem DATABASE_URL,
 * mesmo idioma de baixa-auto.regras.ts. O acesso a dados fica em margem.service.ts.
 *
 * CONTRATO (não muda na v2): margem(origem, destino, tipo_veiculo, modalidade, frete)
 * devolve a margem estimada MAIS a memória de cálculo. O critério de aceite do card é
 * "troca v1→v2 sem alteração na tela" — então o que a v2 troca é a FONTE do custo/km,
 * nunca o formato desta resposta.
 *
 * v1: margem = frete − (custo médio por km × distância da rota).
 * v2 (quando o DC-557 entregar): mesmo cálculo, custo vindo da tabela real por rota.
 *
 * REGRA CENTRAL: quando falta insumo, NÃO se inventa número. Devolve calculavel:false
 * com o motivo, e a tela mostra o que falta. Margem errada num MVP de decisão comercial
 * é pior que margem ausente — quem olha acha que o sistema sabe, e não sabe.
 */

export const MARGEM_VERSAO = 'v1'

/** Tabela de acentos que o Postgres traduz sem precisar da extensão unaccent. */
export const ACENTOS_DE = 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç'
export const ACENTOS_PARA = 'AAAAAEEEEIIIIOOOOOUUUUCAAAAAEEEEIIIIOOOOOUUUUC'

// Combining diacritical marks. Construído por código-ponto e não por literal: o range
// escrito à mão vira lixo silencioso se algum editor gravar o arquivo noutro encoding,
// e o sintoma seria "Salvador" deixar de casar com "Salvador" — impossível de ver na
// revisão do diff.
const DIACRITICOS = new RegExp('[\\u0300-\\u036f]', 'g')

/**
 * Normaliza um local para comparação: maiúsculas, sem acento, sem pontuação de
 * separador e sem espaço duplicado. "Salvador/BA " e "salvador - ba" viram o mesmo.
 *
 * Pura de propósito — é o único ponto onde a heurística de casamento vive, e é o que
 * o teste cobre. O texto ORIGINAL nunca é alterado: normalizar é coisa da leitura.
 */
export function normalizarLocal(valor: string | null | undefined): string {
  if (!valor) return ''
  return valor
    .normalize('NFD')
    // combining diacritical marks — na forma escapada de propósito: o range literal
    // depende do encoding do arquivo sobreviver a cada editor que tocar nele.
    .replace(DIACRITICOS, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

/** Mediana de uma lista de números. Vazia → null. Usa a média dos centrais no par. */
export function mediana(valores: number[]): number | null {
  const limpos = valores.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b)
  if (limpos.length === 0) return null
  const meio = Math.floor(limpos.length / 2)
  return limpos.length % 2 === 0 ? (limpos[meio - 1]! + limpos[meio]!) / 2 : limpos[meio]!
}

export interface ComponenteMemoria {
  rotulo: string
  valor: number
  sinal: '+' | '-' | '='
  detalhe?: string
}

export interface MemoriaCalculo {
  versao: string
  calculavel: boolean
  motivo?: string
  frete: number
  distancia_km: number | null
  distancia_fonte: 'manual' | 'historico_viagens' | 'historico_cargas' | null
  distancia_amostras: number
  custo_km: number | null
  custo_vigencia_inicio: string | null
  custo_fonte_nota: string | null
  custo_total: number | null
  margem_valor: number | null
  margem_percentual: number | null
  componentes: ComponenteMemoria[]
}

/**
 * A matemática, isolada do banco. Recebe os insumos já resolvidos e devolve a memória
 * completa — é isto que o teste exercita e o que a tela renderiza.
 */
export function montarMemoria(entrada: {
  frete: number
  distanciaKm: number | null
  distanciaFonte: MemoriaCalculo['distancia_fonte']
  distanciaAmostras: number
  custoKm: number | null
  custoVigenciaInicio?: string | null
  custoFonteNota?: string | null
}): MemoriaCalculo {
  const { frete, distanciaKm, distanciaFonte, distanciaAmostras, custoKm } = entrada

  const base: MemoriaCalculo = {
    versao: MARGEM_VERSAO,
    calculavel: false,
    frete,
    distancia_km: distanciaKm,
    distancia_fonte: distanciaFonte,
    distancia_amostras: distanciaAmostras,
    custo_km: custoKm,
    custo_vigencia_inicio: entrada.custoVigenciaInicio ?? null,
    custo_fonte_nota: entrada.custoFonteNota ?? null,
    custo_total: null,
    margem_valor: null,
    margem_percentual: null,
    componentes: [],
  }

  if (!Number.isFinite(frete) || frete <= 0) {
    return { ...base, motivo: 'Valor do frete ausente ou não positivo.' }
  }
  if (distanciaKm === null || !Number.isFinite(distanciaKm) || distanciaKm <= 0) {
    return {
      ...base,
      motivo:
        'Sem distância para esta rota: não há viagem histórica com origem e destino equivalentes. Informe a distância à mão.',
    }
  }
  if (custoKm === null || !Number.isFinite(custoKm) || custoKm <= 0) {
    return {
      ...base,
      motivo:
        'Sem custo/km vigente para este tipo de veículo e modalidade. Cadastre o custo de referência antes de calcular a margem.',
    }
  }

  // Arredonda em centavos só na saída — o cálculo corre em ponto flutuante completo.
  const custoTotal = Math.round(custoKm * distanciaKm * 100) / 100
  const margemValor = Math.round((frete - custoTotal) * 100) / 100
  const margemPercentual = Math.round((margemValor / frete) * 10000) / 100

  return {
    ...base,
    calculavel: true,
    custo_total: custoTotal,
    margem_valor: margemValor,
    margem_percentual: margemPercentual,
    componentes: [
      { rotulo: 'Frete ofertado', valor: frete, sinal: '+' },
      {
        rotulo: 'Custo estimado da rota',
        valor: custoTotal,
        sinal: '-',
        detalhe: `${distanciaKm.toLocaleString('pt-BR')} km × R$ ${custoKm.toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
        })}/km`,
      },
      { rotulo: 'Margem estimada', valor: margemValor, sinal: '=' },
    ],
  }
}

