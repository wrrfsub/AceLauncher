import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Account, Activity, AppInfo, GameStatus, Instance, ProjectType, Settings, Task } from '@shared/types'
import { ace, invoke } from './lib/ipc'
import { useToast } from './components/ui/Toast'

export type Route =
  | { page: 'home' }
  | { page: 'instances' }
  | { page: 'instance'; id: string; tab?: 'content' | 'settings' }
  | { page: 'discover'; instanceId?: string; type?: ProjectType }
  | { page: 'console'; instanceId?: string }
  | { page: 'settings' }

interface AppContext {
  info: AppInfo
  settings: Settings
  instances: Instance[]
  accounts: Account[]
  tasks: Task[]
  statuses: Record<string, GameStatus>
  activity: Activity[]
  route: Route
  navigate(route: Route): void
  updateSettings(patch: Partial<Settings>): Promise<void>
  /** Runs an action, turning failures into an error toast. Resolves undefined on failure. */
  act<T>(fn: () => Promise<T>, success?: string): Promise<T | undefined>
}

const Ctx = createContext<AppContext | null>(null)

export function useApp(): AppContext {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp outside AppProvider')
  return ctx
}

interface Loaded {
  info: AppInfo
  settings: Settings
  instances: Instance[]
  accounts: Account[]
  tasks: Task[]
  statuses: GameStatus[]
  activity: Activity[]
}

async function loadAll(): Promise<Loaded> {
  const [info, settings, instances, accounts, tasks, statuses, activity] = await Promise.all([
    invoke('app:info'),
    invoke('settings:get'),
    invoke('instances:list'),
    invoke('accounts:list'),
    invoke('tasks:list'),
    invoke('game:status'),
    invoke('activity:list'),
  ])
  return { info, settings, instances, accounts, tasks, statuses, activity }
}

function resolveTheme(theme: Settings['theme']): 'dark' | 'light' {
  if (theme !== 'system') return theme
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function AppProvider({ children }: { children: (ready: boolean) => ReactNode }) {
  const toast = useToast()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [instances, setInstances] = useState<Instance[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [statuses, setStatuses] = useState<Record<string, GameStatus>>({})
  const [activity, setActivity] = useState<Activity[]>([])
  const [route, setRoute] = useState<Route>({ page: 'home' })

  useEffect(() => {
    const offs = [
      ace.on('instances:changed', setInstances),
      ace.on('accounts:changed', setAccounts),
      ace.on('tasks:changed', setTasks),
      ace.on('activity:changed', setActivity),
      ace.on('game:status', (s) => setStatuses((prev) => ({ ...prev, [s.instanceId]: s }))),
    ]
    loadAll().then(
      (l) => {
        setLoaded(l)
        setInfo(l.info)
        setSettings(l.settings)
        setInstances(l.instances)
        setAccounts(l.accounts)
        setTasks(l.tasks)
        setStatuses(Object.fromEntries(l.statuses.map((s) => [s.instanceId, s])))
        setActivity(l.activity)
      },
      (e: Error) => setFailure(e.message),
    )
    return () => offs.forEach((off) => off())
  }, [])

  // Theme and accent live on <html> so every token switches at once.
  useEffect(() => {
    if (!settings) return
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(settings.theme)
      document.documentElement.dataset.accent = settings.accent
    }
    apply()
    const mq = matchMedia('(prefers-color-scheme: light)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [settings?.theme, settings?.accent])

  const act = useCallback(
    async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
      try {
        const r = await fn()
        if (success) toast.show({ tone: 'ok', title: success })
        return r
      } catch (e) {
        toast.show({ tone: 'error', title: (e as Error).message })
        return undefined
      }
    },
    [toast],
  )

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const next = await act(() => invoke('settings:set', patch))
      if (next) setSettings(next)
      // Keys decide whether sign-in and CurseForge are available.
      if (next && ('msClientId' in patch || 'curseforgeApiKey' in patch)) setInfo(await invoke('app:info'))
    },
    [act],
  )

  const value = useMemo<AppContext | null>(
    () =>
      loaded && settings && info
        ? { info, settings, instances, accounts, tasks, statuses, activity, route, navigate: setRoute, updateSettings, act }
        : null,
    [loaded, settings, info, instances, accounts, tasks, statuses, activity, route, updateSettings, act],
  )

  if (failure) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div>
          <p className="text-base font-medium">Ace Launcher couldn't start</p>
          <p className="mt-1 text-text-2 selectable">{failure}</p>
        </div>
      </div>
    )
  }
  return <Ctx.Provider value={value}>{children(!!value)}</Ctx.Provider>
}

/** Featured instance: the user's pick, else the most recently played. */
export function useFeatured(): Instance | null {
  const { instances, settings } = useApp()
  return instances.find((i) => i.id === settings.featuredInstanceId) ?? instances[0] ?? null
}

/** Combined view of what an instance is doing right now. */
export type InstancePhase =
  | { kind: 'running' | 'launching'; status: GameStatus }
  | { kind: 'installing'; task: Task }
  | { kind: 'ready' | 'not-installed' }

export function useInstancePhase(inst: Instance | null): InstancePhase {
  const { tasks, statuses } = useApp()
  if (!inst) return { kind: 'not-installed' }
  const status = statuses[inst.id]
  const prep = tasks.find((t) => t.state === 'running' && t.instanceId === inst.id && (t.kind === 'install' || t.kind === 'java'))
  if (status && (status.state === 'running' || status.state === 'launching')) {
    if (status.state === 'launching' && prep) return { kind: 'installing', task: prep }
    return { kind: status.state, status }
  }
  const task = prep?.kind === 'install' ? prep : undefined
  if (task) return { kind: 'installing', task }
  return { kind: inst.installed ? 'ready' : 'not-installed' }
}
