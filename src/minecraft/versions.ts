import {
  getForgeVersionList,
  getLoaderArtifactListFor,
  getQuiltLoaderVersionsByMinecraft,
  getVersionList,
  type ForgeVersion,
  type MinecraftVersion,
} from '@xmcl/installer'
import type { Loader, LoaderVersion, McVersion } from '../shared/types.ts'
import { getJson } from '../utils/http.ts'

const TTL = 10 * 60_000
const cache = new Map<string, { at: number; value: Promise<unknown> }>()

/** Memoizes a remote lookup for a few minutes; failed lookups are not cached. */
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.value as Promise<T>
  const value = load()
  cache.set(key, { at: Date.now(), value })
  value.catch(() => cache.delete(key))
  return value
}

export function getMinecraftManifest(): Promise<MinecraftVersion[]> {
  return cached('minecraft', async () => (await getVersionList()).versions)
}

export async function getMinecraftVersions(): Promise<McVersion[]> {
  return (await getMinecraftManifest()).map((v) => ({
    id: v.id,
    type: v.type as McVersion['type'],
    releaseTime: v.releaseTime,
  }))
}

export function getForgeVersions(minecraft: string): Promise<ForgeVersion[]> {
  return cached(`forge:${minecraft}`, async () => (await getForgeVersionList({ minecraft })).versions)
}

/**
 * NeoForge numbers its releases after the Minecraft version:
 *   1.21.1 -> 21.1.x, 1.20.4 -> 20.4.x, 26.3 -> 26.3.0.x, 26.3.1 -> 26.3.1.x
 * (1.20.1 is the exception: it shipped as `net.neoforged:forge`, which we don't support.)
 */
export function neoForgePrefix(minecraft: string): string | null {
  const parts = minecraft.split('.')
  if (parts.some((p) => !/^\d+$/.test(p))) return null // snapshots
  if (parts[0] === '1') return parts[1] ? `${parts[1]}.${parts[2] ?? 0}.` : null
  return `${parts[0]}.${parts[1] ?? 0}.${parts[2] ?? 0}.`
}

async function getNeoForgeVersions(minecraft: string): Promise<LoaderVersion[]> {
  const prefix = neoForgePrefix(minecraft)
  if (!prefix) return []
  const all = await cached('neoforge', () =>
    getJson<{ versions: string[] }>('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge'),
  )
  return all.versions
    .filter((v) => v.startsWith(prefix))
    .reverse()
    .map((version) => ({ version, stable: !version.includes('beta') }))
}

export async function getLoaderVersions(loader: Exclude<Loader, 'vanilla'>, minecraft: string): Promise<LoaderVersion[]> {
  switch (loader) {
    case 'fabric': {
      const list = await cached(`fabric:${minecraft}`, () => getLoaderArtifactListFor(minecraft))
      return list.map((a) => ({ version: a.loader.version, stable: a.loader.stable }))
    }
    case 'quilt': {
      const list = await cached(`quilt:${minecraft}`, () => getQuiltLoaderVersionsByMinecraft({ minecraftVersion: minecraft }))
      return list.map((a) => ({ version: a.loader.version, stable: !/beta|alpha|rc|pre/.test(a.loader.version) }))
    }
    case 'forge': {
      const list = await getForgeVersions(minecraft)
      return list.map((v) => ({ version: v.version, stable: v.type === 'recommended' || v.type === 'latest' || v.type === 'common' }))
    }
    case 'neoforge':
      return getNeoForgeVersions(minecraft)
  }
}
