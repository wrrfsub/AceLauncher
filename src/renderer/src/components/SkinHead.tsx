import { cn } from '../lib/format'

/**
 * Renders the face (and hat layer) straight from the account's skin texture, so no third-party
 * avatar service sees who's playing. Skin layout: face at (8,8), hat at (40,8), 8×8 on a 64×64 sheet.
 */
export function SkinHead({ skinUrl, size = 28, className }: { skinUrl: string | null; size?: number; className?: string }) {
  const layer = (x: number) => ({
    backgroundImage: skinUrl ? `url("${skinUrl}")` : undefined,
    backgroundSize: `${size * 8}px ${size * 8}px`,
    backgroundPosition: `-${x * size}px -${size}px`,
    imageRendering: 'pixelated' as const,
  })
  return (
    <div className={cn('relative shrink-0 overflow-hidden rounded-md bg-surface-3', className)} style={{ width: size, height: size }}>
      {skinUrl && (
        <>
          <div className="absolute inset-0" style={layer(1)} />
          <div className="absolute inset-0 scale-[1.12]" style={layer(5)} />
        </>
      )}
    </div>
  )
}
