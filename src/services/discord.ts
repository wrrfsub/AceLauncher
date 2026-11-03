import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { loaderName } from '../minecraft/install.ts'
import { BRANDING } from '../shared/branding.ts'
import type { DiscordStatus, GameStatus, Instance, Task } from '../shared/types.ts'
import { connectDiscord, type Activity, type DiscordConnection } from '../utils/discordIpc.ts'
import { broadcast, bus } from './events.ts'
import { gameStatuses } from './game.ts'
import { getInstance } from './instances.ts'
import { discordClientId, getSettings } from './settings.ts'
import { listTasks } from './tasks.ts'

/**
 * Discord Rich Presence. Connects to the local Discord client when presence is on and an
 * application id is configured, retries quietly while Discord is closed, and mirrors what the
 * launcher is doing: idle, installing, or playing an instance.
 */

const RETRY_MS = 20_000
// Discord accepts ~5 activity updates per 20 s; stay well under it.
const MIN_INTERVAL_MS = 5_000
const startedAt = Date.now()

let conn: DiscordConnection | null = null
let connectedId = ''
let connecting = false
let retryTimer: NodeJS.Timeout | null = null
let sendTimer: NodeJS.Timeout | null = null
let lastSentAt = 0
let lastSent = ''
let status: DiscordStatus = { state: 'off', user: null, error: null }

function setStatus(next: DiscordStatus): void {
  status = next
  broadcast('discord:status', status)
}

export function discordStatus(): DiscordStatus {
  return status
}

export function initDiscord(): void {
  for (const ch of ['game:status', 'tasks:changed', 'instances:changed'] as const) bus.on(ch, schedule)
  syncDiscord()
}

/** Applies the current settings: connect, reconnect with a new id, or disconnect. */
export function syncDiscord(): void {
  const { discordPresence } = getSettings()
  const id = discordClientId()
  if (!discordPresence || !id) {
    disconnect()
    setStatus({ state: discordPresence ? 'unconfigured' : 'off', user: null, error: null })
    return
  }
  if (conn && connectedId !== id) disconnect()
  if (!conn) void connect(id)
}

function disconnect(): void {
  if (retryTimer) clearTimeout(retryTimer)
  if (sendTimer) clearTimeout(sendTimer)
  retryTimer = sendTimer = null
  const c = conn
  conn = null
  lastSent = ''
  c?.close()
}

async function connect(id: string): Promise<void> {
  if (connecting) return
  connecting = true
  if (status.state !== 'unavailable') setStatus({ state: 'connecting', user: null, error: null })
  try {
    const c = await connectDiscord(id)
    // Settings may have changed while we were connecting.
    if (!getSettings().discordPresence || discordClientId() !== id) return c.close()
    conn = c
    connectedId = id
    c.onClose(() => {
      if (conn !== c) return
      conn = null
      lastSent = ''
      setStatus({ state: 'unavailable', user: null, error: 'Discord was closed' })
      retryLater()
    })
    setStatus({ state: 'connected', user: c.user, error: null })
    schedule()
  } catch (e) {
    const message = (e as Error).message
    setStatus({ state: 'unavailable', user: null, error: message })
    // A bad application id won't fix itself; don't hammer Discord with it.
    if (!/Invalid Client ID|refused/i.test(message)) retryLater()
  } finally {
    connecting = false
  }
}

function retryLater(): void {
  if (retryTimer) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    syncDiscord()
  }, RETRY_MS)
}

function schedule(): void {
  if (!conn || sendTimer) return
  sendTimer = setTimeout(send, Math.max(0, lastSentAt + MIN_INTERVAL_MS - Date.now()))
}

async function send(): Promise<void> {
  sendTimer = null
  if (!conn) return
  const activity = buildActivity()
  const key = JSON.stringify(activity)
  if (key === lastSent) return
  lastSent = key
  lastSentAt = Date.now()
  try {
    await conn.setActivity(activity)
  } catch (e) {
    console.warn('[discord] could not set activity:', (e as Error).message)
  }
}

/** Discord rejects strings outside 2–128 characters. */
function fit(text: string): string {
  const t = text.length > 128 ? `${text.slice(0, 127)}…` : text
  return t.length < 2 ? `${t}  ` : t
}

function enabledMods(inst: Instance): number {
  try {
    return readdirSync(join(inst.gameDir, 'mods')).filter((f) => f.endsWith('.jar')).length
  } catch {
    return 0
  }
}

function instanceOf(id: string | null): Instance | null {
  if (!id) return null
  try {
    return getInstance(id)
  } catch {
    return null
  }
}

function playing(game: GameStatus, inst: Instance): Activity {
  const mods = inst.loader === 'vanilla' ? 0 : enabledMods(inst)
  const parts = [`Minecraft ${inst.minecraft}`]
  if (inst.loader !== 'vanilla') parts.push(loaderName(inst.loader))
  if (mods) parts.push(`${mods} mod${mods === 1 ? '' : 's'}`)
  const icon = inst.icon?.startsWith('https://') ? inst.icon : null
  return {
    details: fit(inst.name),
    state: fit(game.state === 'launching' ? 'Starting Minecraft…' : parts.join(' · ')),
    timestamps: { start: game.startedAt },
    assets: {
      large_image: icon ?? BRANDING.discordImage,
      large_text: fit(parts.join(' · ')),
      ...(icon ? { small_image: BRANDING.discordImage, small_text: BRANDING.name } : {}),
    },
  }
}

function installing(task: Task): Activity {
  const pct = task.total ? Math.floor((task.progress / task.total) * 10) * 10 : null
  return {
    details: fit(task.title),
    state: fit(pct === null ? task.stage : `${task.stage} · ${pct}%`),
    assets: { large_image: BRANDING.discordImage, large_text: BRANDING.name },
  }
}

function buildActivity(): Activity {
  const buttons = [{ label: `Get ${BRANDING.name}`, url: BRANDING.contact }]
  const game = gameStatuses().find((s) => s.state === 'running' || s.state === 'launching')
  const inst = game && instanceOf(game.instanceId)
  if (game && inst) return { ...playing(game, inst), buttons }

  const task = listTasks().find((t) => t.state === 'running' && (t.kind === 'install' || t.kind === 'modpack'))
  if (task) return { ...installing(task), buttons }

  return {
    details: 'In the launcher',
    state: 'Picking what to play',
    timestamps: { start: startedAt },
    assets: { large_image: BRANDING.discordImage, large_text: BRANDING.name },
    buttons,
  }
}
