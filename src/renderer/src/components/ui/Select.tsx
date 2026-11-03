import { AnimatePresence, motion } from 'motion/react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from '../../lib/format'

export interface Option<T extends string> {
  value: T
  label: string
  hint?: string
  icon?: ReactNode
}

/**
 * Listbox dropdown with keyboard support and optional filtering (version pickers have hundreds of
 * entries). The popover flips above the trigger when there's no room below.
 */
export function Select<T extends string>({
  value,
  options,
  onChange,
  placeholder = 'Select…',
  searchable,
  disabled,
  loading,
  className,
  label,
}: {
  value: T | null
  options: Option<NoInfer<T>>[]
  onChange(v: NoInfer<T>): void
  placeholder?: string
  searchable?: boolean
  disabled?: boolean
  loading?: boolean
  className?: string
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [above, setAbove] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options
  }, [options, query])
  const current = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  useLayoutEffect(() => {
    if (!open || !root.current) return
    const r = root.current.getBoundingClientRect()
    setAbove(window.innerHeight - r.bottom < 300 && r.top > window.innerHeight - r.bottom)
    setQuery('')
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
  }, [open])

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const pick = (o: Option<T> | undefined) => {
    if (!o) return
    onChange(o.value)
    setOpen(false)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (['Enter', ' ', 'ArrowDown'].includes(e.key)) {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'Escape') {
      e.stopPropagation()
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(filtered.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pick(filtered[active])
    }
  }

  return (
    <div ref={root} className={cn('no-drag relative', className)} onKeyDown={onKey}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-9 w-full items-center gap-2 rounded-lg border bg-surface px-3 text-left text-[13px] transition-colors disabled:opacity-45',
          open ? 'border-line-strong bg-surface-2' : 'border-line hover:border-line-strong',
        )}
      >
        {current?.icon}
        <span className={cn('min-w-0 flex-1 truncate', !current && 'text-text-3')}>{loading ? 'Loading…' : (current?.label ?? placeholder)}</span>
        {current?.hint && <span className="text-xs text-text-3">{current.hint}</span>}
        <ChevronDown className={cn('size-3.5 shrink-0 text-text-3 transition-transform', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: above ? 4 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            transition={{ duration: 0.14 }}
            className={cn(
              'absolute z-30 w-full min-w-[200px] overflow-hidden rounded-xl border border-line-strong bg-surface-2 shadow-card',
              above ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
            )}
          >
            {searchable && (
              <div className="flex items-center gap-2 border-b border-line px-3">
                <Search className="size-3.5 text-text-3" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setActive(0)
                  }}
                  placeholder="Filter…"
                  className="h-9 w-full bg-transparent text-[13px] outline-none placeholder:text-text-3"
                />
              </div>
            )}
            <div ref={list} role="listbox" className="max-h-64 overflow-y-auto p-1">
              {filtered.length === 0 && <p className="px-3 py-6 text-center text-xs text-text-3">Nothing matches</p>}
              {filtered.map((o, i) => (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  data-index={i}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o)}
                  className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px]', i === active && 'bg-surface-3')}
                >
                  {o.icon}
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="text-[11px] text-text-3">{o.hint}</span>}
                  <Check className={cn('size-3.5 text-accent', o.value !== value && 'invisible')} />
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
