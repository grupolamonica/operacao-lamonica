import { useEffect, useState } from 'react'

/** Relógio que re-renderiza a cada `ms` (default 5s) — para recálculo de ETA/atraso ao vivo. */
export function useNow(ms = 5000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}
