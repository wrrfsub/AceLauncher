import { motion } from 'motion/react'
import { ArrowUpRight, Boxes, Clock, FolderOpen, Newspaper, Plus, Settings2, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Activity, NewsItem } from '@shared/types'
import { CreateInstanceDialog } from '../components/CreateInstanceDialog'
import { InstanceIcon } from '../components/InstanceIcon'
import { PlayButton } from '../components/PlayButton'
import { Button, IconButton } from '../components/ui/Button'
import { Badge, Progress } from '../components/ui/controls'
import { Select } from '../components/ui/Select'
import { invoke } from '../lib/ipc'
import { ago, cn, duration, percent, versionLabel } from '../lib/format'
import { useApp, useFeatured, useInstancePhase } from '../state'

export function Home() {
  const [news, setNews] = useState<NewsItem[] | null>(null)
  const [newsError, setNewsError] = useState<string | null>(null)
  useEffect(() => {
    invoke('news:list').then(setNews, (e: Error) => setNewsError(e.message))
  }, [])

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-8 px-8 pt-2 pb-10">
      <Hero backdrop={news?.find((n) => n.imageUrl)?.imageUrl ?? null} />
      <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-8 max-[1100px]:grid-cols-1">
        <NewsSection news={news} error={newsError} />
        <ActivitySection />
      </div>
    </div>
  )
}

function Hero({ backdrop }: { backdrop: string | null }) {
  const { instances, updateSettings, navigate, act } = useApp()
  const featured = useFeatured()
  const phase = useInstancePhase(featured)
  const [creating, setCreating] = useState(false)

  return (
    <section className="relative isolate min-h-[320px] overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      {backdrop && (
        <motion.img
          key={backdrop}
          src={backdrop}
          alt=""
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="absolute inset-y-0 right-0 -z-10 h-full w-[58%] object-cover"
          style={{ maskImage: 'linear-gradient(to right, transparent, black 45%)' }}
        />
      )}

      <div className="flex h-full min-h-[320px] max-w-[560px] flex-col p-9">
        {featured ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold tracking-[0.14em] text-text-3 uppercase">Featured</span>
              {instances.length > 1 && (
                <Select
                  className="w-48"
                  label="Featured instance"
                  value={featured.id}
                  onChange={(id) => updateSettings({ featuredInstanceId: id })}
                  options={instances.map((i) => ({ value: i.id, label: i.name }))}
                />
              )}
            </div>

            <div className="mt-6 flex items-center gap-4">
              <InstanceIcon inst={featured} size={56} />
              <div className="min-w-0">
                <h1 className="truncate text-[32px] leading-tight font-semibold tracking-[-0.02em]">{featured.name}</h1>
                <p className="mt-0.5 flex items-center gap-3 text-[13px] text-text-2">
                  <span className="font-mono">{versionLabel(featured)}</span>
                  <span className="text-text-3">·</span>
                  <span>{duration(featured.playTime)} played</span>
                  <span className="text-text-3">·</span>
                  <span>{featured.lastPlayedAt ? `Last played ${ago(featured.lastPlayedAt)}` : 'Not played yet'}</span>
                </p>
              </div>
            </div>

            <div className="mt-auto pt-10">
              <StatusLine phase={phase} />
              <div className="mt-4 flex items-center gap-2">
                <PlayButton inst={featured} size="lg" className="min-w-[168px]" />
                <IconButton
                  icon={Settings2}
                  label="Instance settings"
                  className="size-12 rounded-xl border border-line bg-surface-2"
                  onClick={() => navigate({ page: 'instance', id: featured.id, tab: 'settings' })}
                />
                <IconButton
                  icon={FolderOpen}
                  label="Open game folder"
                  className="size-12 rounded-xl border border-line bg-surface-2"
                  onClick={() => act(() => invoke('instances:openFolder', { id: featured.id }))}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <span className="text-[11px] font-semibold tracking-[0.14em] text-text-3 uppercase">Get started</span>
            <h1 className="mt-6 text-[32px] leading-tight font-semibold tracking-[-0.02em]">Set up your first instance</h1>
            <p className="mt-2 max-w-md text-[14px] text-text-2">
              Pick a Minecraft version and, if you like, a mod loader. Ace downloads the game, the right Java and everything else.
            </p>
            <div className="mt-auto flex gap-2 pt-10">
              <Button size="lg" variant="primary" icon={Plus} onClick={() => setCreating(true)}>
                New instance
              </Button>
              <Button size="lg" icon={Sparkles} onClick={() => navigate({ page: 'discover', type: 'modpack' })}>
                Browse modpacks
              </Button>
            </div>
          </>
        )}
      </div>
      <CreateInstanceDialog open={creating} onClose={() => setCreating(false)} />
    </section>
  )
}

