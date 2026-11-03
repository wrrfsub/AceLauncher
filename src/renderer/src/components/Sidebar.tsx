import { AnimatePresence, motion } from 'motion/react'
import { Boxes, ChevronDown, Compass, Download, House, LoaderCircle, LogIn, Plus, Settings, SquareTerminal, Trash2, TriangleAlert, X } from 'lucide-react'
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { invoke } from '../lib/ipc'
import { cn, percent } from '../lib/format'
import { useApp, type Route } from '../state'
import { Logo } from './Logo'
import { SkinHead } from './SkinHead'
import { Progress } from './ui/controls'
import { useToast } from './ui/Toast'

type NavItem = { page: Route['page']; label: string; icon: ComponentType<{ className?: string }> }

const MAIN_NAV: NavItem[] = [
  { page: 'home', label: 'Play', icon: House },
  { page: 'instances', label: 'Instances', icon: Boxes },
  { page: 'discover', label: 'Discover', icon: Compass },
  { page: 'console', label: 'Console', icon: SquareTerminal },
]

function RailButton({ item, current }: { item: NavItem; current: string }) {
  const { navigate } = useApp()
  const { page, label, icon: Icon } = item
  const active = current === page
  return (
    <button
      onClick={() => navigate({ page } as Route)}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative grid size-10 place-items-center rounded-lg transition-colors',
        active ? 'bg-surface-2 text-accent' : 'text-text-3 hover:bg-surface hover:text-text',
      )}
    >
      {active && <motion.span layoutId="rail-active" className="absolute -left-3 h-5 w-[3px] rounded-r bg-accent" />}
      <Icon className="size-[18px]" />
      <span className="pointer-events-none absolute left-full z-40 ml-3 rounded-md border border-line-strong bg-surface-2 px-2 py-1 text-xs whitespace-nowrap text-text opacity-0 shadow-card transition-opacity group-hover:opacity-100">
        {label}
      </span>
    </button>
  )
}

/** Narrow icon rail, the common shape for game launchers: the content gets the room. */
export function Sidebar() {
  const { route, info } = useApp()
  const current = route.page === 'instance' ? 'instances' : route.page
  return (
    <aside className="flex w-16 shrink-0 flex-col items-center border-r border-line bg-raised pb-3">
      <div className={cn('drag grid h-12 w-full shrink-0 place-items-center', info.platform === 'darwin' && 'mt-6')}>
        <Logo size={26} />
      </div>
      <nav className="mt-3 flex flex-col gap-1.5">
        {MAIN_NAV.map((item) => (
          <RailButton key={item.page} item={item} current={current} />
        ))}
      </nav>
      <div className="mt-auto">
        <RailButton item={{ page: 'settings', label: 'Settings', icon: Settings }} current={current} />
      </div>
    </aside>
  )
}

/** Click-away popover anchored under a trigger in the top bar. */
function Popover({ trigger, children, width = 280 }: { trigger(open: boolean, toggle: () => void): ReactNode; children(close: () => void): ReactNode; width?: number }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <div ref={root} className="no-drag relative">
      {trigger(open, () => setOpen((o) => !o))}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2, transition: { duration: 0.08 } }}
            transition={{ duration: 0.14 }}
            style={{ width }}
            className="absolute top-full right-0 z-40 mt-2 overflow-hidden rounded-lg border border-line-strong bg-surface-2 p-1 shadow-card"
          >
            {children(() => setOpen(false))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Downloads indicator: a spinner while anything installs, the task list on click. */
export function TaskButton() {
  const { tasks, act } = useApp()
  const running = tasks.filter((t) => t.state === 'running')
  const failed = tasks.some((t) => t.state === 'error')
  if (tasks.length === 0) return null
  return (
    <Popover
      width={300}
      trigger={(open, toggle) => (
        <button
          onClick={toggle}
          aria-label="Downloads"
          className={cn('relative grid size-8 place-items-center rounded-md text-text-2 hover:bg-surface-2 hover:text-text', open && 'bg-surface-2 text-text')}
        >
          {running.length ? <LoaderCircle className="size-4 animate-spin text-accent" /> : <Download className="size-4" />}
          {failed && <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-danger" />}
        </button>
      )}
    >
      {() => (
        <ul className="flex flex-col gap-1 p-1">
          {tasks.map((t) => (
            <li key={t.id} className="rounded-md p-2 hover:bg-surface-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{t.title}</p>
                  <p className={cn('mt-0.5 truncate text-[11px]', t.state === 'error' ? 'text-danger' : 'text-text-3')} title={t.error ?? t.stage}>
                    {t.state === 'error' ? t.error : t.state === 'done' ? 'Done' : t.state === 'cancelled' ? 'Cancelled' : t.stage}
                  </p>
                </div>
                {t.state === 'running' && (
                  <button onClick={() => act(() => invoke('tasks:cancel', t.id))} className="text-text-3 hover:text-text" aria-label="Cancel">
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              {t.state === 'running' && <Progress className="mt-2" value={percent(t.progress, t.total)} indeterminate={!t.total} />}
            </li>
          ))}
        </ul>
      )}
    </Popover>
  )
}

export function AccountMenu() {
  const { accounts, info, act, navigate } = useApp()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const active = accounts.find((a) => a.active)

  const signIn = async (close?: () => void) => {
    close?.()
    if (!info.authConfigured) {
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
  }

  if (accounts.length === 0) {
    return (
      <button
        onClick={() => signIn()}
        disabled={busy}
        className="no-drag flex h-8 items-center gap-2 rounded-md bg-surface-2 px-3 text-[13px] font-medium hover:bg-surface-3 disabled:opacity-50"
      >
        <LogIn className="size-[15px] text-accent" />
        {busy ? 'Waiting for Microsoft…' : 'Sign in'}
      </button>
    )
  }

  return (
    <Popover
      width={240}
      trigger={(open, toggle) => (
        <button onClick={toggle} className={cn('flex h-8 items-center gap-2 rounded-md pr-2 pl-1 hover:bg-surface-2', open && 'bg-surface-2')}>
          <SkinHead skinUrl={active?.skinUrl ?? null} size={24} className="rounded" />
          <span className="max-w-36 truncate text-[13px] font-medium">{active?.name ?? 'Choose account'}</span>
          {active?.needsReauth && <TriangleAlert className="size-3.5 text-warn" aria-label="Needs sign-in" />}
          <ChevronDown className="size-3.5 text-text-3" />
        </button>
      )}
    >
      {(close) => (
        <>
          {accounts.map((a) => (
            <div key={a.id} className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-surface-3">
              <button className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => act(() => invoke('accounts:select', a.id)).then(close)}>
                <SkinHead skinUrl={a.skinUrl} size={22} className="rounded" />
                <span className="min-w-0 flex-1 truncate text-[13px]">{a.name}</span>
                {a.needsReauth && <TriangleAlert className="size-3.5 text-warn" aria-label="Needs sign-in" />}
                {a.active && <span className="size-1.5 rounded-full bg-accent" aria-label="Active" />}
              </button>
              <button className="text-text-3 opacity-0 group-hover:opacity-100 hover:text-danger" aria-label={`Remove ${a.name}`} onClick={() => act(() => invoke('accounts:remove', a.id))}>
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          <div className="my-1 h-px bg-line" />
          <button
            onClick={() => signIn(close)}
            disabled={busy}
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] text-text-2 hover:bg-surface-3 hover:text-text disabled:opacity-50"
          >
            <Plus className="size-4" />
            {busy ? 'Waiting for Microsoft…' : 'Add Microsoft account'}
          </button>
        </>
      )}
    </Popover>
  )
}
