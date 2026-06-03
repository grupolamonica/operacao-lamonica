import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/useAuthStore'

export function LoginPage() {
  const [email, setEmail]       = useState(import.meta.env.DEV ? 'antonio.magalhaes@grupolamonica.com.br' : '')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const { login, isLoading }    = useAuthStore()
  const navigate                = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const err = await login(email, password)
    if (err) { setError(err); return }
    navigate('/dashboard', { replace: true })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--sidebar-bg)]">
      <div className="w-full max-w-sm bg-card rounded-xl shadow-lg p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Torre de Controle</h1>
          <p className="text-sm text-muted-foreground mt-1">Monitoramento de Entregas</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Senha</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isLoading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        {import.meta.env.DEV && (
          <p className="text-xs text-center text-muted-foreground">
            Dev: antonio.magalhaes@grupolamonica.com.br
          </p>
        )}
      </div>
    </div>
  )
}
