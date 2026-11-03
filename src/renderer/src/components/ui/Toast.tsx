import { AnimatePresence, motion } from 'motion/react'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type Tone = 'ok' | 'error' | 'info'
interface Toast {
  id: number
  tone: Tone
  title: string
  description?: string
}

interface ToastApi {
  show(t: Omit<Toast, 'id'>): void
}

const Ctx = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast outside ToastProvider')
  return ctx
}

const ICONS = { ok: CircleCheck, error: CircleAlert, info: Info }
const TONE = { ok: 'text-ok', error: 'text-danger', info: 'text-text-2' }

let next = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const api = useMemo<ToastApi>(
    () => ({
      show(t) {
        const id = next++
        setToasts((list) => [...list.slice(-3), { ...t, id }])
        setTimeout(() => dismiss(id), t.tone === 'error' ? 8000 : 4000)
      },
    }),
    [dismiss],
  )

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-5 bottom-5 z-50 flex w-[360px] flex-col gap-2" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const Icon = ICONS[t.tone]
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24, transition: { duration: 0.15 } }}
                transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                className="pointer-events-auto flex items-start gap-3 rounded-xl border border-line-strong bg-surface-2 px-3.5 py-3 shadow-card"
                role={t.tone === 'error' ? 'alert' : 'status'}
              >
                <Icon className={`mt-px size-4 shrink-0 ${TONE[t.tone]}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-snug font-medium selectable">{t.title}</p>
                  {t.description && <p className="mt-0.5 text-xs text-text-2 selectable">{t.description}</p>}
                </div>
                <button onClick={() => dismiss(t.id)} className="text-text-3 hover:text-text" aria-label="Dismiss">
                  <X className="size-3.5" />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}
