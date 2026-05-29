import { useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, ShieldOff, AlertTriangle } from 'lucide-react'

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from '@/components/ui/form'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/domain/DataTable'

import {
  useGpsProviders, useCreateGpsProvider, useUpdateGpsProvider, useDeleteGpsProvider,
  type GpsProvider,
} from '@/hooks/useGpsProviders'
import { useAuthStore } from '@/stores/useAuthStore'

/**
 * GPS providers tab — Phase 6, plan 06-06 (D-20).
 *
 * Phase 6 ships UI stubs only — actual integration with GPS providers is
 * deferred (Phase 7+). This tab persists provider configs (name, baseUrl,
 * apiKey, isActive) for future use.
 *
 * apiKey is masked server-side as `••••last4` on every response — plaintext
 * never leaves the API.
 */

const schema = z.object({
  name:     z.string().min(1, 'Nome obrigatório').max(100),
  baseUrl:  z.union([z.string().url('URL inválida'), z.literal('')]).optional(),
  apiKey:   z.string().max(500).optional(),
  isActive: z.boolean(),
})
type FormData = z.infer<typeof schema>

export function GpsProvidersTab() {
  const { user: currentUser } = useAuthStore()
  const isAdmin = currentUser?.role === 'admin'

  const { data: providers, isLoading, isError, error } = useGpsProviders()
  const createMutation = useCreateGpsProvider()
  const updateMutation = useUpdateGpsProvider()
  const deleteMutation = useDeleteGpsProvider()

  const [createOpen, setCreateOpen] = useState(false)
  const [editing,    setEditing]    = useState<GpsProvider | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const columns: ColumnDef<GpsProvider>[] = [
    { accessorKey: 'name', header: 'Nome', cell: (i) => <span className="font-medium">{i.getValue<string>()}</span> },
    {
      accessorKey: 'baseUrl',
      header:      'Base URL',
      cell: (i) => {
        const v = i.getValue<string | null>()
        return v ? <span className="font-mono text-xs text-muted-foreground truncate max-w-[280px] inline-block">{v}</span> : <span className="text-muted-foreground">—</span>
      },
    },
    {
      accessorKey: 'apiKey',
      header:      'API Key',
      cell: (i) => {
        const v = i.getValue<string | null>()
        return <span className="font-mono text-xs text-muted-foreground">{v ?? '—'}</span>
      },
    },
    {
      accessorKey: 'isActive',
      header:      'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? 'default' : 'secondary'}>
          {row.original.isActive ? 'Ativo' : 'Inativo'}
        </Badge>
      ),
    },
    {
      accessorKey: 'createdAt',
      header:      'Criado em',
      cell: (i) => {
        const v = i.getValue<string>()
        if (!v) return <span className="text-muted-foreground">—</span>
        try { return <span className="tabular-nums text-muted-foreground">{new Date(v).toLocaleDateString('pt-BR')}</span> }
        catch { return <span className="text-muted-foreground">—</span> }
      },
    },
    {
      id:     'actions',
      header: '',
      cell: ({ row }) => {
        if (!isAdmin) return null
        const p = row.original
        return (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => { setEditing(p); setActionError(null) }}
              aria-label="Editar"
              title="Editar"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={async () => {
                setActionError(null)
                if (!confirm(`Remover provider "${p.name}"?`)) return
                try { await deleteMutation.mutateAsync(p.id) }
                catch (e: any) { setActionError(e?.message ?? 'Falha ao remover') }
              }}
              aria-label="Remover"
              title="Remover"
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        )
      },
    },
  ]

  const toolbar = isAdmin ? (
    <div className="flex items-center gap-2">
      <Button size="sm" onClick={() => { setCreateOpen(true); setActionError(null) }} className="gap-2">
        <Plus className="h-3.5 w-3.5" /> Novo provider
      </Button>
    </div>
  ) : (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <ShieldOff className="h-3.5 w-3.5" />
      Apenas administradores podem configurar providers
    </div>
  )

  return (
    <div className="space-y-3">
      {/* Warning banner — D-20 stub disclaimer */}
      <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning flex items-start gap-2">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          <strong>Stub Phase 6:</strong> este formulário registra a configuração mas não conecta efetivamente
          com o provider. Integração com APIs de GPS será entregue na Phase 7+.
        </span>
      </div>

      {actionError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {actionError}
        </div>
      )}
      {isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {(error as Error)?.message ?? 'Falha ao carregar providers'}
        </div>
      )}

      <DataTable<GpsProvider>
        data={providers}
        columns={columns}
        toolbar={toolbar}
        title="Provedores GPS"
        subtitle={isLoading ? 'Carregando...' : `${providers.length} ${providers.length === 1 ? 'provedor' : 'provedores'}`}
        emptyMessage="Sem provedores GPS configurados"
      />

      <ProviderDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={async (values) => {
          try {
            await createMutation.mutateAsync({
              name:     values.name,
              baseUrl:  values.baseUrl || undefined,
              apiKey:   values.apiKey  || undefined,
              isActive: values.isActive,
            })
            setCreateOpen(false)
          } catch (e: any) { setActionError(e?.message ?? 'Falha ao criar provider') }
        }}
        isSubmitting={createMutation.isPending}
      />

      <ProviderDialog
        mode="edit"
        provider={editing}
        onOpenChange={(v) => { if (!v) setEditing(null) }}
        open={!!editing}
        onSubmit={async (values) => {
          if (!editing) return
          try {
            await updateMutation.mutateAsync({
              id: editing.id,
              patch: {
                name:     values.name,
                baseUrl:  values.baseUrl || undefined,
                // apiKey: only send if user replaced it (non-empty + not the mask)
                apiKey:   values.apiKey && !values.apiKey.startsWith('••••') ? values.apiKey : undefined,
                isActive: values.isActive,
              },
            })
            setEditing(null)
          } catch (e: any) { setActionError(e?.message ?? 'Falha ao atualizar provider') }
        }}
        isSubmitting={updateMutation.isPending}
      />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────────
