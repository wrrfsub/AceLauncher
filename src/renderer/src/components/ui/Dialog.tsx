import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { IconButton } from './Button'

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 520,
}: {
  open: boolean
  onClose(): void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('input, button:not([aria-label="Close"])')?.focus())
    return () => {
      window.removeEventListener('keydown', onKey)
      prev?.focus()
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40 grid place-items-center p-6">
          <motion.div
            className="absolute inset-0 bg-scrim backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="relative flex max-h-full w-full flex-col overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-card"
            style={{ maxWidth: width }}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98, transition: { duration: 0.12 } }}
            transition={{ type: 'spring', stiffness: 520, damping: 38 }}
          >
            <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-1">
              <div>
                <h2 className="text-base font-semibold tracking-tight">{title}</h2>
                {description && <p className="mt-1 text-[13px] text-text-3">{description}</p>}
              </div>
              <IconButton icon={X} label="Close" size="sm" onClick={onClose} className="-mr-2" />
            </div>
            <div className="min-h-0 overflow-y-auto px-6 py-4">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-line bg-raised/50 px-6 py-3.5">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-xs font-medium text-text-2">
        {label}
        {hint && <span className="font-normal text-text-3">{hint}</span>}
      </span>
      {children}
    </label>
  )
}
