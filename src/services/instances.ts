import { randomUUID } from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { db } from '../database/index.ts'
import type { Instance, InstanceInput, InstancePatch, Loader } from '../shared/types.ts'
import { logActivity } from './activity.ts'
import { broadcast } from './events.ts'
import { paths } from './settings.ts'

interface Row {
  id: string
  name: string
  minecraft: string
  loader: Loader
  loader_version: string | null
  version_id: string | null
  installed: number
  game_dir: string
  java_path: string | null
  min_memory: number | null
  max_memory: number | null
  jvm_args: string
  game_args: string
  icon: string | null
  created_at: number
  last_played_at: number | null
  play_time: number
}

function toInstance(r: Row): Instance {
  return {
    id: r.id,
    name: r.name,
    minecraft: r.minecraft,
    loader: r.loader,
    loaderVersion: r.loader_version,
    versionId: r.version_id,
    installed: !!r.installed,
    gameDir: r.game_dir,
    javaPath: r.java_path,
    minMemory: r.min_memory,
    maxMemory: r.max_memory,
    jvmArgs: r.jvm_args,
    gameArgs: r.game_args,
    icon: r.icon,
    createdAt: r.created_at,
    lastPlayedAt: r.last_played_at,
    playTime: r.play_time,
  }
}

export function listInstances(): Instance[] {
  const list = db().prepare('SELECT * FROM instances ORDER BY COALESCE(last_played_at, created_at) DESC').all() as unknown as Row[]
  return list.map(toInstance)
}

export function getInstance(id: string): Instance {
  const row = db().prepare('SELECT * FROM instances WHERE id = ?').get(id) as Row | undefined
  if (!row) throw new Error('That instance no longer exists.')
  return toInstance(row)
}

function changed(): void {
  broadcast('instances:changed', listInstances())
}

export async function createInstance(input: InstanceInput): Promise<Instance> {
  const id = randomUUID()
  // Each instance gets its own game directory (saves, mods, options.txt); versions/libraries/assets are shared.
  const gameDir = join(paths.instances(), id)
  await mkdir(gameDir, { recursive: true })
  db()
    .prepare(
      `INSERT INTO instances (id, name, minecraft, loader, loader_version, game_dir, icon, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, input.name.trim(), input.minecraft, input.loader, input.loader === 'vanilla' ? null : input.loaderVersion, gameDir, input.icon ?? null, Date.now())
  logActivity('create', `Created ${input.name.trim()}`, id)
  changed()
  return getInstance(id)
}

const PATCH_COLUMNS: Record<keyof InstancePatch, string> = {
  name: 'name',
  javaPath: 'java_path',
  minMemory: 'min_memory',
  maxMemory: 'max_memory',
  jvmArgs: 'jvm_args',
  gameArgs: 'game_args',
  icon: 'icon',
}

export function updateInstance(id: string, patch: InstancePatch): Instance {
  const entries = Object.entries(patch) as Array<[keyof InstancePatch, unknown]>
  if (entries.length) {
    const sets = entries.map(([k]) => `${PATCH_COLUMNS[k]} = ?`).join(', ')
    db()
      .prepare(`UPDATE instances SET ${sets} WHERE id = ?`)
      .run(...entries.map(([, v]) => v as string | number | null), id)
    changed()
  }
  return getInstance(id)
}

export function markInstalled(id: string, versionId: string): void {
  db().prepare('UPDATE instances SET installed = 1, version_id = ? WHERE id = ?').run(versionId, id)
  changed()
}

export function recordPlay(id: string, startedAt: number): void {
  const seconds = Math.round((Date.now() - startedAt) / 1000)
  db().prepare('UPDATE instances SET last_played_at = ?, play_time = play_time + ? WHERE id = ?').run(startedAt, seconds, id)
  changed()
}

export async function deleteInstance(id: string): Promise<void> {
  const inst = getInstance(id)
  db().prepare('DELETE FROM instances WHERE id = ?').run(id)
  changed()
  // Only ever delete directories the launcher created inside its own instances folder.
  if (inst.gameDir.startsWith(paths.instances() + sep)) await rm(inst.gameDir, { recursive: true, force: true })
  logActivity('create', `Deleted ${inst.name}`)
}
