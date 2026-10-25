import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import type { ModalidadeOportunidade } from '../../db/schema'

import {
  ACENTOS_DE,
  ACENTOS_PARA,
  montarMemoria,
  normalizarLocal,
  type MemoriaCalculo,
} from './margem.regras'

export { MARGEM_VERSAO, montarMemoria, normalizarLocal, mediana } from './margem.regras'
export type { MemoriaCalculo, ComponenteMemoria } from './margem.regras'

/**
 * Margem de uma oportunidade — acesso a dados. A matemática vive em margem.regras.ts.
 */

/**
 * Distância da rota a partir do histórico da própria torre.
 *
 * O DC-565 manda buscar em "bases Angellira/Liralog". Elas não são necessárias: a torre
 * já tem `trips.distance_total` (viagens executadas, persistente) e, como reserva,
 * `cargas_open_loads.distancia_km` (snapshot das cargas abertas, substituído a cada
 * sync — por isso é a segunda opção, não a primeira).
 *
 * Devolve a MEDIANA e quantas viagens a sustentam: a amostra vai para a memória de
 * cálculo, porque uma distância apoiada em 1 viagem merece outra confiança que uma
 * apoiada em 40.
 */
export async function distanciaHistorica(
  origem: string,
  destino: string,
): Promise<{ km: number | null; fonte: MemoriaCalculo['distancia_fonte']; amostras: number }> {
  const o = normalizarLocal(origem)
  const d = normalizarLocal(destino)
  if (!o || !d) return { km: null, fonte: null, amostras: 0 }

  const norm = (coluna: string) =>
    sql.raw(
      `regexp_replace(upper(translate(coalesce(${coluna}, ''), '${ACENTOS_DE}', '${ACENTOS_PARA}')), '[^A-Z0-9]+', ' ', 'g')`,
    )

  const viagens = await db.execute<{ km: string | null; amostras: string }>(sql`
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY distance_total::numeric) AS km,
           count(*)::text AS amostras
    FROM trips
    WHERE distance_total IS NOT NULL
      AND distance_total::numeric > 0
      AND btrim(${norm('origin')}) = ${o}
      AND btrim(${norm('destination')}) = ${d}
  `)

  const linhasViagens = viagens as unknown as Array<{ km: string | null; amostras: string }>
  const linhaViagens = linhasViagens[0]
  const kmViagens = linhaViagens?.km ? Number(linhaViagens.km) : null
  if (kmViagens && kmViagens > 0) {
    return {
      km: Math.round(kmViagens * 100) / 100,
      fonte: 'historico_viagens',
      amostras: Number(linhaViagens?.amostras ?? 0),
    }
  }

  const cargas = await db.execute<{ km: string | null; amostras: string }>(sql`
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY distancia_km::numeric) AS km,
           count(*)::text AS amostras
    FROM cargas_open_loads
    WHERE distancia_km IS NOT NULL
      AND distancia_km::numeric > 0
      AND btrim(${norm('origem')}) = ${o}
      AND btrim(${norm('destino')}) = ${d}
  `)

  const linhasCargas = cargas as unknown as Array<{ km: string | null; amostras: string }>
  const linhaCargas = linhasCargas[0]
  const kmCargas = linhaCargas?.km ? Number(linhaCargas.km) : null
  if (kmCargas && kmCargas > 0) {
    return {
      km: Math.round(kmCargas * 100) / 100,
      fonte: 'historico_cargas',
      amostras: Number(linhaCargas?.amostras ?? 0),
    }
  }

  return { km: null, fonte: null, amostras: 0 }
}

/** Custo/km vigente hoje para (tipo de veículo, modalidade). Sem linha → null. */
export async function custoKmVigente(
  tipoVeiculo: string,
  modalidade: ModalidadeOportunidade,
): Promise<{ custoKm: number; vigenciaInicio: string; fonteNota: string | null } | null> {
  const linhas = await db.execute<{
    custo_km: string
    vigencia_inicio: string
    fonte_nota: string | null
  }>(sql`
    SELECT custo_km, vigencia_inicio::text AS vigencia_inicio, fonte_nota
    FROM oportunidade_custo_km_v1
    WHERE upper(btrim(tipo_veiculo)) = ${tipoVeiculo.trim().toUpperCase()}
      AND modalidade = ${modalidade}
      AND vigencia_inicio <= CURRENT_DATE
    ORDER BY vigencia_inicio DESC
    LIMIT 1
  `)

  const linha = (
    linhas as unknown as Array<{ custo_km: string; vigencia_inicio: string; fonte_nota: string | null }>
  )[0]
  if (!linha) return null
  const custoKm = Number(linha.custo_km)
  if (!Number.isFinite(custoKm) || custoKm <= 0) return null
  return { custoKm, vigenciaInicio: linha.vigencia_inicio, fonteNota: linha.fonte_nota }
}

export interface EntradaMargem {
  origem: string
  destino: string
  tipoVeiculo: string
  modalidade: ModalidadeOportunidade
  frete: number
  /** Distância informada pelo operador — tem precedência sobre o histórico. */
  distanciaKmManual?: number | null
}

/** O endpoint do DC-565: resolve os insumos e devolve a memória completa. */
export async function calcularMargem(entrada: EntradaMargem): Promise<MemoriaCalculo> {
  const manual = entrada.distanciaKmManual
  const temManual = manual !== null && manual !== undefined && Number.isFinite(manual) && manual > 0

  const distancia = temManual
    ? { km: manual as number, fonte: 'manual' as const, amostras: 0 }
    : await distanciaHistorica(entrada.origem, entrada.destino)

  const custo = await custoKmVigente(entrada.tipoVeiculo, entrada.modalidade)

  return montarMemoria({
    frete: entrada.frete,
    distanciaKm: distancia.km,
    distanciaFonte: distancia.fonte,
    distanciaAmostras: distancia.amostras,
    custoKm: custo?.custoKm ?? null,
    custoVigenciaInicio: custo?.vigenciaInicio ?? null,
    custoFonteNota: custo?.fonteNota ?? null,
  })
}
