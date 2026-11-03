import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { open, openEntryReadStream, readEntry, walkEntriesGenerator } from '@xmcl/unzip'
import type { InstallFile } from '@xmcl/installer'
import type { Loader } from '../shared/types.ts'

/** Modrinth modpack format: https://support.modrinth.com/en/articles/8802351-modrinth-modpack-format-mrpack */
export interface MrpackIndex {
  formatVersion: number
  game: string
  name: string
  versionId: string
  files: Array<{
    path: string
    hashes: { sha1: string; sha512?: string }
    env?: { client?: 'required' | 'optional' | 'unsupported'; server?: string }
    downloads: string[]
    fileSize: number
  }>
  dependencies: Record<string, string>
}

export interface PackTarget {
  minecraft: string
  loader: Loader
  loaderVersion: string | null
}

const LOADER_KEYS: Array<[string, Loader]> = [
  ['fabric-loader', 'fabric'],
  ['quilt-loader', 'quilt'],
  ['neoforge', 'neoforge'],
  ['forge', 'forge'],
]

export function packTarget(index: MrpackIndex): PackTarget {
  const minecraft = index.dependencies.minecraft
  if (!minecraft) throw new Error('This modpack does not say which Minecraft version it needs.')
  for (const [key, loader] of LOADER_KEYS) {
    const version = index.dependencies[key]
    if (version) return { minecraft, loader, loaderVersion: version }
  }
  return { minecraft, loader: 'vanilla', loaderVersion: null }
}

/** Resolves `rel` inside `root`, refusing absolute paths and `..` escapes from untrusted archives. */
export function safeJoin(root: string, rel: string): string {
  const base = resolve(root)
  const full = resolve(base, rel)
  if (!full.startsWith(base + sep)) throw new Error(`Refusing to write outside the instance folder: ${rel}`)
  return full
}

export async function readMrpackIndex(file: string): Promise<MrpackIndex> {
  const zip = await open(file, { lazyEntries: true, autoClose: false })
  try {
    for await (const entry of walkEntriesGenerator(zip)) {
      if (entry.fileName === 'modrinth.index.json') {
        const index = JSON.parse((await readEntry(zip, entry)).toString('utf8')) as MrpackIndex
        if (index.game !== 'minecraft' || index.formatVersion !== 1) throw new Error('Unsupported modpack format.')
        return index
      }
    }
  } finally {
    zip.close()
  }
  throw new Error('Not a Modrinth modpack (modrinth.index.json missing).')
}

/** Files the client needs, as verified downloads into the instance folder. */
export function packFiles(index: MrpackIndex, gameDir: string): InstallFile[] {
  return index.files
    .filter((f) => f.env?.client !== 'unsupported')
    .map((f) => {
      const urls = f.downloads.filter((u) => u.startsWith('https://'))
      if (!urls.length) throw new Error(`No secure download for ${f.path}`)
      return { path: safeJoin(gameDir, f.path), urls, size: f.fileSize, checksum: { algorithm: 'sha1', value: f.hashes.sha1 } }
    })
}

/** Extracts `overrides/` then `client-overrides/` (which wins) into the instance folder. */
export async function extractOverrides(file: string, gameDir: string): Promise<number> {
  let count = 0
  for (const prefix of ['overrides/', 'client-overrides/']) {
    const zip = await open(file, { lazyEntries: true, autoClose: false })
    try {
      for await (const entry of walkEntriesGenerator(zip)) {
        if (!entry.fileName.startsWith(prefix) || entry.fileName.endsWith('/')) continue
        const dest = safeJoin(gameDir, entry.fileName.slice(prefix.length))
        await mkdir(dirname(dest), { recursive: true })
        await pipeline(await openEntryReadStream(zip, entry), createWriteStream(dest))
        count++
      }
    } finally {
      zip.close()
    }
  }
  return count
}