// Provider dialog (shared by create/edit)
// ────────────────────────────────────────────────────────────────────────────────

function ProviderDialog({
  mode, open, onOpenChange, onSubmit, isSubmitting, provider,
}: {
  mode:         'create' | 'edit'
  open:         boolean
  onOpenChange: (v: boolean) => void
  onSubmit:     (data: FormData) => Promise<void> | void
  isSubmitting: boolean
  provider?:    GpsProvider | null
}) {
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', baseUrl: '', apiKey: '', isActive: true },
    values: provider
      ? { name: provider.name, baseUrl: provider.baseUrl ?? '', apiKey: provider.apiKey ?? '', isActive: provider.isActive }
      : undefined,
  })

  // Reset on close (create mode only).
  if (!open && mode === 'create' && form.formState.isDirty) form.reset()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Novo provider' : 'Editar provider'}</DialogTitle>
          <DialogDescription>
            {mode === 'create' ? 'Configure um novo provedor GPS.' : `${provider?.name ?? ''}`}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(async (v) => { await onSubmit(v); if (mode === 'create') form.reset() })}
            className="space-y-4"
          >
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Nome</FormLabel>
                <FormControl><Input placeholder="Sascar / Onixsat / Autotrac..." {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="baseUrl" render={({ field }) => (
              <FormItem>
                <FormLabel>Base URL</FormLabel>
                <FormControl><Input placeholder="https://api.provider.com" {...field} value={field.value ?? ''} /></FormControl>
                <FormDescription>Opcional. URL base da API do provedor.</FormDescription>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="apiKey" render={({ field }) => (
              <FormItem>
                <FormLabel>API Key</FormLabel>
                <FormControl><Input type="password" placeholder={mode === 'edit' ? 'Deixar vazio para manter atual' : '••••••••'} {...field} value={field.value ?? ''} /></FormControl>
                <FormDescription>
                  {mode === 'edit'
                    ? 'Chave fica mascarada (••••last4). Preencha apenas para substituir.'
                    : 'Chave de autenticação do provedor. Será armazenada cifrada server-side.'}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="isActive" render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <FormControl>
                  <Select value={field.value ? 'true' : 'false'} onValueChange={(v) => field.onChange(v === 'true')}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Ativo</SelectItem>
                      <SelectItem value="false">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Salvando...' : mode === 'create' ? 'Criar' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
