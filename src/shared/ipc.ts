import type {
  Account,
  Activity,
  AppInfo,
  ContentKind,
  ContentSource,
  GameStatus,
  Instance,
  InstanceInput,
  InstancePatch,
  InstalledContent,
  JavaRuntime,
  Loader,
  LoaderVersion,
  LogLine,
  McVersion,
  NewsItem,
  SearchQuery,
  SearchResult,
  Settings,
  Task,
  UpdateState,
} from './types'

/** Request/response channels. Every handler validates its payload in the main process. */
export interface IpcApi {
  'app:info': () => AppInfo
  'app:openExternal': (url: string) => void

  'settings:get': () => Settings
  'settings:set': (patch: Partial<Settings>) => Settings

  'accounts:list': () => Account[]
  'accounts:login': () => Account
  'accounts:select': (id: string) => Account[]
  'accounts:remove': (id: string) => Account[]

  'versions:minecraft': () => McVersion[]
  'versions:loader': (args: { loader: Exclude<Loader, 'vanilla'>; minecraft: string }) => LoaderVersion[]

  'instances:list': () => Instance[]
  'instances:create': (input: InstanceInput) => Instance
  'instances:update': (args: { id: string; patch: InstancePatch }) => Instance
  'instances:delete': (id: string) => void
  'instances:install': (id: string) => void
  'instances:repair': (id: string) => void
  'instances:openFolder': (args: { id: string; sub?: 'mods' | 'resourcepacks' | 'shaderpacks' | 'logs' | 'saves' }) => void

  'game:launch': (id: string) => void
  'game:kill': (id: string) => void
  'game:status': () => GameStatus[]
  'game:logs': (id: string) => LogLine[]

  'java:list': (refresh: boolean) => JavaRuntime[]
  'dialog:pickJava': () => string | null
  'dialog:pickDirectory': () => string | null

  'tasks:list': () => Task[]
  'tasks:cancel': (id: string) => void

  'content:search': (query: SearchQuery) => SearchResult
  'content:install': (args: { instanceId: string; source: ContentSource; projectId: string; kind: ContentKind }) => InstalledContent[]
  'content:list': (args: { instanceId: string; kind: ContentKind }) => InstalledContent[]
  'content:remove': (args: { instanceId: string; kind: ContentKind; fileName: string }) => InstalledContent[]
  'content:toggle': (args: { instanceId: string; kind: ContentKind; fileName: string; enabled: boolean }) => InstalledContent[]
  'modpack:install': (args: { projectId: string }) => Instance

  'news:list': () => NewsItem[]
  'activity:list': () => Activity[]

  'updates:state': () => UpdateState
  'updates:check': () => UpdateState
  'updates:download': () => void
  'updates:install': () => void
}

/** Main → renderer push events. */
export interface IpcEvents {
  'tasks:changed': Task[]
  'instances:changed': Instance[]
  'accounts:changed': Account[]
  'activity:changed': Activity[]
  'game:status': GameStatus
  'game:log': LogLine[]
  'updates:state': UpdateState
}

export type InvokeChannel = keyof IpcApi
export type EventChannel = keyof IpcEvents

// Runtime allowlists for the preload bridge. `satisfies` keeps them in sync with the interfaces above.
export const INVOKE_CHANNELS = [
  'app:info', 'app:openExternal',
  'settings:get', 'settings:set',
  'accounts:list', 'accounts:login', 'accounts:select', 'accounts:remove',
  'versions:minecraft', 'versions:loader',
  'instances:list', 'instances:create', 'instances:update', 'instances:delete',
  'instances:install', 'instances:repair', 'instances:openFolder',
  'game:launch', 'game:kill', 'game:status', 'game:logs',
  'java:list', 'dialog:pickJava', 'dialog:pickDirectory',
  'tasks:list', 'tasks:cancel',
  'content:search', 'content:install', 'content:list', 'content:remove', 'content:toggle', 'modpack:install',
  'news:list', 'activity:list',
  'updates:state', 'updates:check', 'updates:download', 'updates:install',
] as const satisfies readonly InvokeChannel[]

export const EVENT_CHANNELS = [
  'tasks:changed', 'instances:changed', 'accounts:changed', 'activity:changed',
  'game:status', 'game:log', 'updates:state',
] as const satisfies readonly EventChannel[]

/** Handlers return this envelope so error messages survive the IPC boundary intact. */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

// Compile-time check that the allowlists cover every channel.
type MissingInvoke = Exclude<InvokeChannel, (typeof INVOKE_CHANNELS)[number]>
type MissingEvent = Exclude<EventChannel, (typeof EVENT_CHANNELS)[number]>
export const CHANNELS_COMPLETE: [MissingInvoke | MissingEvent] extends [never] ? true : never = true
