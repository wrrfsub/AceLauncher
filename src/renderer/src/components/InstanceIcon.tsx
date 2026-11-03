import { useState } from 'react'
import type { Instance, Loader } from '@shared/types'
import { cn } from '../lib/format'
import fabric from '../assets/loaders/fabric.png'
import forge from '../assets/loaders/forge.jpg'
import neoforge from '../assets/loaders/neoforge.png'
import quilt from '../assets/loaders/quilt.png'
import vanilla from '../assets/loaders/vanilla.svg'

/**
 * Loader logos (from each project's GitHub organisation) mark which loader an instance runs.
 * `inset` logos have transparent backgrounds and sit on a tile; the rest fill the square.
 */
const LOADER_ART: Record<Loader, { src: string; inset: boolean; tile?: string }> = {
  vanilla: { src: vanilla, inset: false },
  fabric: { src: fabric, inset: true, tile: '#3b3a33' },
  forge: { src: forge, inset: false },
  neoforge: { src: neoforge, inset: true, tile: '#3a332b' },
  quilt: { src: quilt, inset: false },
}

export function InstanceIcon({ inst, size = 40, className }: { inst: Pick<Instance, 'name' | 'icon' | 'loader'>; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false)
  const radius = Math.round(size * 0.24)
  const style = { width: size, height: size, borderRadius: radius }

  // Modpacks bring their own art; everything else shows its loader.
  if (inst.icon && !broken) {
    return <img src={inst.icon} alt="" onError={() => setBroken(true)} className={cn('shrink-0 object-cover', className)} style={style} />
  }
  const art = LOADER_ART[inst.loader]
  if (!art.inset) {
    return <img src={art.src} alt="" className={cn('shrink-0 object-cover [image-rendering:pixelated]', className)} style={style} />
  }
  return (
    <div className={cn('grid shrink-0 place-items-center', className)} style={{ ...style, background: art.tile }}>
      <img src={art.src} alt="" className="size-[78%] object-contain [image-rendering:pixelated]" />
    </div>
  )
}
