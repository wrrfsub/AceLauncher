import type { Instance, Loader } from '@shared/types'

export const LOADER_NAMES: Record<Loader, string> = {
  vanilla: 'Vanilla',
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge',
  quilt: 'Quilt',
}

export function versionLabel(inst: Pick<Instance, 'minecraft' | 'loader'>): string {
  return inst.loader === 'vanilla' ? inst.minecraft : `${inst.minecraft} · ${LOADER_NAMES[inst.loader]}`
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`
}

export function compact(n: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

export function duration(seconds: number): string {
  if (seconds < 60) return seconds > 0 ? '<1 min' : '0 min'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h ? `${h} h ${m} min` : `${m} min`
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
export function ago(ts: number | string | null): string {
  if (ts === null) return 'Never'
  const t = typeof ts === 'string' ? Date.parse(ts) : ts
  const s = Math.round((t - Date.now()) / 1000)
  const abs = Math.abs(s)
  if (abs < 60) return 'just now'
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute')
  if (abs < 86_400) return rtf.format(Math.round(s / 3600), 'hour')
  if (abs < 86_400 * 30) return rtf.format(Math.round(s / 86_400), 'day')
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function percent(done: number, total: number): number {
  return total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
}

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
