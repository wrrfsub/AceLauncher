import { app } from 'electron'
import electronUpdater from 'electron-updater'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { broadcast } from '../services/events.ts'
import { runningCount } from '../services/game.ts'
import { getSettings } from '../services/settings.ts'
import type { UpdateState } from '../shared/types.ts'

const { autoUpdater } = electronUpdater

let state: UpdateState = { status: 'idle', version: null, progress: 0, error: null }

function set(patch: Partial<UpdateState>): UpdateState {
  state = { ...state, ...patch }
  broadcast('updates:state', state)
  return state
}

export function updateState(): UpdateState {
  return state
}

/**
 * The feed comes from electron-builder's `publish` config, written into app-update.yml at package
 * time (see electron-builder.yml / ACE_UPDATE_URL). Dev builds and builds without a feed report
 * "unconfigured" instead of pretending to check.
 */
function configured(): boolean {
  return app.isPackaged && existsSync(join(process.resourcesPath, 'app-update.yml'))
}

export function initUpdater(): void {
  if (!configured()) {
    state.status = 'unconfigured'
    return
  }
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: null }))
  autoUpdater.on('update-available', (info) => set({ status: 'available', version: info.version }))
  autoUpdater.on('update-not-available', () => set({ status: 'not-available' }))
  autoUpdater.on('download-progress', (p) => set({ status: 'downloading', progress: p.percent }))
  autoUpdater.on('update-downloaded', (info) => set({ status: 'downloaded', version: info.version, progress: 100 }))
  autoUpdater.on('error', (e) => set({ status: 'error', error: e.message }))
  if (getSettings().autoCheckUpdates) void checkForUpdates()
}

export async function checkForUpdates(): Promise<UpdateState> {
  if (!configured()) return state
  autoUpdater.allowPrerelease = getSettings().allowPrerelease
  await autoUpdater.checkForUpdates().catch((e: Error) => set({ status: 'error', error: e.message }))
  return state
}

export async function downloadUpdate(): Promise<void> {
  if (state.status !== 'available') throw new Error('No update to download.')
  await autoUpdater.downloadUpdate()
}

export function installUpdate(): void {
  if (state.status !== 'downloaded') throw new Error('The update has not finished downloading.')
  if (runningCount() > 0) throw new Error('Close Minecraft before restarting to update.')
  autoUpdater.quitAndInstall()
}
