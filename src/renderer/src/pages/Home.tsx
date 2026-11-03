import { AnimatePresence, motion } from 'motion/react'
import { Check, ChevronUp, FolderOpen, LogIn, Play, Plus, Settings2 } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Instance, NewsItem } from '@shared/types'
import { CreateInstanceDialog } from '../components/CreateInstanceDialog'
import { InstanceIcon } from '../components/InstanceIcon'
import { SkinStage } from '../components/SkinStage'
import { Button, IconButton } from '../components/ui/Button'
import { Badge } from '../components/ui/controls'
import { useToast } from '../components/ui/Toast'
import { invoke } from '../lib/ipc'
import { ago, cn, duration, LOADER_NAMES, percent, versionLabel } from '../lib/format'
import { useApp, useFeatured, useInstancePhase } from '../state'

export function Home() {
  const { instances } = useApp()
  const featured = useFeatured()
  const [news, setNews] = useState<NewsItem[] | null>(null)
  const [newsError, setNewsError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  useEffect(() => {
    invoke('news:list').then(setNews, (e: Error) => setNewsError(e.message))
  }, [])
  // Feature the latest release's art; the news row below starts with the newest (usually snapshot) posts.
  const art = (news?.find((n) => n.tag === 'Release' && n.imageUrl) ?? news?.find((n) => n.imageUrl))?.imageUrl ?? null

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-8 px-6 py-5">
      <div className="grid grid-cols-[minmax(0,1fr)_248px] gap-4 max-[900px]:grid-cols-1">
        {featured ? <Hero inst={featured} art={art} onCreate={() => setCreating(true)} /> : <EmptyHero art={art} onCreate={() => setCreating(true)} />}
        <PlayerCard />
      </div>
      {instances.length > 0 && <Shelf featuredId={featured?.id ?? null} onCreate={() => setCreating(true)} />}
      <NewsRow news={news} error={newsError} />
      <CreateInstanceDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}

/** Crisp Minecraft art behind the content; the pixel art is the point, so no blur. */
function HeroFrame({ art, children }: { art: string | null; children: ReactNode }) {
  return (
    <section className="relative isolate flex min-h-[300px] flex-col justify-end overflow-hidden rounded-xl border border-line bg-surface p-7">
      {art && <img src={art} alt="" className="absolute inset-0 -z-20 size-full object-cover" style={{ imageRendering: 'pixelated' }} />}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-bg via-bg/70 to-bg/10" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-bg/80 to-transparent" />
      {children}
    </section>
  )
}

function Hero({ inst, art, onCreate }: { inst: Instance; art: string | null; onCreate(): void }) {
  const { act, navigate } = useApp()
  return (
    <HeroFrame art={art}>
      <div className="flex items-center gap-2">
        <Badge className="bg-bg/70 backdrop-blur">Minecraft {inst.minecraft}</Badge>
        {inst.loader !== 'vanilla' && (
          <Badge className="bg-bg/70 backdrop-blur">
            {LOADER_NAMES[inst.loader]} {inst.loaderVersion}
          </Badge>
        )}
      </div>
      <h1 className="mt-3 max-w-[560px] truncate font-display text-[40px] leading-[1.05]">{inst.name}</h1>
      <p className="mt-2 text-[13px] text-text-2">
        {inst.lastPlayedAt ? `${duration(inst.playTime)} played, last ${ago(inst.lastPlayedAt)}` : 'Not played yet'}
      </p>
      <div className="mt-6 flex items-center gap-2">
        <LaunchButton inst={inst} onCreate={onCreate} />
        <IconButton icon={FolderOpen} label="Open game folder" className="size-12 rounded-lg bg-bg/60 backdrop-blur" onClick={() => act(() => invoke('instances:openFolder', { id: inst.id }))} />
        <IconButton
          icon={Settings2}
          label="Instance settings"
          className="size-12 rounded-lg bg-bg/60 backdrop-blur"
          onClick={() => navigate({ page: 'instance', id: inst.id, tab: 'settings' })}
        />
      </div>
    </HeroFrame>
  )
}

function EmptyHero({ art, onCreate }: { art: string | null; onCreate(): void }) {
  const { navigate } = useApp()
  return (
    <HeroFrame art={art}>
      <h1 className="font-display text-[40px] leading-[1.05]">Ready when you are</h1>
      <p className="mt-2 max-w-md text-[13px] text-text-2">Create an instance with any Minecraft version and mod loader. Ace downloads the game and the right Java for you.</p>
      <div className="mt-6 flex gap-2">
        <Button size="lg" variant="primary" icon={Plus} onClick={onCreate}>
          New instance
        </Button>
        <Button size="lg" onClick={() => navigate({ page: 'discover', type: 'modpack' })}>
          Browse modpacks
        </Button>
      </div>
    </HeroFrame>
  )
}

/** Launch on the left, switch instance on the right. */
function LaunchButton({ inst, onCreate }: { inst: Instance; onCreate(): void }) {
  const { instances, updateSettings, act } = useApp()
  const phase = useInstancePhase(inst)
  const [menu, setMenu] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setMenu(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menu])

  const running = phase.kind === 'running'
  const busy = phase.kind === 'installing' || phase.kind === 'launching'
  const progress = phase.kind === 'installing' ? percent(phase.task.progress, phase.task.total) : 0
  const label = running ? 'Stop' : phase.kind === 'installing' ? `${phase.task.total ? `${progress}%` : 'Preparing'}` : phase.kind === 'launching' ? 'Starting' : phase.kind === 'ready' ? 'Launch' : 'Install'
  const tone = running ? 'bg-surface-3 text-text hover:bg-surface-2' : 'bg-accent text-accent-ink hover:brightness-110'

  return (
    <div ref={root} className="relative">
      <div className="flex h-12 overflow-hidden rounded-lg">
        <button
          disabled={busy}
          onClick={() => act(() => invoke(running ? 'game:kill' : 'game:launch', inst.id))}
          className={cn('relative flex w-48 items-center justify-center gap-2.5 overflow-hidden transition-[filter,background-color] disabled:cursor-progress', tone)}
          title={phase.kind === 'installing' ? phase.task.stage : undefined}
        >
          {phase.kind === 'installing' && (
            <motion.span className="absolute inset-y-0 left-0 bg-black/15" animate={{ width: `${phase.task.total ? progress : 100}%` }} transition={{ duration: 0.3 }} />
          )}
          {!busy && !running && <Play className="relative size-4 fill-current" />}
          <span className="relative font-display text-xl leading-none">{label}</span>
        </button>
        <button
          onClick={() => setMenu((m) => !m)}
          aria-label="Choose instance"
          aria-expanded={menu}
          className={cn('grid w-10 place-items-center border-l border-black/15 transition-[filter,background-color]', tone)}
        >
          <ChevronUp className={cn('size-4 transition-transform', !menu && 'rotate-180')} />
        </button>
      </div>
      {phase.kind === 'installing' && <p className="absolute top-full mt-1.5 w-max text-[11px] text-text-2">{phase.task.stage}</p>}

      <AnimatePresence>
        {menu && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            transition={{ duration: 0.14 }}
            className="absolute top-full left-0 z-30 mt-2 w-72 overflow-hidden rounded-lg border border-line-strong bg-surface-2 p-1 shadow-card"
          >
            <div className="max-h-72 overflow-y-auto">
              {instances.map((i) => (
                <button
                  key={i.id}
                  onClick={() => {
                    void updateSettings({ featuredInstanceId: i.id })
                    setMenu(false)
                  }}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-surface-3"
                >
                  <InstanceIcon inst={i} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{i.name}</span>
                    <span className="block truncate text-[11px] text-text-3">{versionLabel(i)}</span>
                  </span>
                  {i.id === inst.id && <Check className="size-3.5 text-accent" />}
                </button>
              ))}
            </div>
            <div className="my-1 h-px bg-line" />
            <button
              onClick={() => {
                setMenu(false)
                onCreate()
              }}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] text-text-2 hover:bg-surface-3 hover:text-text"
            >
              <Plus className="size-4" />
              New instance
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Who's playing: the skin in 3D, the account, and a way to sign in. */
function PlayerCard() {
  const { accounts, info, act, navigate } = useApp()
  const toast = useToast()
  const account = accounts.find((a) => a.active)
  const signIn = () => {
    if (!info.authConfigured) {
      navigate({ page: 'settings' })
      toast.show({ tone: 'info', title: 'Microsoft sign-in needs an Azure client ID', description: 'Paste it under Settings → Advanced. The README explains how to get one.' })
      return
    }
    void act(() => invoke('accounts:login'))
  }
  return (
    <aside className="relative flex min-h-[300px] flex-col overflow-hidden rounded-xl border border-line bg-surface">
      <div className="absolute inset-x-0 top-0 h-2/3 bg-gradient-to-b from-accent/12 to-transparent" />
      <div className="relative min-h-0 flex-1">
        <SkinStage skinUrl={account?.skinUrl ?? null} className="absolute inset-0" />
        <div className="pointer-events-none absolute bottom-[7%] left-1/2 h-3 w-24 -translate-x-1/2 rounded-[50%] bg-black/45 blur-sm" />
      </div>
      <div className="relative border-t border-line px-4 py-3">
        <p className="truncate font-display text-lg leading-tight">{account?.name ?? 'Not signed in'}</p>
        {account ? (
          <p className="mt-0.5 text-xs text-text-3">{account.needsReauth ? 'Sign in again to play' : 'Microsoft account'}</p>
        ) : (
          <button onClick={signIn} className="mt-1 flex items-center gap-1.5 text-xs font-medium text-accent hover:underline">
            <LogIn className="size-3.5" />
            Sign in with Microsoft
          </button>
        )}
      </div>
    </aside>
  )
}

function SectionHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between">
      <h2 className="font-display text-lg leading-none">{title}</h2>
      {action}
    </div>
  )
}

