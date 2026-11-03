import { motion } from 'motion/react'
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/format'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { leading?: ReactNode }>(function Input(
  { className, leading, ...rest },
  ref,
) {
  return (
    <div
      className={cn(
        'no-drag flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 transition-colors focus-within:border-line-strong focus-within:bg-surface-2',
        className,
      )}
    >
      {leading && <span className="shrink-0 text-text-3">{leading}</span>}
      <input ref={ref} className="h-full w-full min-w-0 bg-transparent text-[13px] outline-none placeholder:text-text-3" {...rest} />
    </div>
  )
})

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange(v: boolean): void; label: string; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'no-drag relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors disabled:opacity-40',
        checked ? 'bg-accent' : 'bg-surface-3',
      )}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 700, damping: 40 }}
        className={cn('absolute top-[3px] size-4 rounded-full shadow-sm', checked ? 'right-[3px] bg-accent-ink' : 'left-[3px] bg-text-2')}
      />
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T
  options: Array<{ value: NoInfer<T>; label: string; disabled?: boolean }>
  onChange(v: NoInfer<T>): void
  size?: 'sm' | 'md'
}) {
  const id = useId()
  return (
    <div className={cn('no-drag inline-flex rounded-lg border border-line bg-surface p-0.5', size === 'sm' ? 'h-8' : 'h-9')} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            'relative rounded-md px-3 text-[13px] font-medium transition-colors disabled:opacity-35',
            value === o.value ? 'text-text' : 'text-text-3 hover:text-text-2',
          )}
        >
          {value === o.value && (
            <motion.span layoutId={id} className="absolute inset-0 rounded-md bg-surface-3" transition={{ type: 'spring', stiffness: 600, damping: 45 }} />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

export function Tabs<T extends string>({ value, tabs, onChange }: { value: T; tabs: Array<{ value: NoInfer<T>; label: string; count?: number }>; onChange(v: NoInfer<T>): void }) {
  const id = useId()
  return (
    <div className="flex gap-5 border-b border-line" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn('relative pb-2.5 text-[13px] font-medium transition-colors', value === t.value ? 'text-text' : 'text-text-3 hover:text-text-2')}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 text-text-3 tabular-nums">{t.count}</span>}
          {value === t.value && <motion.span layoutId={id} className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent" />}
        </button>
      ))}
    </div>
  )
}

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  label,
}: {
  value: number
  min: number
  max: number
  step: number
  onChange(v: number): void
  label: string
}) {
  const fill = `${((value - min) / (max - min)) * 100}%`
  return (
    <input
      type="range"
      aria-label={label}
      className="no-drag w-full"
      style={{ ['--fill' as string]: fill }}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}

export function Progress({ value, indeterminate, className }: { value: number; indeterminate?: boolean; className?: string }) {
  return (
    <div className={cn('relative h-1 overflow-hidden rounded-full bg-surface-3', className)} role="progressbar" aria-valuenow={indeterminate ? undefined : value}>
      {indeterminate ? (
        <motion.div
          className="absolute inset-y-0 w-1/3 rounded-full bg-accent"
          animate={{ left: ['-33%', '100%'] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
        />
      ) : (
        <motion.div className="h-full rounded-full bg-accent" animate={{ width: `${value}%` }} transition={{ duration: 0.3, ease: 'easeOut' }} />
      )}
    </div>
  )
}

export function Badge({ children, tone = 'default', className }: { children: ReactNode; tone?: 'default' | 'accent' | 'warn' | 'danger'; className?: string }) {
  const tones = {
    default: 'bg-surface-3 text-text-2',
    accent: 'bg-accent/14 text-accent',
    warn: 'bg-warn/14 text-warn',
    danger: 'bg-danger/14 text-danger',
  }
  return <span className={cn('inline-flex h-5 items-center rounded-md px-1.5 text-[11px] font-medium', tones[tone], className)}>{children}</span>
}

/** Label + description on the left, a control on the right: the building block of settings forms. */
export function Row({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-8 py-4">
      <div className="min-w-0">
        <p className="text-[13px] font-medium">{title}</p>
        {description && <p className="mt-0.5 text-xs text-text-3">{description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 grid size-11 place-items-center rounded-xl border border-line bg-surface text-text-3">{icon}</div>
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="mt-1.5 max-w-sm text-[13px] text-text-3">{children}</div>}
    </div>
  )
}
