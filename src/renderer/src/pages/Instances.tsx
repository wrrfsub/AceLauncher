import { Boxes, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Instance } from '@shared/types'
import { CreateInstanceDialog } from '../components/CreateInstanceDialog'
import { InstanceIcon } from '../components/InstanceIcon'
import { PlayButton } from '../components/PlayButton'
import { ToolbarActions } from '../components/Toolbar'
import { Button } from '../components/ui/Button'
import { Empty, Input } from '../components/ui/controls'
import { ago, LOADER_NAMES } from '../lib/format'
import { useApp, useInstancePhase } from '../state'

export function Instances() {
  const { instances } = useApp()
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? instances.filter((i) => `${i.name} ${i.minecraft} ${i.loader}`.toLowerCase().includes(q)) : instances
  }, [instances, query])

  return (
    <div className="mx-auto w-full max-w-[1800px] px-[clamp(20px,2.2vw,40px)] py-5">
      <ToolbarActions>
        <Input className="w-56" placeholder="Search instances" leading={<Search className="size-3.5" />} value={query} onChange={(e) => setQuery(e.target.value)} />
        <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
          New instance
        </Button>
      </ToolbarActions>

      {instances.length === 0 ? (
        <Empty icon={<Boxes className="size-4" />} title="No instances yet">
          Create one to pick a Minecraft version and mod loader.
        </Empty>
      ) : shown.length === 0 ? (
        <Empty icon={<Search className="size-4" />} title={`Nothing matches “${query}”`} />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-2.5">
          {shown.map((inst) => (
            <InstanceCard key={inst.id} inst={inst} />
          ))}
        </div>
      )}
      <CreateInstanceDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}

function InstanceCard({ inst }: { inst: Instance }) {
  const { navigate } = useApp()
  const phase = useInstancePhase(inst)
  const status =
    phase.kind === 'running' ? (
      <span className="text-accent">Running</span>
    ) : phase.kind === 'installing' ? (
      'Installing…'
    ) : inst.lastPlayedAt ? (
      `Played ${ago(inst.lastPlayedAt)}`
    ) : inst.installed ? (
      'Ready'
    ) : (
      'Not installed'
    )
  return (
    <div className="relative flex flex-col rounded-[10px] border border-line bg-surface p-3 transition-colors hover:border-line-strong">
      <button className="absolute inset-0 rounded-[10px]" aria-label={`Open ${inst.name}`} onClick={() => navigate({ page: 'instance', id: inst.id })} />
      <div className="pointer-events-none flex items-center gap-3">
        <InstanceIcon inst={inst} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{inst.name}</p>
          <p className="mt-0.5 truncate text-xs text-text-3">
            {inst.minecraft}
            {inst.loader !== 'vanilla' && `, ${LOADER_NAMES[inst.loader]} ${inst.loaderVersion ?? ''}`}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] text-text-3">{status}</span>
        <div className="relative">
          <PlayButton inst={inst} size="sm" quiet />
        </div>
      </div>
    </div>
  )
}
