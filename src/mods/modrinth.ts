import type { ProjectHit, ProjectType, SearchQuery, SearchResult } from '../shared/types.ts'
import { getJson, postJson } from '../utils/http.ts'
import { compatibleLoaders, type ContentProvider, type ProjectMeta, type RemoteFile, type ResolveTarget } from './provider.ts'

/** Modrinth API v2 — public, no key required. https://docs.modrinth.com/api */
const API = 'https://api.modrinth.com/v2'

interface MrHit {
  project_id: string
  slug: string
  title: string
  description: string
  author: string
  icon_url: string | null
  downloads: number
  project_type: ProjectType
  display_categories?: string[]
}

interface MrProject {
  id: string
  title: string
  icon_url: string | null
  project_type: ProjectType
}

export interface MrVersion {
  id: string
  project_id: string
  version_number: string
  game_versions: string[]
  loaders: string[]
  files: Array<{ url: string; filename: string; primary: boolean; size: number; hashes: { sha1?: string; sha512?: string } }>
  dependencies: Array<{ project_id: string | null; version_id: string | null; dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded' }>
}

const SORT: Record<SearchQuery['sort'], string> = { relevance: 'relevance', downloads: 'downloads', updated: 'updated', newest: 'newest' }

export function versionToFile(v: MrVersion): RemoteFile {
  const file = v.files.find((f) => f.primary) ?? v.files[0]
  if (!file) throw new Error('That version has no files.')
  return {
    projectId: v.project_id,
    versionId: v.id,
    versionNumber: v.version_number,
    fileName: file.filename,
    url: file.url,
    sha1: file.hashes.sha1 ?? null,
    size: file.size,
    dependencies: v.dependencies
      .filter((d) => d.dependency_type === 'required' && d.project_id)
      .map((d) => ({ projectId: d.project_id!, versionId: d.version_id })),
    incompatible: v.dependencies.filter((d) => d.dependency_type === 'incompatible' && d.project_id).map((d) => d.project_id!),
  }
}

export const modrinth: ContentProvider & {
  versions(projectId: string, loaders?: string[], gameVersions?: string[]): Promise<MrVersion[]>
  identify(sha1s: string[]): Promise<Record<string, MrVersion>>
  projects(ids: string[]): Promise<ProjectMeta[]>
} = {
  async search(q) {
    const facets: string[][] = [[`project_type:${q.projectType}`]]
    if (q.minecraft) facets.push([`versions:${q.minecraft}`])
    if (q.loader && q.loader !== 'vanilla' && (q.projectType === 'mod' || q.projectType === 'modpack')) {
      facets.push(compatibleLoaders(q.loader).map((l) => `categories:${l}`))
    }
    const params = new URLSearchParams({
      query: q.query,
      facets: JSON.stringify(facets),
      index: SORT[q.sort],
      offset: String(q.offset),
      limit: String(q.limit),
    })
    const res = await getJson<{ hits: MrHit[]; total_hits: number }>(`${API}/search?${params}`)
    return {
      total: res.total_hits,
      hits: res.hits.map(
        (h): ProjectHit => ({
          source: 'modrinth',
          id: h.project_id,
          slug: h.slug,
          title: h.title,
          description: h.description,
          author: h.author,
          iconUrl: h.icon_url || null,
          downloads: h.downloads,
          projectType: h.project_type,
          categories: h.display_categories ?? [],
          url: `https://modrinth.com/${h.project_type}/${h.slug}`,
        }),
      ),
    } satisfies SearchResult
  },

  async project(id) {
    const p = await getJson<MrProject>(`${API}/project/${encodeURIComponent(id)}`)
    return { id: p.id, title: p.title, iconUrl: p.icon_url, projectType: p.project_type }
  },

  async projects(ids) {
    if (!ids.length) return []
    const list = await getJson<MrProject[]>(`${API}/projects?ids=${encodeURIComponent(JSON.stringify(ids))}`)
    return list.map((p) => ({ id: p.id, title: p.title, iconUrl: p.icon_url, projectType: p.project_type }))
  },

  versions(projectId, loaders, gameVersions) {
    const params = new URLSearchParams()
    if (loaders?.length) params.set('loaders', JSON.stringify(loaders))
    if (gameVersions?.length) params.set('game_versions', JSON.stringify(gameVersions))
    return getJson<MrVersion[]>(`${API}/project/${encodeURIComponent(projectId)}/version?${params}`)
  },

  async resolveFile(projectId, target: ResolveTarget, pinnedVersion) {
    if (pinnedVersion) return versionToFile(await getJson<MrVersion>(`${API}/version/${encodeURIComponent(pinnedVersion)}`))
    // Loader filtering only applies to mods; packs and shaders are tagged with their own "loaders".
    const loaders = target.kind === 'mod' ? compatibleLoaders(target.loader) : undefined
    const list = await this.versions(projectId, loaders, [target.minecraft])
    const newest = list[0]
    if (!newest) {
      throw new Error(`No version for Minecraft ${target.minecraft}${loaders?.length ? ` (${loaders.join('/')})` : ''}.`)
    }
    return versionToFile(newest)
  },

  /** Maps file SHA-1s to the Modrinth versions they belong to. */
  identify(sha1s) {
    if (!sha1s.length) return Promise.resolve({})
    return postJson(`${API}/version_files`, { json: { hashes: sha1s, algorithm: 'sha1' } })
  },
}
