import { AnimatePresence, motion } from 'motion/react'
import { Boxes, Compass, House, LogIn, Plus, Settings, SquareTerminal, Trash2, TriangleAlert, X } from 'lucide-react'
import { useEffect, useRef, useState, type ComponentType } from 'react'
import { invoke } from '../lib/ipc'
import { cn, percent } from '../lib/format'
import { useApp, type Route } from '../state'
import { Logo } from './Logo'
import { SkinHead } from './SkinHead'
import { Progress } from './ui/controls'

const NAV: Array<{ page: Route['page']; label: string; icon: ComponentType<{ className?: string }> }> = [
  { page: 'home', label: 'Home', icon: House },
  { page: 'instances', label: 'Instances', icon: Boxes },
  { page: 'discover', label: 'Discover', icon: Compass },
  { page: 'console', label: 'Console', icon: SquareTerminal },
  { page: 'settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const { route, navigate, info } = useApp()
  const current = route.page === 'instance' ? 'instances' : route.page
  return (
    <aside className="flex w-[228px] shrink-0 flex-col border-r border-line bg-raised">
      <div className={cn('drag flex h-14 items-center gap-2.5 px-4', info.platform === 'darwin' && 'mt-7')}>
        <Logo size={26} />
        <span className="text-[15px] font-semibold tracking-tight">Ace Launcher</span>
      </div>

      <nav className="mt-2 flex flex-col gap-0.5 px-2.5">
        {NAV.map(({ page, label, icon: Icon }) => (
          <button
            key={page}
            onClick={() => navigate({ page } as Route)}
            className={cn(
              'relative flex h-9 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors',
              current === page ? 'text-text' : 'text-text-3 hover:bg-surface hover:text-text-2',
            )}
          >
            {current === page && (
              <motion.span
                layoutId="nav-active"
                className="absolute inset-0 rounded-lg bg-surface-2"
                transition={{ type: 'spring', stiffness: 600, damping: 45 }}
              />
            )}
            <Icon className={cn('relative size-4', current === page && 'text-accent')} />
            <span className="relative">{label}</span>
          </button>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-2 p-2.5">
        <TaskTray />
        <AccountMenu />
      </div>
    </aside>
  )
}

function TaskTray() {
  const { tasks, act } = useApp()
  const visible = tasks.filter((t) => t.state !== 'done' || Date.now() - t.startedAt < 60_000).slice(-3)
  return (
    <AnimatePresence initial={false}>
      {visible.map((t) => (
        <motion.div
          key={t.id}
          layout
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0, marginTop: -8 }}
          className="rounded-xl border border-line bg-surface p-3"
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{t.title}</p>
              <p className={cn('mt-0.5 truncate text-[11px]', t.state === 'error' ? 'text-danger' : 'text-text-3')} title={t.error ?? t.stage}>
                {t.state === 'error' ? t.error : t.state === 'done' ? 'Done' : t.state === 'cancelled' ? 'Cancelled' : t.stage}
              </p>
            </div>
            {t.state === 'running' && (
              <button onClick={() => act(() => invoke('tasks:cancel', t.id))} className="text-text-3 hover:text-text" aria-label="Cancel task">
                <X className="size-3.5" />
              </button>
            )}
          </div>
          {t.state === 'running' && <Progress className="mt-2.5" value={percent(t.progress, t.total)} indeterminate={!t.total} />}
        </motion.div>
      ))}
    </AnimatePresence>
  )
}

function AccountMenu() {
  const { accounts, info, act } = useApp()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const active = accounts.find((a) => a.active)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const signIn = async () => {
    setBusy(true)
    await act(() => invoke('accounts:login'))
    setBusy(false)
    setOpen(false)
  }

  return (
    <div ref={root} className="relative">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4, transition: { duration: 0.1 } }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-0 z-30 mb-2 w-full overflow-hidden rounded-xl border border-line-strong bg-surface-2 p-1 shadow-card"
          >
            {accounts.map((a) => (
              <div key={a.id} className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-3">
                <button className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => act(() => invoke('accounts:select', a.id)).then(() => setOpen(false))}>
                  <SkinHead skinUrl={a.skinUrl} size={22} />
                  <span className="min-w-0 flex-1 truncate text-[13px]">{a.name}</span>
                  {a.needsReauth && <TriangleAlert className="size-3.5 text-warn" aria-label="Needs sign-in" />}
                  {a.active && <span className="size-1.5 rounded-full bg-accent" aria-label="Active" />}
                </button>
                <button
                  className="text-text-3 opacity-0 group-hover:opacity-100 hover:text-danger"
                  aria-label={`Remove ${a.name}`}
                  onClick={() => act(() => invoke('accounts:remove', a.id))}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
            {accounts.length > 0 && <div className="my-1 h-px bg-line" />}
            <button
              onClick={signIn}
              disabled={busy}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] text-text-2 hover:bg-surface-3 hover:text-text disabled:opacity-50"
            >
              <Plus className="size-4" />
              {busy ? 'Waiting for Microsoft…' : 'Add Microsoft account'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {active ? (
        <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-surface">
          <SkinHead skinUrl={active.skinUrl} size={30} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{active.name}</p>
            <p className={cn('text-[11px]', active.needsReauth ? 'text-warn' : 'text-text-3')}>{active.needsReauth ? 'Sign in again' : 'Microsoft account'}</p>
          </div>
        </button>
      ) : (
        <button
          onClick={accounts.length ? () => setOpen((o) => !o) : signIn}
          disabled={busy || !info.authConfigured}
          title={info.authConfigured ? undefined : 'Set an Azure client id in Settings → Advanced'}
          className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-line-strong px-3 py-2.5 text-left text-[13px] text-text-2 hover:border-text-3 hover:text-text disabled:opacity-50"
        >
          <LogIn className="size-4" />
          {busy ? 'Waiting for Microsoft…' : 'Sign in to play'}
        </button>
      )}
    </div>
  )
}
