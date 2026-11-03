import { app } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createCurseForge } from '../mods/curseforge.ts'
import { modrinth, versionToFile } from '../mods/modrinth.ts'
import { extractOverrides, packFiles, packTarget, readMrpackIndex, safeJoin } from '../mods/mrpack.ts'
import type { ContentProvider, RemoteFile } from '../mods/provider.ts'
import { runFiles } from '../minecraft/runtime.ts'
import { db, transaction } from '../database/index.ts'
import type { ContentKind, ContentSource, Instance, InstalledContent, SearchQuery, SearchResult } from '../shared/types.ts'
import { logActivity } from './activity.ts'
import { createInstance, deleteInstance, getInstance } from './instances.ts'
import { curseforgeApiKey } from './settings.ts'
import { runTask } from './tasks.ts'

export const CONTENT_DIRS: Record<ContentKind, string> = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks' }
const DISABLED = '.disabled'

function provider(source: ContentSource): ContentProvider {
  if (source === 'modrinth') return modrinth
  const key = curseforgeApiKey()
  if (!key) throw new Error('CurseForge needs an API key. Add one in Settings → Advanced.')
  return createCurseForge(key)
}

export function searchContent(query: SearchQuery): Promise<SearchResult> {
  if (query.source === 'curseforge' && query.projectType === 'modpack') {
    throw new Error('CurseForge modpacks are not supported yet — use Modrinth for modpacks.')
  }
  return provider(query.source).search(query)
}

interface MetaRow {
  file_name: string
  source: ContentSource
  project_id: string
  version_number: string | null
  title: string | null
  icon_url: string | null
}

export async function listContent(instanceId: string, kind: ContentKind): Promise<InstalledContent[]> {
  const dir = join(getInstance(instanceId).gameDir, CONTENT_DIRS[kind])
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const meta = new Map(
    (db().prepare('SELECT * FROM instance_content WHERE instance_id = ? AND kind = ?').all(instanceId, kind) as unknown as MetaRow[]).map((r) => [
      r.file_name,
      r,
    ]),
  )
  const list = await Promise.all(
    entries
      // Packs can be folders; mods must be jars.
      .filter((e) => (kind === 'mod' ? e.isFile() && /\.jar(\.disabled)?$/.test(e.name) : !e.name.startsWith('.')))
      .map(async (e): Promise<InstalledContent> => {
        const enabled = !e.name.endsWith(DISABLED)
        const fileName = enabled ? e.name : e.name.slice(0, -DISABLED.length)
        const m = meta.get(fileName)
        const size = e.isFile() ? (await stat(join(dir, e.name))).size : 0
        return {
          fileName,
          kind,
          enabled,
          size,
          title: m?.title ?? null,
          source: m?.source ?? null,
          projectId: m?.project_id ?? null,
          versionNumber: m?.version_number ?? null,
          iconUrl: m?.icon_url ?? null,
        }
      }),
  )
  return list.sort((a, b) => (a.title ?? a.fileName).localeCompare(b.title ?? b.fileName))
}

function contentPath(inst: Instance, kind: ContentKind, fileName: string, enabled = true): string {
  return safeJoin(join(inst.gameDir, CONTENT_DIRS[kind]), enabled ? fileName : fileName + DISABLED)
}

export async function removeContent(instanceId: string, kind: ContentKind, fileName: string): Promise<InstalledContent[]> {
  const inst = getInstance(instanceId)
  await rm(contentPath(inst, kind, fileName), { recursive: true, force: true })
  await rm(contentPath(inst, kind, fileName, false), { recursive: true, force: true })
  db().prepare('DELETE FROM instance_content WHERE instance_id = ? AND kind = ? AND file_name = ?').run(instanceId, kind, fileName)
  return listContent(instanceId, kind)
}

/** Disabling renames `x.jar` to `x.jar.disabled`, the convention every launcher and loader understands. */
export async function toggleContent(instanceId: string, kind: ContentKind, fileName: string, enabled: boolean): Promise<InstalledContent[]> {
  const inst = getInstance(instanceId)
  await rename(contentPath(inst, kind, fileName, !enabled), contentPath(inst, kind, fileName, enabled))
  return listContent(instanceId, kind)
}

/**
 * Installs the newest compatible file of a project plus its required dependencies.
 * Re-installing a project replaces its old file, which doubles as "update".
 */
