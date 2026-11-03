import { FolderOpen, Play, Plus, Settings2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { Activity, Instance, NewsItem } from '@shared/types'
import { CreateInstanceDialog } from '../components/CreateInstanceDialog'
import { InstanceIcon } from '../components/InstanceIcon'
import { PlayButton } from '../components/PlayButton'
import { ToolbarActions } from '../components/Toolbar'
import { Button, IconButton } from '../components/ui/Button'
import { Badge, Progress } from '../components/ui/controls'
import { Select } from '../components/ui/Select'
import { invoke } from '../lib/ipc'
import { ago, cn, duration, LOADER_NAMES, percent } from '../lib/format'
import { useApp, useFeatured, useInstancePhase } from '../state'

export function Home() {
  const { instances, updateSettings } = useApp()
  const featured = useFeatured()
  const [news, setNews] = useState<NewsItem[] | null>(null)
  const [newsError, setNewsError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  useEffect(() => {
    invoke('news:list').then(setNews, (e: Error) => setNewsError(e.message))
  }, [])

  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-7 px-6 py-5">
      <ToolbarActions>
        {instances.length > 1 && featured && (
          <Select
            className="w-52"
            label="Featured instance"
            value={featured.id}
            onChange={(id) => updateSettings({ featuredInstanceId: id })}
            options={instances.map((i) => ({ value: i.id, label: i.name, icon: <InstanceIcon inst={i} size={16} /> }))}
          />
        )}
        <Button icon={Plus} onClick={() => setCreating(true)}>
          New instance
        </Button>
      </ToolbarActions>

      {featured ? <Hero inst={featured} art={news?.find((n) => n.imageUrl)?.imageUrl ?? null} /> : <Welcome onCreate={() => setCreating(true)} />}
      {instances.length > 1 && <JumpBackIn instances={instances.filter((i) => i.id !== featured?.id).slice(0, 4)} />}

      <div className="grid grid-cols-[minmax(0,1fr)_280px] gap-7 max-[1000px]:grid-cols-1">
        <NewsList news={news} error={newsError} />
        <ActivityList />
      </div>
      <CreateInstanceDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}

function Hero({ inst, art }: { inst: Instance; art: string | null }) {
  const { navigate, act } = useApp()
  const phase = useInstancePhase(inst)
  return (
    <section className="relative isolate overflow-hidden rounded-[10px] border border-line bg-surface">
      {art && (
        <img
          src={art}
          alt=""
          className="absolute inset-y-0 right-0 -z-10 h-full w-1/2 object-cover opacity-80"
          style={{ maskImage: 'linear-gradient(to right, transparent, black 70%)' }}
        />
      )}
      <div className="flex items-center gap-5 p-5">
        <InstanceIcon inst={inst} size={72} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Badge>Minecraft {inst.minecraft}</Badge>
            {inst.loader !== 'vanilla' && (
              <Badge>
                {LOADER_NAMES[inst.loader]} {inst.loaderVersion}
              </Badge>
            )}
          </div>
          <h1 className="mt-1.5 truncate text-[22px] leading-tight font-semibold tracking-[-0.01em]">{inst.name}</h1>
          <p className="mt-1 text-xs text-text-3">{inst.lastPlayedAt ? `${duration(inst.playTime)} played, last ${ago(inst.lastPlayedAt)}` : 'Not played yet'}</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg bg-bg/70 p-1.5 backdrop-blur-sm">
          <IconButton icon={FolderOpen} label="Open game folder" onClick={() => act(() => invoke('instances:openFolder', { id: inst.id }))} />
          <IconButton icon={Settings2} label="Instance settings" onClick={() => navigate({ page: 'instance', id: inst.id, tab: 'settings' })} />
          <PlayButton inst={inst} size="lg" className="min-w-[132px]" />
        </div>
      </div>
      <StatusBar phase={phase} />
    </section>
  )
}

function StatusBar({ phase }: { phase: ReturnType<typeof useInstancePhase> }) {
  if (phase.kind === 'installing') {
    const p = percent(phase.task.progress, phase.task.total)
    return (
      <div className="flex items-center gap-3 border-t border-line bg-bg/40 px-5 py-2.5 text-xs">
        <span className="text-text-2">{phase.task.stage}</span>
        <Progress className="flex-1" value={p} indeterminate={!phase.task.total} />
        <span className="w-9 text-right text-text-3 tabular-nums">{phase.task.total ? `${p}%` : ''}</span>
      </div>
    )
  }
  if (phase.kind === 'not-installed') {
    return <p className="border-t border-line bg-bg/40 px-5 py-2.5 text-xs text-text-3">The first launch downloads the game and the right Java.</p>
  }
  if (phase.kind === 'running' || phase.kind === 'launching') {
    return (
      <p className="flex items-center gap-2 border-t border-line bg-bg/40 px-5 py-2.5 text-xs text-text-2">
        <span className="size-1.5 animate-pulse rounded-full bg-accent" />
        {phase.kind === 'running' ? `Running since ${new Date(phase.status.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Starting Minecraft…'}
      </p>
    )
  }
  return null
}

function Welcome({ onCreate }: { onCreate(): void }) {
  const { navigate } = useApp()
  return (
    <section className="rounded-[10px] border border-line bg-surface p-6">
      <h1 className="text-lg font-semibold">Set up your first instance</h1>
      <p className="mt-1 max-w-md text-[13px] text-text-2">Pick a Minecraft version and, if you want mods, a loader. Ace downloads the game and the right Java for you.</p>
      <div className="mt-4 flex gap-2">
        <Button variant="primary" icon={Plus} onClick={onCreate}>
          New instance
        </Button>
        <Button onClick={() => navigate({ page: 'discover', type: 'modpack' })}>Browse modpacks</Button>
      </div>
    </section>
  )
}

function Heading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between">
      <h2 className="text-[13px] font-semibold">{children}</h2>
      {action}
    </div>
  )
}

function JumpBackIn({ instances }: { instances: Instance[] }) {
  const { navigate, act } = useApp()
  return (
    <section>
      <Heading
        action={
          <button onClick={() => navigate({ page: 'instances' })} className="text-xs text-text-3 hover:text-text-2">
            View all
          </button>
        }
      >
        Jump back in
      </Heading>
      <div className="grid grid-cols-4 gap-2.5 max-[1000px]:grid-cols-2">
        {instances.map((inst) => (
          <div key={inst.id} className="group flex items-center gap-2.5 rounded-lg border border-line bg-surface p-2 hover:border-line-strong">
            <button className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => navigate({ page: 'instance', id: inst.id })}>
              <InstanceIcon inst={inst} size={32} />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">{inst.name}</span>
                <span className="block truncate text-[11px] text-text-3">
                  {inst.minecraft}
                  {inst.loader !== 'vanilla' && `, ${LOADER_NAMES[inst.loader]}`}
                </span>
              </span>
            </button>
            <IconButton
              icon={Play}
              size="sm"
              label={`Play ${inst.name}`}
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              onClick={() => act(() => invoke('game:launch', inst.id))}
            />
          </div>
        ))}
      </div>
    </section>
  )
}

function NewsList({ news, error }: { news: NewsItem[] | null; error: string | null }) {
  return (
    <section>
      <Heading>Minecraft news</Heading>
      {error ? (
        <p className="py-6 text-xs text-text-3">Couldn't load news: {error}</p>
      ) : (
        <ul className="flex flex-col">
          {(news ?? Array.from({ length: 5 }, () => null)).slice(0, 5).map((n, i) =>
            n ? (
              <li key={n.id}>
                <a href={n.url ?? undefined} target="_blank" rel="noreferrer" className="-mx-2 flex items-center gap-3 rounded-lg p-2 hover:bg-surface">
                  {n.imageUrl && <img src={n.imageUrl} alt="" className="size-10 shrink-0 rounded-md object-cover" loading="lazy" />}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium">{n.title}</span>
                      {n.tag !== 'Snapshot' && <Badge tone="accent">{n.tag}</Badge>}
                      <span className="ml-auto shrink-0 text-[11px] text-text-3">{ago(n.date)}</span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-text-3">{n.summary}</p>
                  </div>
                </a>
              </li>
            ) : (
              <li key={i} className="my-1 h-11 animate-pulse rounded-lg bg-surface" />
            ),
          )}
        </ul>
      )}
    </section>
  )
}

const ACTIVITY_DOT: Record<Activity['kind'], string> = {
  launch: 'bg-accent',
  install: 'bg-ok',
  create: 'bg-text-3',
  content: 'bg-text-2',
  account: 'bg-text-2',
  crash: 'bg-danger',
  error: 'bg-warn',
}

function ActivityList() {
  const { activity, instances, navigate } = useApp()
  return (
    <section>
      <Heading>Recent activity</Heading>
      {activity.length === 0 ? (
        <p className="py-2 text-xs text-text-3">Launches and installs show up here.</p>
      ) : (
        <ul className="flex flex-col">
          {activity.slice(0, 9).map((a) => {
            const inst = instances.find((i) => i.id === a.instanceId)
            return (
              <li key={a.id}>
                <button
                  disabled={!inst}
                  onClick={() => inst && navigate({ page: 'instance', id: inst.id })}
                  className="-mx-2 flex w-[calc(100%+1rem)] items-baseline gap-2.5 rounded-md px-2 py-1.5 text-left enabled:hover:bg-surface"
                >
                  <span className={cn('size-1.5 shrink-0 -translate-y-px rounded-full', ACTIVITY_DOT[a.kind])} />
                  <span className="min-w-0 flex-1 truncate text-xs">{a.message}</span>
                  <span className="shrink-0 text-[11px] text-text-3">{ago(a.at)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
