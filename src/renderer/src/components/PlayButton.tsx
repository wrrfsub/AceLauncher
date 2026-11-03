import { Download, LoaderCircle, Play, Square } from 'lucide-react'
import type { Instance } from '@shared/types'
import { invoke } from '../lib/ipc'
import { percent } from '../lib/format'
import { useApp, useInstancePhase } from '../state'
import { Button } from './ui/Button'

/** One button that knows whether to install, play, show progress or stop. */
export function PlayButton({ inst, size = 'md', className }: { inst: Instance; size?: 'md' | 'lg'; className?: string }) {
  const { act } = useApp()
  const phase = useInstancePhase(inst)

  if (phase.kind === 'running') {
    return (
      <Button size={size} variant="secondary" icon={Square} className={className} onClick={() => act(() => invoke('game:kill', inst.id))}>
        Stop
      </Button>
    )
  }
  if (phase.kind === 'installing' || phase.kind === 'launching') {
    const label = phase.kind === 'installing' ? `${percent(phase.task.progress, phase.task.total) || ''}${phase.task.total ? '%' : 'Preparing'}` : 'Starting'
    return (
      <Button size={size} variant="primary" className={className} disabled>
        <LoaderCircle className="size-4 animate-spin" />
        {label}
      </Button>
    )
  }
  return (
    <Button
      size={size}
      variant="primary"
      icon={phase.kind === 'ready' ? Play : Download}
      className={className}
      onClick={() => act(() => invoke('game:launch', inst.id))}
    >
      {phase.kind === 'ready' ? 'Play' : 'Install & play'}
    </Button>
  )
}
