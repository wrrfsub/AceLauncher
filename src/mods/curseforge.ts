import type { ContentKind, Loader, ProjectHit, ProjectType, SearchQuery } from '../shared/types.ts'
import { getJson } from '../utils/http.ts'
import type { ContentProvider, ProjectMeta, RemoteFile, ResolveTarget } from './provider.ts'

/**
 * CurseForge Core API. Needs an API key from https://console.curseforge.com (free, but bound by
 * CurseForge's terms). Authors can opt out of third-party downloads; those files have no downloadUrl.
 */
const API = 'https://api.curseforge.com/v1'
const MINECRAFT = 432

const CLASS_ID: Record<ProjectType, number> = { mod: 6, resourcepack: 12, shader: 6552, modpack: 4471 }
const TYPE_BY_CLASS: Record<number, ProjectType> = { 6: 'mod', 12: 'resourcepack', 6552: 'shader', 4471: 'modpack' }
const LOADER_TYPE: Partial<Record<Loader, number>> = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 }
const SORT: Record<SearchQuery['sort'], number> = { relevance: 2, downloads: 6, updated: 3, newest: 11 }

interface CfMod {
  id: number
  slug: string
  name: string
  summary: string
  classId: number
  authors: Array<{ name: string }>
  logo: { thumbnailUrl: string } | null
  downloadCount: number
  links: { websiteUrl: string }
  categories: Array<{ name: string }>
}

interface CfFile {
  id: number
  modId: number
  displayName: string
  fileName: string
  fileDate: string
  fileLength: number
  downloadUrl: string | null
  gameVersions: string[]
  hashes: Array<{ value: string; algo: number }>
  dependencies: Array<{ modId: number; relationType: number }>
}

export function createCurseForge(apiKey: string): ContentProvider {
  const get = <T>(path: string) => getJson<{ data: T; pagination?: { totalCount: number } }>(`${API}${path}`, { headers: { 'x-api-key': apiKey } })

  return {
    async search(q) {
      const params = new URLSearchParams({
        gameId: String(MINECRAFT),
        classId: String(CLASS_ID[q.projectType]),
        searchFilter: q.query,
        sortField: String(SORT[q.sort]),
        sortOrder: 'desc',
        index: String(q.offset),
        pageSize: String(Math.min(q.limit, 50)),
      })
      if (q.minecraft) params.set('gameVersion', q.minecraft)
      const loaderType = q.loader ? LOADER_TYPE[q.loader] : undefined
      if (loaderType && (q.projectType === 'mod' || q.projectType === 'modpack')) params.set('modLoaderType', String(loaderType))
      const res = await get<CfMod[]>(`/mods/search?${params}`)
      return {
        // CurseForge refuses index + pageSize beyond 10k.
        total: Math.min(res.pagination?.totalCount ?? res.data.length, 10_000),
        hits: res.data.map(
          (m): ProjectHit => ({
            source: 'curseforge',
            id: String(m.id),
            slug: m.slug,
            title: m.name,
            description: m.summary,
            author: m.authors[0]?.name ?? '',
            iconUrl: m.logo?.thumbnailUrl ?? null,
            downloads: m.downloadCount,
            projectType: TYPE_BY_CLASS[m.classId] ?? q.projectType,
            categories: m.categories.map((c) => c.name).slice(0, 3),
            url: m.links.websiteUrl,
          }),
        ),
      }
    },

    async project(id): Promise<ProjectMeta> {
      const { data: m } = await get<CfMod>(`/mods/${encodeURIComponent(id)}`)
      return { id: String(m.id), title: m.name, iconUrl: m.logo?.thumbnailUrl ?? null, projectType: TYPE_BY_CLASS[m.classId] ?? 'mod' }
    },

    async resolveFile(projectId, target: ResolveTarget, pinned) {
      let file: CfFile | undefined
      if (pinned) {
        file = (await get<CfFile>(`/mods/${projectId}/files/${pinned}`)).data
      } else {
        const params = new URLSearchParams({ gameVersion: target.minecraft, pageSize: '50' })
        const loaderType = kindUsesLoader(target.kind) ? LOADER_TYPE[target.loader] : undefined
        if (loaderType) params.set('modLoaderType', String(loaderType))
        const files = (await get<CfFile[]>(`/mods/${projectId}/files?${params}`)).data
        file = files.sort((a, b) => b.fileDate.localeCompare(a.fileDate))[0]
      }
      if (!file) throw new Error(`No file for Minecraft ${target.minecraft} on CurseForge.`)
      if (!file.downloadUrl) {
        throw new Error(`The author of this project doesn't allow downloads from other launchers. Get "${file.displayName}" from curseforge.com.`)
      }
      return {
        projectId: String(file.modId),
        versionId: String(file.id),
        versionNumber: file.displayName,
        fileName: file.fileName,
        url: file.downloadUrl,
        sha1: file.hashes.find((h) => h.algo === 1)?.value ?? null,
        size: file.fileLength,
        dependencies: file.dependencies.filter((d) => d.relationType === 3).map((d) => ({ projectId: String(d.modId), versionId: null })),
        incompatible: file.dependencies.filter((d) => d.relationType === 5).map((d) => String(d.modId)),
      } satisfies RemoteFile
    },
  }
}

function kindUsesLoader(kind: ContentKind): boolean {
  return kind === 'mod'
}
