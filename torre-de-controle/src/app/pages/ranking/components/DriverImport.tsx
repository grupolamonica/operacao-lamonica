import { useRef, useState } from 'react'
import { Upload, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import * as XLSX from 'xlsx'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useImportDrivers } from '@/hooks/useRanking'

/**
 * DriverImport — import (upsert) drivers from an .xlsx/.csv sheet (Phase 9 write,
 * plan 09-07 parity restore). Ported from ride-rank DriverImport: parse client-side
 * with SheetJS, POST to /api/ranking/drivers/import (role-gated admin|supervisor).
 *
 * Rendered only when useCanWriteRanking() is true (the toolbar gates it). Status is
 * shown inline (Torre has no toast); the hook invalidates ['ranking','drivers'|...].
 */

interface ParsedDriver {
  driver_id: string
  driver_name: string
}

function parseFile(file: File): Promise<ParsedDriver[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target?.result, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)
        if (rows.length === 0) {
          reject(new Error('Planilha vazia'))
          return
        }
        const keys = Object.keys(rows[0])
        const idCol = keys.find((k) => k.toLowerCase().replace(/[^a-z]/g, '').includes('driverid'))
        const nameCol = keys.find((k) => k.toLowerCase().replace(/[^a-z]/g, '').includes('drivername'))
        if (!idCol || !nameCol) {
          reject(new Error('Colunas obrigatórias não encontradas: "Driver ID" e "Driver Name"'))
          return
        }
        const drivers: ParsedDriver[] = []
        for (const row of rows) {
          const id = String(row[idCol] ?? '').trim()
          const name = String(row[nameCol] ?? '').trim()
          if (id && name) drivers.push({ driver_id: id, driver_name: name })
        }
        resolve(drivers)
      } catch {
        reject(new Error('Erro ao processar arquivo'))
      }
    }
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'))
    reader.readAsArrayBuffer(file)
  })
}

export function DriverImport() {
  const [open, setOpen] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [result, setResult] = useState<{ count: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const importDrivers = useImportDrivers()

  async function handleFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'xlsx' && ext !== 'csv') {
      setLocalError('Formato inválido — aceita apenas .xlsx ou .csv')
      return
    }
    setParsing(true)
    setLocalError(null)
    setResult(null)
    try {
      const drivers = await parseFile(file)
      if (drivers.length === 0) {
        setLocalError('Nenhum motorista encontrado na planilha.')
        return
      }
      const res = await importDrivers.mutateAsync(drivers)
      setResult({ count: res.count })
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setParsing(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const busy = parsing || importDrivers.isPending
  const error = localError ?? (importDrivers.isError ? importDrivers.error?.message ?? null : null)

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-xs"
        onClick={() => setOpen(true)}
      >
        <Upload className="h-3.5 w-3.5" /> Importar Motoristas
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) {
            setResult(null)
            setLocalError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Importar Planilha de Motoristas</DialogTitle>
            <DialogDescription>
              Envie um arquivo .xlsx ou .csv com as colunas <strong>Driver ID</strong> e{' '}
              <strong>Driver Name</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div
              className="rounded-lg border-2 border-dashed p-6 text-center"
              style={{ borderColor: 'var(--border)' }}
            >
              {busy ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Processando…</p>
                </div>
              ) : result ? (
                <div className="flex flex-col items-center gap-2">
                  <CheckCircle className="h-8 w-8 text-emerald-500" />
                  <p className="text-sm font-medium">{result.count} motoristas importados</p>
                  <Button variant="gradient-primary" size="sm" onClick={() => setResult(null)}>
                    Importar outra
                  </Button>
                </div>
              ) : (
                <label className="flex cursor-pointer flex-col items-center gap-2">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Clique para selecionar o arquivo</p>
                  <p className="text-xs text-muted-foreground">.xlsx ou .csv</p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) handleFile(f)
                    }}
                  />
                </label>
              )}
            </div>

            {error && (
              <div
                className="flex items-start gap-2 rounded-md p-3 text-xs text-destructive"
                style={{ background: 'var(--accent)' }}
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <div
              className="flex items-start gap-2 rounded-md p-3 text-xs text-muted-foreground"
              style={{ background: 'var(--accent)' }}
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Os nomes importados substituem os nomes originais da planilha de viagens para os
                Driver IDs correspondentes.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
