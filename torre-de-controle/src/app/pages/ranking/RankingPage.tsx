import { Trophy, FileText, BarChart3, ShieldAlert, Route, ScrollText } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { StatsCards } from './components/StatsCards'
import { RankingTab } from './components/RankingTab'
import { ViagensTab } from './components/ViagensTab'
import { QualidadeTab } from './components/QualidadeTab'
import { BloqueiosTab } from './components/BloqueiosTab'
import { RotasTab } from './components/RotasTab'
import { LogsTab } from './components/LogsTab'

/**
 * RankingPage — casca navegavel da feature de ranking (PHASE8-RANKING-ROUTE-NAV).
 *
 * Esta e a UNICA edicao deste arquivo no projeto: monta header + StatsCards
 * (4 KPIs reais) + shell de 6 abas shadcn na ordem do ride-rank
 * (Ranking/Viagens/Qualidade/Bloqueios/Rotas/Logs). O conteudo de cada aba
 * vive no seu proprio arquivo em ./components/*Tab.tsx — as waves 3 (08-04..08)
 * preenchem cada stub SEM tocar nesta pagina, evitando conflito no paralelismo.
 *
 * Read-only (CONTEXT D-V2-03): nenhum botao de escrita aqui — avaliar/bloquear
 * e Phase 9.
 *
 * Layout segue o padrao do Torre (Dashboard/Insights): space-y-5 + header
 * text-white. TabsList estilizado no tom Argon (bg-card + hairline) e esticado
 * em 6 colunas iguais.
 */
export function RankingPage() {
  return (
    <div className="space-y-5">
      <header className="pb-4">
        <h1 className="text-2xl font-bold text-white">Ranking</h1>
        <p className="text-sm text-white/70">Avaliação e ranking de motoristas (somente leitura)</p>
      </header>

      <StatsCards />

      <Tabs defaultValue="ranking" className="space-y-4">
        <TabsList
          className="grid w-full grid-cols-2 h-auto bg-card sm:grid-cols-3 lg:grid-cols-6"
          style={{ border: '1px solid var(--border)' }}
        >
          <TabsTrigger value="ranking">
            <Trophy className="h-4 w-4" />
            Ranking
          </TabsTrigger>
          <TabsTrigger value="viagens">
            <FileText className="h-4 w-4" />
            Viagens
          </TabsTrigger>
          <TabsTrigger value="qualidade">
            <BarChart3 className="h-4 w-4" />
            Qualidade
          </TabsTrigger>
          <TabsTrigger value="bloqueios">
            <ShieldAlert className="h-4 w-4" />
            Bloqueios
          </TabsTrigger>
          <TabsTrigger value="rotas">
            <Route className="h-4 w-4" />
            Rotas
          </TabsTrigger>
          <TabsTrigger value="logs">
            <ScrollText className="h-4 w-4" />
            Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ranking">
          <RankingTab />
        </TabsContent>
        <TabsContent value="viagens">
          <ViagensTab />
        </TabsContent>
        <TabsContent value="qualidade">
          <QualidadeTab />
        </TabsContent>
        <TabsContent value="bloqueios">
          <BloqueiosTab />
        </TabsContent>
        <TabsContent value="rotas">
          <RotasTab />
        </TabsContent>
        <TabsContent value="logs">
          <LogsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
