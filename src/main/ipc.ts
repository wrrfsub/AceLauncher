import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { getLoaderVersions, getMinecraftVersions } from '../minecraft/versions.ts'
import { probeJava } from '../minecraft/java.ts'
import { listActivity } from '../services/activity.ts'
import { listAccounts, login, removeAccount, selectAccount, tokenStorage } from '../services/accounts.ts'
import { installContent, installModpack, listContent, removeContent, searchContent, toggleContent } from '../services/content.ts'
import { gameLogs, gameStatuses, installInstance, killGame, launchInstance, listJava } from '../services/game.ts'
import { createInstance, deleteInstance, getInstance, listInstances, updateInstance } from '../services/instances.ts'
import { listNews } from '../services/news.ts'
import { curseforgeApiKey, getSettings, msClientId, updateSettings } from '../services/settings.ts'
import { cancelTask, listTasks } from '../services/tasks.ts'
import { BRANDING } from '../shared/branding.ts'
import type { InvokeChannel, IpcApi, IpcResult } from '../shared/ipc.ts'
import { ACCENTS, CONTENT_KINDS, LOADERS } from '../shared/types.ts'
import { checkForUpdates, downloadUpdate, installUpdate, updateState } from './updater.ts'

type Arg<K extends InvokeChannel> = Parameters<IpcApi[K]>[0]
type Ret<K extends InvokeChannel> = ReturnType<IpcApi[K]>

/** Only our own renderer (dev server or bundled file) may call into the main process. */
function trusted(e: IpcMainInvokeEvent): boolean {
  const url = e.senderFrame?.url ?? ''
  const dev = process.env.ELECTRON_RENDERER_URL
  return dev ? url.startsWith(dev) : url.startsWith('file://')
}

