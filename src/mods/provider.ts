import type { ContentKind, Loader, ProjectType, SearchQuery, SearchResult } from '../shared/types.ts'

/** A concrete downloadable file, resolved for one instance's Minecraft version and loader. */
export interface RemoteFile {
  projectId: string
  versionId: string
  versionNumber: string
  fileName: string
  url: string
  sha1: string | null
  size: number
  /** Required dependencies: project ids, with a pinned version when the author pinned one. */
  dependencies: Array<{ projectId: string; versionId: string | null }>
  incompatible: string[]
}

export interface ProjectMeta {
  id: string
  title: string
  iconUrl: string | null
  projectType: ProjectType
}

export interface ResolveTarget {
  minecraft: string
  loader: Loader
  kind: ContentKind
}

export interface ContentProvider {
  search(query: SearchQuery): Promise<SearchResult>
  project(id: string): Promise<ProjectMeta>
  /** Newest file compatible with the target, or a pinned version. Throws a readable error if none. */
  resolveFile(projectId: string, target: ResolveTarget, pinnedVersion?: string | null): Promise<RemoteFile>
}

/** Loaders whose mods run on `loader`. Quilt loads Fabric mods. */
export function compatibleLoaders(loader: Loader): string[] {
  if (loader === 'quilt') return ['quilt', 'fabric']
  return loader === 'vanilla' ? [] : [loader]
}
