/**
 * CSV format helpers — Excel BR-compatible.
 *
 * - UTF-8 BOM (U+FEFF) prepended to first chunk so Excel BR detects encoding.
 * - Semicolon (`;`) delimiter so Excel BR opens columns correctly without the
 *   user having to run "Import wizard".
 * - Values containing `;`, `"`, or `\n` are wrapped in double quotes and any
 *   embedded `"` is escaped as `""` (RFC 4180).
 *
 * @see CONTEXT D-08 (BOM + ; delim), D-10 (filename pattern)
 * @see RESEARCH lines 295-313 (canonical helpers)
 */

export const BOM = '﻿' // U+FEFF — UTF-8 BOM in source-friendly form

export function formatCsvRow(values: Array<string | number | null | undefined>): string {
  return values
    .map((v) => {
      if (v === null || v === undefined) return ''
      const s = String(v)
      if (s.includes(';') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`
      }
      return s
    })
    .join(';')
}

export function dateStamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`
}