export function installContent(instanceId: string, source: ContentSource, projectId: string, kind: ContentKind): Promise<InstalledContent[]> {
  const inst = getInstance(instanceId)
  const api = provider(source)
  return runTask({ key: `content:${instanceId}:${source}:${projectId}`, title: `Adding content to ${inst.name}`, instanceId }, async (progress) => {
    const target = { minecraft: inst.minecraft, loader: inst.loader, kind }
    const installed = new Map(
      (db().prepare('SELECT project_id, file_name FROM instance_content WHERE instance_id = ? AND source = ?').all(instanceId, source) as Array<{
        project_id: string
        file_name: string
      }>).map((r) => [r.project_id, r.file_name]),
    )

    // Resolve the project and its required dependency tree first, so nothing is written if any piece is missing.
    progress.stage('Resolving dependencies')
    const plan = new Map<string, { file: RemoteFile; kind: ContentKind }>()
    const visit = async (id: string, pinned: string | null, k: ContentKind, isRoot: boolean) => {
      if (plan.has(id) || (!isRoot && installed.has(id))) return
      const file = await api.resolveFile(id, { ...target, kind: k }, pinned)
      plan.set(id, { file, kind: k })
      for (const dep of file.dependencies) await visit(dep.projectId, dep.versionId, 'mod', false)
    }
    await visit(projectId, null, kind, true)

    const clashes = [...plan.values()].flatMap((p) => p.file.incompatible).filter((id) => installed.has(id) || plan.has(id))
    if (clashes.length) {
      const names = await Promise.all(clashes.map((id) => api.project(id).then((p) => p.title, () => id)))
      throw new Error(`Incompatible with ${names.join(', ')}, which is already in this instance.`)
    }

    const metas = await Promise.all([...plan.keys()].map((id) => api.project(id)))
    progress.stage(plan.size > 1 ? `Downloading ${plan.size} files` : `Downloading ${metas[0]?.title ?? 'file'}`)
    for (const k of new Set([...plan.values()].map((p) => p.kind))) await mkdir(join(inst.gameDir, CONTENT_DIRS[k]), { recursive: true })
    await runFiles(
      'content',
      [...plan.values()].map(({ file, kind: k }) => ({
        path: contentPath(inst, k, file.fileName),
        urls: [file.url],
        size: file.size,
        checksum: file.sha1 ? { algorithm: 'sha1', value: file.sha1 } : undefined,
      })),
      progress,
    )

    for (const [id, { file, kind: k }] of plan) {
      const old = installed.get(id)
      if (old && old !== file.fileName) {
        await rm(contentPath(inst, k, old), { force: true })
        await rm(contentPath(inst, k, old, false), { force: true })
      }
    }
    transaction(() => {
      const del = db().prepare('DELETE FROM instance_content WHERE instance_id = ? AND source = ? AND project_id = ?')
      const ins = db().prepare(
        `INSERT OR REPLACE INTO instance_content (instance_id, kind, file_name, source, project_id, version_id, version_number, title, icon_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      for (const [id, { file, kind: k }] of plan) {
        const meta = metas.find((m) => m.id === id)
        del.run(instanceId, source, id)
        ins.run(instanceId, k, file.fileName, source, id, file.versionId, file.versionNumber, meta?.title ?? null, meta?.iconUrl ?? null)
      }
    })
    logActivity('content', `Added ${metas[0]?.title ?? 'content'}${plan.size > 1 ? ` and ${plan.size - 1} dependencies` : ''} to ${inst.name}`, instanceId)
    return listContent(instanceId, kind)
  })
}

function sha1(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha1')
    createReadStream(file).on('data', (d) => h.update(d)).on('error', reject).on('end', () => resolve(h.digest('hex')))
  })
}

/** Installs a Modrinth modpack (.mrpack) as a new instance, then installs its game version. */
export function installModpack(projectId: string): Promise<Instance> {
  return runTask({ key: `modpack:${projectId}`, title: 'Installing modpack' }, async (progress) => {
    progress.stage('Resolving modpack')
    const [project, versions] = await Promise.all([modrinth.project(projectId), modrinth.versions(projectId)])
    const latest = versions[0]
    if (!latest) throw new Error('This modpack has no versions.')
    const packFile = versionToFile(latest)
    const tmp = join(app.getPath('temp'), `ace-${randomUUID()}.mrpack`)
    let inst: Instance | null = null
    try {
      progress.stage(`Downloading ${project.title}`)
      await runFiles('mrpack', [{ path: tmp, urls: [packFile.url], size: packFile.size, checksum: packFile.sha1 ? { algorithm: 'sha1', value: packFile.sha1 } : undefined }], progress)
      const index = await readMrpackIndex(tmp)
      const target = packTarget(index)
      inst = await createInstance({ name: `${project.title} ${latest.version_number}`.slice(0, 64), ...target, icon: project.iconUrl })
      progress.stage('Downloading modpack files')
      await runFiles('mrpack-files', packFiles(index, inst.gameDir), progress)
      progress.stage('Applying overrides')
      await extractOverrides(tmp, inst.gameDir)
      await identifyMods(inst)
      logActivity('install', `Installed modpack ${project.title}`, inst.id)
      return inst
    } catch (e) {
      // Don't leave a half-built instance behind.
      if (inst) await deleteInstance(inst.id).catch(() => {})
      throw e
    } finally {
      await rm(tmp, { force: true })
    }
  })
}

/** Looks up mods by hash on Modrinth so the installed list shows titles and icons instead of file names. */
async function identifyMods(inst: Instance): Promise<void> {
  const dir = join(inst.gameDir, CONTENT_DIRS.mod)
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith('.jar'))
  const hashes = new Map(await Promise.all(files.map(async (f) => [await sha1(join(dir, f)), f] as const)))
  const found = await modrinth.identify([...hashes.keys()]).catch(() => ({}))
  const entries = Object.entries(found)
  const projects = await modrinth.projects(entries.map(([, v]) => v.project_id)).catch(() => [])
  const ins = db().prepare(
    `INSERT OR REPLACE INTO instance_content (instance_id, kind, file_name, source, project_id, version_id, version_number, title, icon_url)
     VALUES (?, 'mod', ?, 'modrinth', ?, ?, ?, ?, ?)`,
  )
  transaction(() => {
    for (const [hash, v] of entries) {
      const p = projects.find((x) => x.id === v.project_id)
      ins.run(inst.id, hashes.get(hash)!, v.project_id, v.id, v.version_number, p?.title ?? null, p?.iconUrl ?? null)
    }
  })
}
