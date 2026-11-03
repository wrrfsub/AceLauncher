import { useEffect, useRef } from 'react'
import type { SkinViewer } from 'skinview3d'
import { useApp } from '../state'

/** Mojang's default Steve skin, loaded from Mojang's texture server rather than bundled. */
const DEFAULT_SKIN = 'https://textures.minecraft.net/texture/31f477eb1a7beee631c2ca64d06f8f68fa93a3386d04452ab27f43acdf1b60cb'

/**
 * The player's skin in 3D, idling; drag to turn it. three.js is ~600 KB, so the viewer is
 * imported on demand and the rest of the app doesn't wait for it.
 */
export function SkinStage({ skinUrl, className }: { skinUrl: string | null; className?: string }) {
  const { settings } = useApp()
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const viewer = useRef<SkinViewer | null>(null)

  useEffect(() => {
    let disposed = false
    let observer: ResizeObserver | null = null
    void import('skinview3d').then(({ SkinViewer, IdleAnimation }) => {
      if (disposed || !canvas.current || !host.current) return
      const v = new SkinViewer({
        canvas: canvas.current,
        width: host.current.clientWidth,
        height: host.current.clientHeight,
        skin: skinUrl ?? DEFAULT_SKIN,
        model: 'auto-detect',
        zoom: 0.72,
        fov: 38,
      })
      v.controls.enableZoom = false
      v.controls.enablePan = false
      v.animation = new IdleAnimation()
      // A three-quarter turn reads better than dead-on; the animation resets the player's own pose, so turn the wrapper.
      v.playerWrapper.rotation.y = 0.45
      viewer.current = v
      observer = new ResizeObserver(([entry]) => entry && v.setSize(entry.contentRect.width, entry.contentRect.height))
      observer.observe(host.current)
    })
    return () => {
      disposed = true
      observer?.disconnect()
      viewer.current?.dispose()
      viewer.current = null
    }
  }, [])

  useEffect(() => {
    void viewer.current?.loadSkin(skinUrl ?? DEFAULT_SKIN, { model: 'auto-detect' })
  }, [skinUrl])

  useEffect(() => {
    if (viewer.current?.animation) viewer.current.animation.paused = settings.reduceMotion
  }, [settings.reduceMotion, viewer.current])

  return (
    <div ref={host} className={className}>
      <canvas ref={canvas} className="cursor-grab active:cursor-grabbing" aria-label="Your Minecraft skin. Drag to turn it." />
    </div>
  )
}
