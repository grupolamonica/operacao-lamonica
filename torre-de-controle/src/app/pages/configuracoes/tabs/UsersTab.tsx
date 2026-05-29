import { useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, UserX, ShieldOff } from 'lucide-react'

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/domain/DataTable'

import {
  useUsers, useCreateUser, useUpdateUser, useDeactivateUser,
  type User, type UserRole,
} from '@/hooks/useUsers'
import { useAuthStore } from '@/stores/useAuthStore'

/**
 * Users tab — Phase 6, plan 06-06 (D-18).
 *
 * - Admin: CRUD via DataTable + dialog forms.
 * - Non-admin: read-only view (no create/edit/deactivate controls).
 * - Soft delete only (server enforces — DELETE endpoint sets isActive=false).
 */

const createSchema = z.object({
  name:     z.string().min(1, 'Nome obrigatório').max(100),
  email:    z.string().email('Email inválido'),
  role:     z.enum(['admin', 'supervisor', 'analyst', 'viewer']),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
})
type CreateFormData = z.infer<typeof createSchema>

const editSchema = z.object({
  role:     z.enum(['admin', 'supervisor', 'analyst', 'viewer']),
  isActive: z.boolean(),
})
type EditFormData = z.infer<typeof editSchema>

const roleLabel: Record<UserRole, string> = {
  admin:      'Admin',
  supervisor: 'Supervisor',
  analyst:    'Analista',
  viewer:     'Visualizador',
}

export function UsersTab() {
  const { user: currentUser } = useAuthStore()
  const isAdmin = currentUser?.role === 'admin'

  const { data: users, isLoading, isError, error } = useUsers()
  const createMutation     = useCreateUser()
  const updateMutation     = useUpdateUser()
  const deactivateMutation = useDeactivateUser()

  const [createOpen, setCreateOpen] = useState(false)
  const [editing,    setEditing]    = useState<User | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const columns: ColumnDef<User>[] = [
    { accessorKey: 'name',  header: 'Nome',  cell: (i) => <span className="font-medium">{i.getValue<string>()}</span> },
    { accessorKey: 'email', header: 'Email', cell: (i) => <span className="text-muted-foreground">{i.getValue<string>()}</span> },
    {
      accessorKey: 'role',
      header:      'Perfil',
      cell: ({ row }) => <Badge variant="outline">{roleLabel[row.original.role]}</Badge>,
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
      cell:   ({ row }) => {
        if (!isAdmin) return null
        const u = row.original
        return (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => { setEditing(u); setActionError(null) }}
              aria-label="Editar"
              title="Editar"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {u.isActive && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={async () => {
                  setActionError(null)
                  if (!confirm(`Desativar usuário "${u.name}"?`)) return
                  try { await deactivateMutation.mutateAsync(u.id) }
                  catch (e: any) { setActionError(e?.message ?? 'Falha ao desativar') }
                }}
                aria-label="Desativar"
                title="Desativar"
              >
                <UserX className="h-3.5 w-3.5 text-destructive" />
              </Button>
            )}
          </div>
        )
      },
    },
  ]

  const toolbar = isAdmin ? (
    <div className="flex items-center gap-2">
      <Button size="sm" onClick={() => { setCreateOpen(true); setActionError(null) }} className="gap-2">
        <Plus className="h-3.5 w-3.5" /> Novo usuário
      </Button>
    </div>
  ) : (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <ShieldOff className="h-3.5 w-3.5" />
      Apenas administradores podem criar/editar usuários
    </div>
  )

  return (
    <div className="space-y-3">
      {actionError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {actionError}
        </div>
      )}
      {isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {(error as Error)?.message ?? 'Falha ao carregar usuários'}
        </div>
      )}

      <DataTable<User>
        data={users}
        columns={columns}
        toolbar={toolbar}
        title="Usuários"
        subtitle={isLoading ? 'Carregando...' : `${users.length} ${users.length === 1 ? 'usuário' : 'usuários'}`}
        emptyMessage="Sem usuários cadastrados"
      />

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={async (values) => {
          try {
            await createMutation.mutateAsync(values)
            setCreateOpen(false)
          } catch (e: any) { setActionError(e?.message ?? 'Falha ao criar usuário') }
        }}
        isSubmitting={createMutation.isPending}
      />

      <EditUserDialog
        user={editing}
        onClose={() => setEditing(null)}
        onSubmit={async (id, patch) => {
          try {
            await updateMutation.mutateAsync({ id, patch })
            setEditing(null)
          } catch (e: any) { setActionError(e?.message ?? 'Falha ao atualizar usuário') }
        }}
        isSubmitting={updateMutation.isPending}
      />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────────
// Create dialog
// ────────────────────────────────────────────────────────────────────────────────

function CreateUserDialog({
  open, onOpenChange, onSubmit, isSubmitting,
}: {
  open:         boolean
  onOpenChange: (v: boolean) => void
  onSubmit:     (data: CreateFormData) => Promise<void> | void
  isSubmitting: boolean
}) {
  const form = useForm<CreateFormData>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: '', email: '', role: 'viewer', password: '' },
  })

  // Reset whenever the dialog opens.
  if (!open && form.formState.isDirty) form.reset()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>Crie um usuário com perfil de acesso.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(async (v) => { await onSubmit(v); form.reset() })} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Nome</FormLabel>
                <FormControl><Input placeholder="João Silva" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl><Input type="email" placeholder="joao@empresa.com" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="role" render={({ field }) => (
              <FormItem>
                <FormLabel>Perfil</FormLabel>
                <FormControl>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                      <SelectItem value="analyst">Analista</SelectItem>
                      <SelectItem value="viewer">Visualizador</SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="password" render={({ field }) => (
              <FormItem>
                <FormLabel>Senha</FormLabel>
                <FormControl><Input type="password" placeholder="Mínimo 6 caracteres" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Criando...' : 'Criar usuário'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// ────────────────────────────────────────────────────────────────────────────────
// Edit dialog
// ────────────────────────────────────────────────────────────────────────────────

function EditUserDialog({
  user, onClose, onSubmit, isSubmitting,
}: {
  user:         User | null
  onClose:      () => void
  onSubmit:     (id: string, patch: EditFormData) => Promise<void> | void
  isSubmitting: boolean
}) {
  const form = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    defaultValues: { role: 'viewer', isActive: true },
    values: user ? { role: user.role, isActive: user.isActive } : undefined,
  })

  return (
    <Dialog open={!!user} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuário</DialogTitle>
          <DialogDescription>{user?.name} · {user?.email}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(async (v) => { if (user) await onSubmit(user.id, v) })} className="space-y-4">
            <FormField control={form.control} name="role" render={({ field }) => (
              <FormItem>
                <FormLabel>Perfil</FormLabel>
                <FormControl>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                      <SelectItem value="analyst">Analista</SelectItem>
                      <SelectItem value="viewer">Visualizador</SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
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
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
