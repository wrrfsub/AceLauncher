export const LOADERS = ['vanilla', 'fabric', 'forge', 'neoforge', 'quilt'] as const
export type Loader = (typeof LOADERS)[number]

export const CONTENT_KINDS = ['mod', 'resourcepack', 'shader'] as const
export type ContentKind = (typeof CONTENT_KINDS)[number]
export type ProjectType = ContentKind | 'modpack'
export type ContentSource = 'modrinth' | 'curseforge'

/** What the renderer is allowed to know about an account. Tokens never leave the main process. */
export interface Account {
  id: string
  name: string
  uuid: string
  skinUrl: string | null
  active: boolean
  needsReauth: boolean
}

export interface Instance {
  id: string
  name: string
  minecraft: string
  loader: Loader
  loaderVersion: string | null
  /** Version id inside the shared versions folder, known once installed. */
  versionId: string | null
  installed: boolean
  gameDir: string
  javaPath: string | null
  /** null = use the global setting */
  minMemory: number | null
  maxMemory: number | null
  jvmArgs: string
  gameArgs: string
  icon: string | null
  createdAt: number
  lastPlayedAt: number | null
  /** seconds */
  playTime: number
}

export interface InstanceInput {
  name: string
  minecraft: string
  loader: Loader
  loaderVersion: string | null
  icon?: string | null
}

export type InstancePatch = Partial<
  Pick<Instance, 'name' | 'javaPath' | 'minMemory' | 'maxMemory' | 'jvmArgs' | 'gameArgs' | 'icon'>
>

export const ACCENTS = ['mint', 'amber', 'azure', 'violet', 'rose'] as const
export type Accent = (typeof ACCENTS)[number]

export interface Settings {
  dataDir: string
  /** MiB */
  minMemory: number
  maxMemory: number
  javaPath: string | null
  autoInstallJava: boolean
  jvmArgs: string
  maxConcurrentDownloads: number
  theme: 'dark' | 'light' | 'system'
  accent: Accent
  reduceMotion: boolean
  onLaunch: 'keep' | 'minimize'
  autoCheckUpdates: boolean
  allowPrerelease: boolean
  /** Overrides the build-time value when set. */
  msClientId: string
  curseforgeApiKey: string
  featuredInstanceId: string | null
}

export interface McVersion {
  id: string
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha'
  releaseTime: string
}

export interface LoaderVersion {
  version: string
  stable: boolean
}

export interface Task {
  id: string
  kind: 'install' | 'java' | 'content' | 'modpack'
  title: string
  instanceId: string | null
  stage: string
  /** bytes or items, depending on the stage; total 0 = indeterminate */
  progress: number
  total: number
  state: 'running' | 'done' | 'error' | 'cancelled'
  error: string | null
  startedAt: number
}

export type GameState = 'launching' | 'running' | 'exited' | 'crashed'

export interface GameStatus {
  instanceId: string
  state: GameState
  pid: number | null
  startedAt: number
  exitCode: number | null
  crashReport: string | null
}

export interface LogLine {
  instanceId: string
  ts: number
  stream: 'stdout' | 'stderr' | 'launcher'
  level: 'info' | 'warn' | 'error' | 'debug'
  text: string
}

export interface JavaRuntime {
  path: string
  version: string
  majorVersion: number
  managed: boolean
}

export type SearchSort = 'relevance' | 'downloads' | 'updated' | 'newest'

export interface SearchQuery {
  source: ContentSource
  projectType: ProjectType
  query: string
  minecraft: string | null
  loader: Loader | null
  sort: SearchSort
  offset: number
  limit: number
}

export interface ProjectHit {
  source: ContentSource
  id: string
  slug: string
  title: string
  description: string
  author: string
  iconUrl: string | null
  downloads: number
  projectType: ProjectType
  categories: string[]
  url: string
}

export interface SearchResult {
  hits: ProjectHit[]
  total: number
}

export interface InstalledContent {
  fileName: string
  kind: ContentKind
  enabled: boolean
  size: number
  title: string | null
  source: ContentSource | null
  projectId: string | null
  versionNumber: string | null
  iconUrl: string | null
}

export interface NewsItem {
  id: string
  title: string
  summary: string
  imageUrl: string | null
  url: string | null
  date: string
  tag: string
}

export interface Activity {
  id: number
  at: number
  kind: 'launch' | 'install' | 'crash' | 'create' | 'content' | 'account' | 'error'
  message: string
  instanceId: string | null
}

export interface UpdateState {
  status: 'idle' | 'unconfigured' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version: string | null
  progress: number
  error: string | null
}

export interface AppInfo {
  name: string
  version: string
  platform: string
  /** bytes */
  totalMemory: number
  tokenStorage: 'secure' | 'weak' | 'unavailable'
  authConfigured: boolean
  curseforgeEnabled: boolean
}
