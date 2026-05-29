import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ShieldOff } from 'lucide-react'

import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

import { useThresholds, useUpdateThreshold } from '@/hooks/useThresholds'
import { useAuthStore } from '@/stores/useAuthStore'

/**
 * Alert thresholds tab — Phase 6, plan 06-06 (D-19).
 *
 * Global alert thresholds (read by alert engine in 60s in-memory cache).
 * Three numeric values:
 *   - atraso_critico_minutes (0-300)
 *   - desvio_km_threshold    (0.1-50, fractional)
 *   - stop_duration_minutes  (0-120)
 *
 * Read: any authenticated user.
 * Write: admin only — PATCH /api/thresholds/:type per field.
 *
 * Form submits all three in parallel; backend cache is invalidated per-key.
 */

const schema = z.object({
  atrasoCriticoMinutes: z.coerce.number().int().positive().max(300),
  desvioKmThreshold:    z.coerce.number().positive().max(50),
  stopDurationMinutes:  z.coerce.number().int().positive().max(120),
})
type FormData = z.infer<typeof schema>

export function AlertThresholdsTab() {
  const { user: currentUser } = useAuthStore()
  const isAdmin = currentUser?.role === 'admin'

  const { data, isLoading } = useThresholds()
  const updateMutation = useUpdateThreshold()

  const [submitError, setSubmitError] = useState<string | null>(null)
  const [savedAt,     setSavedAt]     = useState<number | null>(null)

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { atrasoCriticoMinutes: 30, desvioKmThreshold: 2, stopDurationMinutes: 15 },
  })

  // Sync form whenever server thresholds load.
  useEffect(() => {
    if (!isLoading) {
      form.reset({
        atrasoCriticoMinutes: Number(data['atraso_critico_minutes'] ?? 30),
        desvioKmThreshold:    Number(data['desvio_km_threshold']    ?? 2),
        stopDurationMinutes:  Number(data['stop_duration_minutes']  ?? 15),
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, data['atraso_critico_minutes'], data['desvio_km_threshold'], data['stop_duration_minutes']])

  async function onSubmit(values: FormData) {
    setSubmitError(null)
    setSavedAt(null)
    try {
      await Promise.all([
        updateMutation.mutateAsync({ type: 'atraso_critico_minutes', value: values.atrasoCriticoMinutes }),
        updateMutation.mutateAsync({ type: 'desvio_km_threshold',    value: values.desvioKmThreshold }),
        updateMutation.mutateAsync({ type: 'stop_duration_minutes',  value: values.stopDurationMinutes }),
      ])
      setSavedAt(Date.now())
    } catch (e: any) {
      setSubmitError(e?.message ?? 'Falha ao salvar thresholds')
    }
  }

  return (
    <Card className="p-5 bg-card">
      <header className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">Limiares de Alerta</h3>
        <p className="text-xs text-muted-foreground">
          Aplicados globalmente pelo motor de alertas. Cache invalida em até 60 segundos após salvar.
        </p>
        {!isAdmin && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldOff className="h-3.5 w-3.5" />
            Apenas administradores podem alterar estes valores
          </p>
        )}
      </header>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField control={form.control} name="atrasoCriticoMinutes" render={({ field }) => (
              <FormItem>
                <FormLabel>Atraso crítico (min)</FormLabel>
                <FormControl>
                  <Input type="number" min={1} max={300} step={1} disabled={!isAdmin} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="desvioKmThreshold" render={({ field }) => (
              <FormItem>
                <FormLabel>Desvio de rota (km)</FormLabel>
                <FormControl>
                  <Input type="number" min={0.1} max={50} step={0.1} disabled={!isAdmin} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="stopDurationMinutes" render={({ field }) => (
              <FormItem>
                <FormLabel>Tempo parado (min)</FormLabel>
                <FormControl>
                  <Input type="number" min={1} max={120} step={1} disabled={!isAdmin} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>

          {submitError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {submitError}
            </div>
          )}
          {savedAt && !submitError && (
            <div className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">
              Salvo com sucesso · cache será invalidado em até 60s
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="submit"
              disabled={!isAdmin || form.formState.isSubmitting || updateMutation.isPending || isLoading}
            >
              {updateMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </Form>
    </Card>
  )
}
