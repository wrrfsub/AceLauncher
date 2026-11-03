import { ArrowDown, Copy, FolderOpen, Search, Square, SquareTerminal } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { LogLine } from '@shared/types'
import { InstanceIcon } from '../components/InstanceIcon'
import { Button } from '../components/ui/Button'
import { Empty, Input } from '../components/ui/controls'
import { Select } from '../components/ui/Select'
import { ace, invoke } from '../lib/ipc'
import { cn } from '../lib/format'
import { useApp, useFeatured } from '../state'
import { PageHeader } from './Instances'

type Level = LogLine['level']
const LEVELS: Level[] = ['info', 'warn', 'error', 'debug']
const LEVEL_STYLE: Record<Level, string> = { info: 'text-text-2', warn: 'text-warn', error: 'text-danger', debug: 'text-text-3' }
const RENDER_LIMIT = 2000

export function Console({ instanceId }: { instanceId?: string }) {
  const { instances, statuses, act } = useApp()
  const featured = useFeatured()
  const [selected, setSelected] = useState<string | null>(
    instanceId ?? Object.values(statuses).find((s) => s.state === 'running')?.instanceId ?? featured?.id ?? null,
  )
  const [lines, setLines] = useState<LogLine[]>([])
  const [levels, setLevels] = useState<Set<Level>>(new Set(['info', 'warn', 'error']))
  const [filter, setFilter] = useState('')
  const [follow, setFollow] = useState(true)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (instanceId) setSelected(instanceId)
  }, [instanceId])

  useEffect(() => {
    if (!selected) return
    let live = true
    invoke('game:logs', selected).then((l) => live && setLines(l))
    const off = ace.on('game:log', (batch) => {
      const mine = batch.filter((l) => l.instanceId === selected)
      if (mine.length) setLines((prev) => [...prev, ...mine].slice(-5000))
    })
    return () => {
      live = false
      off()
    }
  }, [selected])

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return lines.filter((l) => levels.has(l.level) && (!q || l.text.toLowerCase().includes(q))).slice(-RENDER_LIMIT)
  }, [lines, levels, filter])

  useEffect(() => {
    if (follow && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight
  }, [shown, follow])

  const inst = instances.find((i) => i.id === selected) ?? null
  const status = selected ? statuses[selected] : undefined
  const running = status?.state === 'running' || status?.state === 'launching'

  const copy = async () => {
    await navigator.clipboard.writeText(shown.map((l) => l.text).join('\n'))
    await act(async () => {}, `Copied ${shown.length} lines`)
  }

  return (
    <div className="mx-auto flex h-full max-w-[1180px] flex-col px-8 pt-2 pb-6">
      <PageHeader title="Console" subtitle="Live output from Minecraft and the launcher">
        <Select
          className="w-64"
          label="Instance"
          placeholder="Pick an instance"
          value={selected}
          onChange={setSelected}
          options={instances.map((i) => ({ value: i.id, label: i.name, icon: <InstanceIcon inst={i} size={18} />, hint: statuses[i.id]?.state === 'running' ? 'running' : undefined }))}
        />
      </PageHeader>

      {!inst ? (
        <Empty icon={<SquareTerminal className="size-5" />} title="No instance selected" />
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2">
            <StatusPill state={status?.state} exitCode={status?.exitCode ?? null} />
            <div className="ml-3 flex gap-1">
              {LEVELS.map((lv) => (
                <button
                  key={lv}
                  onClick={() =>
                    setLevels((s) => {
                      const n = new Set(s)
                      if (n.has(lv)) n.delete(lv)
                      else n.add(lv)
                      return n
                    })
                  }
                  className={cn(
                    'h-7 rounded-md px-2.5 text-xs font-medium capitalize transition-colors',
                    levels.has(lv) ? 'bg-surface-3 text-text' : 'text-text-3 hover:text-text-2',
                  )}
                >
                  {lv}
                </button>
              ))}
            </div>
            <Input className="ml-auto h-8 w-56" placeholder="Filter output" leading={<Search className="size-3.5" />} value={filter} onChange={(e) => setFilter(e.target.value)} />
            <Button size="sm" variant="ghost" icon={Copy} onClick={copy} disabled={!shown.length}>
              Copy
            </Button>
            <Button size="sm" variant="ghost" icon={FolderOpen} onClick={() => act(() => invoke('instances:openFolder', { id: inst.id, sub: 'logs' }))}>
              Logs
            </Button>
            {running && (
              <Button size="sm" variant="danger" icon={Square} onClick={() => act(() => invoke('game:kill', inst.id))}>
                Kill
              </Button>
            )}
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-line bg-[color-mix(in_srgb,var(--bg)_70%,black)]">
            <div
              ref={scroller}
              onScroll={(e) => {
                const el = e.currentTarget
                setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 40)
              }}
              className="h-full overflow-y-auto px-4 py-3 font-mono text-[12px] leading-[1.6] selectable"
            >
              {shown.length === 0 ? (
                <p className="py-10 text-center font-sans text-[13px] text-text-3">{lines.length ? 'No lines match the filters.' : 'No output yet. Launch the game to see its log here.'}</p>
              ) : (
                shown.map((l, i) => (
                  <div key={i} className={cn('break-all whitespace-pre-wrap', LEVEL_STYLE[l.level], l.stream === 'launcher' && 'text-accent/90')}>
                    {l.text}
                  </div>
                ))
              )}
            </div>
            {!follow && (
              <button
                onClick={() => setFollow(true)}
                className="absolute right-4 bottom-4 flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface-2 px-2.5 py-1.5 text-xs shadow-card"
              >
                <ArrowDown className="size-3.5" />
                Follow
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function StatusPill({ state, exitCode }: { state?: string; exitCode: number | null }) {
  const map: Record<string, [string, string]> = {
    running: ['Running', 'bg-accent'],
    launching: ['Starting', 'bg-warn'],
    exited: ['Closed', 'bg-text-3'],
    crashed: [exitCode === null ? 'Failed to start' : `Crashed (exit ${exitCode})`, 'bg-danger'],
  }
  const [label, dot] = map[state ?? ''] ?? ['Not running', 'bg-text-3']
  return (
    <span className="flex h-7 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-xs">
      <span className={cn('size-1.5 rounded-full', dot, state === 'running' && 'animate-pulse')} />
      {label}
    </span>
  )
}
