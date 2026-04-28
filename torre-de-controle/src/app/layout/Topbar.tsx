import { Search, Bell, Filter, Calendar, Sun, Moon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useThemeStore } from '@/stores/useThemeStore'

export function Topbar() {
  const { isDark, toggleTheme } = useThemeStore()

  return (
    <header className="flex h-14 items-center gap-4 border-b border-border bg-card px-4 shrink-0">
      <SidebarTrigger />
      <div className="relative flex-1 max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar viagens, motoristas, clientes..."
          className="pl-9 pr-16 h-9 bg-secondary border-border"
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground border border-border rounded px-1.5 py-0.5">⌘K</kbd>
      </div>

      <Button variant="outline" size="sm" className="gap-2 text-xs">
        <Calendar className="h-3.5 w-3.5" />
        20/05/2025 00:00 — 20/05/2025 23:59
      </Button>

      <Button variant="outline" size="sm" className="gap-2 text-xs">
        <Filter className="h-3.5 w-3.5" />
        Filtros
      </Button>

      <button className="relative p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
        <Bell className="h-4 w-4" />
        <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
      </button>

      <button
        onClick={toggleTheme}
        className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Alternar tema"
      >
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs">AS</AvatarFallback>
        </Avatar>
        <div className="flex flex-col leading-tight">
          <span className="text-xs font-semibold text-foreground">Ana Silva</span>
          <span className="text-[10px] text-muted-foreground">Torre de Controle</span>
        </div>
      </div>
    </header>
  )
}
