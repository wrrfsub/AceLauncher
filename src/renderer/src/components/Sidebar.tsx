import { AnimatePresence, motion } from 'motion/react'
import { Boxes, Compass, House, LogIn, Plus, Settings, SquareTerminal, Trash2, TriangleAlert, X } from 'lucide-react'
import { useEffect, useRef, useState, type ComponentType } from 'react'
import { invoke } from '../lib/ipc'
import { cn, percent } from '../lib/format'
import { useApp, type Route } from '../state'
import { Logo } from './Logo'
import { SkinHead } from './SkinHead'
import { Progress } from './ui/controls'
import { useToast } from './ui/Toast'

type NavItem = { page: Route['page']; label: string; icon: ComponentType<{ className?: string }> }

const MAIN_NAV: NavItem[] = [
  { page: 'home', label: 'Home', icon: House },
  { page: 'instances', label: 'Instances', icon: Boxes },
  { page: 'discover', label: 'Discover', icon: Compass },
  { page: 'console', label: 'Console', icon: SquareTerminal },
]

function NavButton({ item, current }: { item: NavItem; current: string }) {
  const { navigate, instances } = useApp()
  const { page, label, icon: Icon } = item
  const active = current === page
  return (
    <button
      onClick={() => navigate({ page } as Route)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors',
        active ? 'font-medium text-text' : 'text-text-2 hover:bg-surface hover:text-text',
      )}
    >
      {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-md bg-surface-2" transition={{ type: 'spring', stiffness: 600, damping: 45 }} />}
      <Icon className={cn('relative size-[15px]', active ? 'text-accent' : 'text-text-3')} />
      <span className="relative">{label}</span>
      {page === 'instances' && instances.length > 0 && <span className="relative ml-auto text-[11px] text-text-3 tabular-nums">{instances.length}</span>}
    </button>
  )
}

export function Sidebar() {
  const { route, info } = useApp()
  const current = route.page === 'instance' ? 'instances' : route.page
  return (
    <aside className="flex w-[208px] shrink-0 flex-col border-r border-line bg-raised">
      <div className={cn('drag flex h-11 shrink-0 items-center gap-2 px-4', info.platform === 'darwin' && 'mt-6')}>
        <Logo size={20} />
        <span className="text-[13px] font-semibold">Ace Launcher</span>
      </div>

      <nav className="mt-2 flex flex-col gap-px px-2">
        {MAIN_NAV.map((item) => (
          <NavButton key={item.page} item={item} current={current} />
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-2 p-2">
        <TaskTray />
        <NavButton item={{ page: 'settings', label: 'Settings', icon: Settings }} current={current} />
        <div className="h-px bg-line" />
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
          className="rounded-lg border border-line bg-surface p-2.5"
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
  const { accounts, info, act, navigate } = useApp()
  const toast = useToast()
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
    if (!info.authConfigured) {
      setOpen(false)
      navigate({ page: 'settings' })
      toast.show({
        tone: 'info',
        title: 'Microsoft sign-in needs an Azure client ID',
        description: 'Paste it under Settings → Advanced. The README explains how to register one with Microsoft and get it approved by Mojang.',
      })
      return
    }
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
            className="absolute bottom-full left-0 z-30 mb-2 w-full overflow-hidden rounded-lg border border-line-strong bg-surface-2 p-1 shadow-card"
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
        <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-surface">
          <SkinHead skinUrl={active.skinUrl} size={26} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{active.name}</p>
            <p className={cn('text-[11px]', active.needsReauth ? 'text-warn' : 'text-text-3')}>{active.needsReauth ? 'Sign in again' : 'Microsoft account'}</p>
          </div>
        </button>
      ) : (
        <button
          onClick={accounts.length ? () => setOpen((o) => !o) : signIn}
          disabled={busy}
          className="flex h-9 w-full items-center gap-2.5 rounded-md bg-surface px-2.5 text-left text-[13px] text-text-2 hover:bg-surface-2 hover:text-text disabled:opacity-50"
        >
          <LogIn className="size-[15px] text-accent" />
          {busy ? 'Waiting for Microsoft…' : 'Sign in to play'}
        </button>
      )}
    </div>
  )
}