function handle<K extends InvokeChannel>(channel: K, schema: z.ZodType<Arg<K>>, fn: (arg: Arg<K>) => Ret<K> | Promise<Ret<K>>): void {
  ipcMain.handle(channel, async (e, raw: unknown): Promise<IpcResult<Ret<K>>> => {
    if (!trusted(e)) return { ok: false, error: 'Untrusted sender' }
    const parsed = schema.safeParse(raw)
    if (!parsed.success) return { ok: false, error: `Invalid request: ${parsed.error.issues[0]?.message ?? 'bad input'}` }
    try {
      return { ok: true, data: await fn(parsed.data) }
    } catch (err) {
      console.error(`[ipc] ${channel}:`, err)
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

const none = z.undefined()
const id = z.uuid()
const text = (max: number) => z.string().max(max)
const memory = z.int().min(256).max(262_144)
const versionId = z.string().regex(/^[\w.+-]{1,64}$/, 'invalid version')
const projectId = z.string().regex(/^[\w-]{1,64}$/, 'invalid project id')
const fileName = z.string().min(1).max(255).refine((s) => !/[\\/]|^\.\.?$/.test(s), 'invalid file name')
const javaPath = z.string().min(1).max(1024).nullable()
const httpsUrl = z.url({ protocol: /^https$/ })

const settingsPatch = z
  .object({
    dataDir: z.string().min(1).max(1024),
    minMemory: memory,
    maxMemory: memory,
    javaPath,
    autoInstallJava: z.boolean(),
    jvmArgs: text(4096),
    maxConcurrentDownloads: z.int().min(1).max(64),
    theme: z.enum(['dark', 'light', 'system']),
    accent: z.enum(ACCENTS),
    reduceMotion: z.boolean(),
    onLaunch: z.enum(['keep', 'minimize']),
    autoCheckUpdates: z.boolean(),
    allowPrerelease: z.boolean(),
    msClientId: z.string().regex(/^([0-9a-f-]{36})?$/i, 'client id must be a GUID'),
    curseforgeApiKey: text(256),
    featuredInstanceId: id.nullable(),
  })
  .partial()
  .strict()

const loader = z.enum(LOADERS)
const kind = z.enum(CONTENT_KINDS)

export function registerIpc(): void {
  handle('app:info', none, () => ({
    name: BRANDING.name,
    version: app.getVersion(),
    platform: process.platform,
    tokenStorage: tokenStorage(),
    authConfigured: !!msClientId(),
    curseforgeEnabled: !!curseforgeApiKey(),
  }))
  handle('app:openExternal', httpsUrl, (url) => shell.openExternal(url))

  handle('settings:get', none, getSettings)
  handle('settings:set', settingsPatch, (patch) => {
    const next = updateSettings(patch)
    if (patch.theme) applyTitleBarTheme()
    return next
  })

  handle('accounts:list', none, listAccounts)
  handle('accounts:login', none, login)
  handle('accounts:select', id, selectAccount)
  handle('accounts:remove', id, removeAccount)

  handle('versions:minecraft', none, getMinecraftVersions)
  handle('versions:loader', z.object({ loader: z.enum(['fabric', 'forge', 'neoforge', 'quilt']), minecraft: versionId }), ({ loader, minecraft }) =>
    getLoaderVersions(loader, minecraft),
  )

  handle('instances:list', none, listInstances)
  handle(
    'instances:create',
    z.object({ name: z.string().trim().min(1).max(64), minecraft: versionId, loader, loaderVersion: versionId.nullable(), icon: httpsUrl.nullable().optional() }),
    (input) => {
      if (input.loader !== 'vanilla' && !input.loaderVersion) throw new Error('Pick a loader version.')
      return createInstance(input)
    },
  )
  handle(
    'instances:update',
    z.object({
      id,
      patch: z
        .object({
          name: z.string().trim().min(1).max(64),
          javaPath,
          minMemory: memory.nullable(),
          maxMemory: memory.nullable(),
          jvmArgs: text(4096),
          gameArgs: text(4096),
          icon: httpsUrl.nullable(),
        })
        .partial()
        .strict(),
    }),
    ({ id, patch }) => updateInstance(id, patch),
  )
  handle('instances:delete', id, (i) => {
    if (gameStatuses().some((s) => s.instanceId === i && (s.state === 'running' || s.state === 'launching'))) {
      throw new Error('Close the game before deleting this instance.')
    }
    return deleteInstance(i)
  })
  handle('instances:install', id, async (i) => void (await installInstance(i)))
  handle('instances:repair', id, async (i) => void (await installInstance(i, true)))
  handle('instances:openFolder', z.object({ id, sub: z.enum(['mods', 'resourcepacks', 'shaderpacks', 'logs', 'saves']).optional() }), async ({ id, sub }) => {
    const dir = sub ? join(getInstance(id).gameDir, sub) : getInstance(id).gameDir
    await mkdir(dir, { recursive: true })
    const err = await shell.openPath(dir)
    if (err) throw new Error(err)
  })

  handle('game:launch', id, launchInstance)
  handle('game:kill', id, killGame)
  handle('game:status', none, gameStatuses)
  handle('game:logs', id, gameLogs)

  handle('java:list', z.boolean(), listJava)
  handle('dialog:pickJava', none, async () => {
    const win = BrowserWindow.getFocusedWindow()
    const opts = { title: 'Select a Java executable', properties: ['openFile' as const] }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    const path = res.filePaths[0]
    if (res.canceled || !path) return null
    if (!(await probeJava(path))) throw new Error("That file isn't a working Java executable.")
    return path
  })
  handle('dialog:pickDirectory', none, async () => {
    const win = BrowserWindow.getFocusedWindow()
    const opts = { title: 'Select a folder', properties: ['openDirectory' as const, 'createDirectory' as const] }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })

  handle('tasks:list', none, listTasks)
  handle('tasks:cancel', id, cancelTask)

  handle(
    'content:search',
    z.object({
      source: z.enum(['modrinth', 'curseforge']),
      projectType: z.enum([...CONTENT_KINDS, 'modpack']),
      query: text(200),
      minecraft: versionId.nullable(),
      loader: loader.nullable(),
      sort: z.enum(['relevance', 'downloads', 'updated', 'newest']),
      offset: z.int().min(0).max(10_000),
      limit: z.int().min(1).max(50),
    }),
    searchContent,
  )
  handle('content:install', z.object({ instanceId: id, source: z.enum(['modrinth', 'curseforge']), projectId, kind }), (a) =>
    installContent(a.instanceId, a.source, a.projectId, a.kind),
  )
  handle('content:list', z.object({ instanceId: id, kind }), (a) => listContent(a.instanceId, a.kind))
  handle('content:remove', z.object({ instanceId: id, kind, fileName }), (a) => removeContent(a.instanceId, a.kind, a.fileName))
  handle('content:toggle', z.object({ instanceId: id, kind, fileName, enabled: z.boolean() }), (a) =>
    toggleContent(a.instanceId, a.kind, a.fileName, a.enabled),
  )
  handle('modpack:install', z.object({ projectId }), async ({ projectId }) => {
    const inst = await installModpack(projectId)
    // Game files install as their own visible task; failures surface there and on launch.
    installInstance(inst.id).catch((e) => console.error('[modpack] game install failed:', e))
    return inst
  })

  handle('news:list', none, listNews)
  handle('activity:list', none, () => listActivity())

  handle('updates:state', none, updateState)
  handle('updates:check', none, checkForUpdates)
  handle('updates:download', none, downloadUpdate)
  handle('updates:install', none, installUpdate)

}

/** Keeps the native window-control glyphs readable when the theme changes (Windows/Linux overlay). */
export function applyTitleBarTheme(): void {
  if (process.platform === 'darwin') return
  const light = getSettings().theme === 'light'
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.setTitleBarOverlay({ color: '#00000000', symbolColor: light ? '#3f3f46' : '#a1a1aa', height: 40 })
    } catch {
      /* windows without an overlay (e.g. the sign-in popup) */
    }
  }
}