function Shelf({ featuredId, onCreate }: { featuredId: string | null; onCreate(): void }) {
  const { instances, navigate, act, updateSettings } = useApp()
  return (
    <section>
      <SectionHead
        title="Your instances"
        action={
          <button onClick={() => navigate({ page: 'instances' })} className="text-xs text-text-3 hover:text-text-2">
            View all
          </button>
        }
      />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5">
        {instances.slice(0, 7).map((inst) => (
          <div
            key={inst.id}
            className={cn('group relative flex items-center gap-3 rounded-lg border bg-surface p-2.5 transition-colors hover:border-line-strong', inst.id === featuredId ? 'border-accent/40' : 'border-line')}
          >
            <button className="absolute inset-0 rounded-lg" aria-label={`Feature ${inst.name}`} onClick={() => updateSettings({ featuredInstanceId: inst.id })} />
            <InstanceIcon inst={inst} size={36} className="pointer-events-none" />
            <span className="pointer-events-none min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{inst.name}</span>
              <span className="block truncate text-[11px] text-text-3">{versionLabel(inst)}</span>
            </span>
            <div className="absolute right-1.5 flex gap-0.5 rounded-md bg-surface-2 p-0.5 opacity-0 shadow-card transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <IconButton icon={Settings2} size="sm" label={`Open ${inst.name}`} onClick={() => navigate({ page: 'instance', id: inst.id })} />
              <IconButton icon={Play} size="sm" label={`Play ${inst.name}`} onClick={() => act(() => invoke('game:launch', inst.id))} />
            </div>
          </div>
        ))}
        <button
          onClick={onCreate}
          className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong p-2.5 text-[13px] text-text-3 hover:border-text-3 hover:text-text-2"
        >
          <Plus className="size-4" />
          New instance
        </button>
      </div>
    </section>
  )
}

function NewsRow({ news, error }: { news: NewsItem[] | null; error: string | null }) {
  return (
    <section>
      <SectionHead title="Minecraft news" />
      {error ? (
        <p className="text-xs text-text-3">Couldn't load news: {error}</p>
      ) : (
        <div className="grid grid-cols-4 gap-3 max-[1100px]:grid-cols-3 max-[800px]:grid-cols-2">
          {(news ?? Array.from({ length: 4 }, () => null)).slice(0, 4).map((n, i) =>
            n ? (
              <a key={n.id} href={n.url ?? undefined} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-lg border border-line bg-surface hover:border-line-strong">
                {n.imageUrl && (
                  <div className="overflow-hidden">
                    <img src={n.imageUrl} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                  </div>
                )}
                <div className="p-3">
                  <p className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium">{n.title}</span>
                    {n.tag !== 'Snapshot' && <Badge tone="accent">{n.tag}</Badge>}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-text-3">{n.summary}</p>
                  <p className="mt-2 text-[11px] text-text-3">{ago(n.date)}</p>
                </div>
              </a>
            ) : (
              <div key={i} className="h-56 animate-pulse rounded-lg bg-surface" />
            ),
          )}
        </div>
      )}
    </section>
  )
}
