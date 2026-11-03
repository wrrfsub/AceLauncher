import { app } from 'electron'
import { join } from 'node:path'
import { db } from '../database/index.ts'
import type { Settings } from '../shared/types.ts'

function defaults(): Settings {
  return {
    dataDir: join(app.getPath('userData'), 'game'),
    minMemory: 512,
    maxMemory: 4096,
    javaPath: null,
    autoInstallJava: true,
    jvmArgs: '',
    maxConcurrentDownloads: 16,
    theme: 'dark',
    accent: 'mint',
    reduceMotion: false,
    onLaunch: 'keep',
    autoCheckUpdates: true,
    allowPrerelease: false,
    msClientId: '',
    curseforgeApiKey: '',
    featuredInstanceId: null,
    discordPresence: true,
    discordClientId: '',
  }
}

export function getSettings(): Settings {
  const rows = db().prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>
  const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]))
  return { ...defaults(), ...stored }
}

/** `patch` is validated by the IPC layer; unknown keys never reach here. */
export function updateSettings(patch: Partial<Settings>): Settings {
  const stmt = db().prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  for (const [key, value] of Object.entries(patch)) stmt.run(key, JSON.stringify(value))
  return getSettings()
}

export function msClientId(): string {
  return getSettings().msClientId || import.meta.env.MAIN_VITE_MS_CLIENT_ID || ''
}

export function curseforgeApiKey(): string {
  return getSettings().curseforgeApiKey || import.meta.env.MAIN_VITE_CURSEFORGE_API_KEY || ''
}

export function discordClientId(): string {
  return getSettings().discordClientId || import.meta.env.MAIN_VITE_DISCORD_CLIENT_ID || ''
}

export const paths = {
  root: () => getSettings().dataDir,
  instances: () => join(getSettings().dataDir, 'instances'),
  runtimes: () => join(getSettings().dataDir, 'runtimes'),
}
