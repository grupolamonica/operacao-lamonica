import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type AssistantData =
  | { kind: 'trips';     rows: Array<{ code: string; clientName: string; riskLevel: string | null; eta: string | null; status: string }> }
  | { kind: 'alerts';    rows: Array<{ id: string; title: string; severity: string; status: string; occurredAt: string }> }
  | { kind: 'breakdown'; rows: Array<{ label: string; primary: number; pct?: number; secondary?: number }>; primaryLabel: string; secondaryLabel?: string }
  | { kind: 'kpi';       metric: string; value: string | number; subtitle?: string }
  | { kind: 'forecast';  total7d: number; trend: string; history: number[]; forecast: number[] }

export interface AssistantResponse {
  answer:      string
  intent:      string
  confidence:  number
  matched?:    string
  data?:       AssistantData
  suggestions: string[]
}

export function useAssistantSuggestions() {
  return useQuery({
    queryKey: ['assistant-suggestions'],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await (api.api.assistant as any).suggestions.get()
      if (error) throw new Error('Failed to load suggestions')
      return (data as { suggestions: string[] }).suggestions
    },
    staleTime: 60 * 60 * 1000,
  })
}

export function useAssistantAsk() {
  return useMutation({
    mutationFn: async (question: string): Promise<AssistantResponse> => {
      const { data, error } = await (api.api.assistant as any).query.post({ question })
      if (error) throw new Error('Failed to ask assistant')
      return data as AssistantResponse
    },
  })
}
