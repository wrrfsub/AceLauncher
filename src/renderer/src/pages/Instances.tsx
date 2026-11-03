import { motion } from 'motion/react'
import { Boxes, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CreateInstanceDialog } from '../components/CreateInstanceDialog'
import { InstanceIcon } from '../components/InstanceIcon'
import { PlayButton } from '../components/PlayButton'
import { Button } from '../components/ui/Button'
import { Empty, Input } from '../components/ui/controls'
import { ago, versionLabel } from '../lib/format'
import { useApp, useInstancePhase } from '../state'
import type { Instance } from '@shared/types'

export function Instances() {
  const { instances } = useApp()
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? instances.filter((i) => `${i.name} ${i.minecraft} ${i.loader}`.toLowerCase().includes(q)) : instances
  }, [instances, query])

  return (
    <div className="mx-auto max-w-[1180px] px-8 pt-2 pb-10">
      <PageHeader title="Instances" subtitle={`${instances.length} instance${instances.length === 1 ? '' : 's'}`}>
        <Input className="w-64" placeholder="Search instances" leading={<Search className="size-3.5" />} value={query} onChange={(e) => setQuery(e.target.value)} />
        <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
          New instance
        </Button>
      </PageHeader>

      {instances.length === 0 ? (
        <Empty icon={<Boxes className="size-5" />} title="No instances yet">
          Create one to pick a Minecraft version and mod loader.
        </Empty>
      ) : shown.length === 0 ? (
        <Empty icon={<Search className="size-5" />} title="No matches" />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          {shown.map((inst, i) => (
            <InstanceCard key={inst.id} inst={inst} index={i} />
          ))}
        </div>
      )}
      <CreateInstanceDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}

function InstanceCard({ inst, index }: { inst: Instance; index: number }) {
  const { navigate } = useApp()
  const phase = useInstancePhase(inst)
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 10) * 0.03 }}
      className="group relative flex flex-col rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-surface-2"
    >
      <button className="absolute inset-0 rounded-xl" aria-label={`Open ${inst.name}`} onClick={() => navigate({ page: 'instance', id: inst.id })} />
      <div className="pointer-events-none flex items-start gap-3">
        <InstanceIcon inst={inst} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium">{inst.name}</p>
          <p className="mt-0.5 truncate font-mono text-xs text-text-3">{versionLabel(inst)}</p>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between">
        <span className="text-xs text-text-3">
          {phase.kind === 'running' ? <span className="text-accent">Running</span> : inst.lastPlayedAt ? `Played ${ago(inst.lastPlayedAt)}` : inst.installed ? 'Ready' : 'Not installed'}
        </span>
        <div className="relative">
          <PlayButton inst={inst} />
        </div>
      </div>
    </motion.div>
  )
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-[24px] font-semibold tracking-[-0.02em]">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-text-3">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}