function StatusLine({ phase }: { phase: ReturnType<typeof useInstancePhase> }) {
  if (phase.kind === 'installing') {
    const p = percent(phase.task.progress, phase.task.total)
    return (
      <div className="max-w-sm">
        <div className="mb-2 flex justify-between text-xs">
          <span className="text-text-2">{phase.task.stage}</span>
          <span className="text-text-3 tabular-nums">{phase.task.total ? `${p}%` : ''}</span>
        </div>
        <Progress value={p} indeterminate={!phase.task.total} />
      </div>
    )
  }
  const text = {
    running: 'Running',
    launching: 'Starting Minecraft…',
    ready: 'Installed and ready',
    'not-installed': 'Not installed yet. The first launch downloads the game.',
  }[phase.kind]
  return (
    <p className="flex items-center gap-2 text-[13px] text-text-2">
      <span className={cn('size-1.5 rounded-full', phase.kind === 'running' ? 'bg-accent' : phase.kind === 'ready' ? 'bg-ok' : 'bg-text-3')} />
      {text}
    </p>
  )
}

function NewsSection({ news, error }: { news: NewsItem[] | null; error: string | null }) {
  return (
    <section>
      <SectionTitle icon={Newspaper} title="News" />
      {error && <p className="rounded-xl border border-line bg-surface px-4 py-6 text-center text-[13px] text-text-3">Couldn't load news: {error}</p>}
      {!error && (
        <div className="grid grid-cols-2 gap-4 max-[900px]:grid-cols-1">
          {(news ?? Array.from({ length: 4 }, () => null)).slice(0, 6).map((n, i) =>
            n ? (
              <motion.a
                key={n.id}
                href={n.url ?? undefined}
                target="_blank"
                rel="noreferrer"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="group flex gap-4 rounded-xl border border-line bg-surface p-3 transition-colors hover:border-line-strong hover:bg-surface-2"
              >
                {n.imageUrl && <img src={n.imageUrl} alt="" className="size-[88px] shrink-0 rounded-lg object-cover" loading="lazy" />}
                <div className="min-w-0 py-0.5">
                  <div className="flex items-center gap-2">
                    <Badge tone={n.tag === 'Release' ? 'accent' : 'default'}>{n.tag}</Badge>
                    <span className="text-[11px] text-text-3">{ago(n.date)}</span>
                  </div>
                  <p className="mt-1.5 flex items-start gap-1 text-[13px] leading-snug font-medium">
                    <span className="line-clamp-1">{n.title}</span>
                    <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-text-3 opacity-0 transition-opacity group-hover:opacity-100" />
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-text-3">{n.summary}</p>
                </div>
              </motion.a>
            ) : (
              <div key={i} className="h-[114px] animate-pulse rounded-xl border border-line bg-surface" />
            ),
          )}
        </div>
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

function ActivitySection() {
  const { activity, instances, navigate } = useApp()
  return (
    <section>
      <SectionTitle icon={Clock} title="Recent activity" />
      <div className="rounded-xl border border-line bg-surface">
        {activity.length === 0 && <p className="px-4 py-8 text-center text-[13px] text-text-3">Nothing yet. Your launches and installs show up here.</p>}
        <ul className="divide-y divide-line">
          {activity.slice(0, 8).map((a) => {
            const inst = instances.find((i) => i.id === a.instanceId)
            return (
              <li key={a.id}>
                <button
                  disabled={!inst}
                  onClick={() => inst && navigate({ page: 'instance', id: inst.id })}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left enabled:hover:bg-surface-2"
                >
                  <span className={cn('mt-[7px] size-1.5 shrink-0 rounded-full', ACTIVITY_DOT[a.kind])} />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[13px]">{a.message}</span>
                    <span className="text-[11px] text-text-3">{ago(a.at)}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
      {instances.length > 0 && (
        <button onClick={() => navigate({ page: 'instances' })} className="mt-3 flex items-center gap-2 text-xs text-text-3 hover:text-text-2">
          <Boxes className="size-3.5" />
          All {instances.length} instance{instances.length === 1 ? '' : 's'}
        </button>
      )}
    </section>
  )
}

export function SectionTitle({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className="size-4 text-text-3" />
      <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </div>
  )
}
