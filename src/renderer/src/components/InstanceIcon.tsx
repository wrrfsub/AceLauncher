import { useState } from 'react'
import type { Instance } from '@shared/types'
import { cn } from '../lib/format'

// Muted tones so a grid of instances reads calm; the accent stays reserved for actions.
const TONES = ['#3b4a3f', '#4a3f35', '#363f52', '#4a3a4a', '#3d4a4a', '#4a4535', '#3f3a52', '#4a3b3b']

function tone(name: string): string {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return TONES[h % TONES.length]!
}

export function InstanceIcon({ inst, size = 40, className }: { inst: Pick<Instance, 'name' | 'icon'>; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false)
  const radius = Math.round(size * 0.24)
  if (inst.icon && !broken) {
    return (
      <img
        src={inst.icon}
        alt=""
        onError={() => setBroken(true)}
        className={cn('shrink-0 object-cover', className)}
        style={{ width: size, height: size, borderRadius: radius }}
      />
    )
  }
  return (
    <div
      className={cn('grid shrink-0 place-items-center font-semibold text-white/85', className)}
      style={{ width: size, height: size, borderRadius: radius, background: tone(inst.name), fontSize: size * 0.42 }}
    >
      {inst.name.trim()[0]?.toUpperCase() ?? '?'}
    </div>
  )
}
