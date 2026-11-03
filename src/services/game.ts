import { BrowserWindow } from 'electron'
import type { ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { MinecraftFolder, createMinecraftProcessWatcher, launch } from '@xmcl/core'
import { installVersion, loaderName, requiredJava } from '../minecraft/install.ts'
import { detectJava, installMojangJava, probeJava } from '../minecraft/java.ts'
import { createLogParser } from '../minecraft/logs.ts'
import type { Progress } from '../minecraft/runtime.ts'
import { BRANDING } from '../shared/branding.ts'
import type { GameStatus, Instance, JavaRuntime, LogLine } from '../shared/types.ts'
import { splitArgs } from '../utils/args.ts'
import { activeCredentials } from './accounts.ts'
import { logActivity } from './activity.ts'
import { broadcast } from './events.ts'
import { getInstance, markInstalled, recordPlay } from './instances.ts'
import { getSettings, paths } from './settings.ts'
import { runTask } from './tasks.ts'

// ---------------------------------------------------------------- Java

let javaCache: JavaRuntime[] | null = null

export async function listJava(refresh: boolean): Promise<JavaRuntime[]> {
  if (!javaCache || refresh) javaCache = await detectJava(paths.runtimes())
  return javaCache
}

/**
 * Picks the Java for a version: an explicit path (instance, then global) wins; otherwise an installed
 * runtime with the exact major version the version JSON asks for; otherwise Mojang's runtime is downloaded.
 */
async function pickJava(inst: Instance | null, req: { component: string; majorVersion: number }, progress: Progress): Promise<string> {
  const explicit = inst?.javaPath || getSettings().javaPath
  if (explicit) {
    const info = await probeJava(explicit)
    if (!info) throw new Error(`The configured Java (${explicit}) can't be run.`)
    if (info.majorVersion < req.majorVersion) {
      throw new Error(`This version needs Java ${req.majorVersion}, but the configured Java is ${info.majorVersion}.`)
    }
    return info.path
  }
  const match = (await listJava(false)).find((j) => j.majorVersion === req.majorVersion)
  if (match && existsSync(match.path)) return match.path
  if (!getSettings().autoInstallJava) {
    throw new Error(`Java ${req.majorVersion} is required. Install it, or enable automatic Java downloads in Settings.`)
  }
  const exe = await installMojangJava(req.component, req.majorVersion, paths.runtimes(), progress)
  javaCache = null
  return exe
}

// ---------------------------------------------------------------- Install

/** Installs or repairs an instance's version. Concurrent calls for the same instance share one task. */
export function installInstance(id: string, repair = false): Promise<string> {
  const inst = getInstance(id)
  const label = `${inst.minecraft}${inst.loader === 'vanilla' ? '' : ` · ${loaderName(inst.loader)}`}`
  return runTask({ key: `install:${id}`, kind: 'install', title: `${repair ? 'Repairing' : 'Installing'} ${label}`, instanceId: id }, async (progress) => {
    const versionId = await installVersion(
      { minecraft: inst.minecraft, loader: inst.loader, loaderVersion: inst.loaderVersion },
      { root: paths.root(), resolveJava: (v, p) => pickJava(inst, v.javaVersion, p) },
      progress,
    )
    markInstalled(id, versionId)
    logActivity('install', `${repair ? 'Repaired' : 'Installed'} ${inst.name}`, id)
    return versionId
  })
}

// ---------------------------------------------------------------- Processes & logs

const MAX_LOG_LINES = 5000
const processes = new Map<string, ChildProcess>()
const statuses = new Map<string, GameStatus>()
const logs = new Map<string, LogLine[]>()
let outbox: LogLine[] = []
let flushTimer: NodeJS.Timeout | null = null

function log(instanceId: string, stream: LogLine['stream'], level: LogLine['level'], text: string): void {
  const line: LogLine = { instanceId, ts: Date.now(), stream, level, text }
  const list = logs.get(instanceId) ?? []
  list.push(line)
  if (list.length > MAX_LOG_LINES) list.splice(0, list.length - MAX_LOG_LINES)
  logs.set(instanceId, list)
  outbox.push(line)
  flushTimer ??= setTimeout(() => {
    flushTimer = null
    broadcast('game:log', outbox)
    outbox = []
  }, 100)
}

function setStatus(status: GameStatus): void {
  statuses.set(status.instanceId, status)
  broadcast('game:status', status)
}

export function gameStatuses(): GameStatus[] {
  return [...statuses.values()]
}

export function gameLogs(id: string): LogLine[] {
  return logs.get(id) ?? []
}

export function killGame(id: string): void {
  processes.get(id)?.kill()
}

export function runningCount(): number {
  return processes.size
}

export async function launchInstance(id: string): Promise<void> {
  if (processes.has(id) || statuses.get(id)?.state === 'launching') throw new Error('This instance is already running.')
  const startedAt = Date.now()
  setStatus({ instanceId: id, state: 'launching', pid: null, startedAt, exitCode: null, crashReport: null })
  logs.set(id, [])
  const say = (text: string, level: LogLine['level'] = 'info') => log(id, 'launcher', level, text)

  try {
    const creds = await activeCredentials()
    let inst = getInstance(id)
    const root = paths.root()
    if (!inst.installed || !inst.versionId || !existsSync(MinecraftFolder.from(root).getVersionJson(inst.versionId))) {
      say('Installing game files…')
      await installInstance(id)
      inst = getInstance(id)
    }
    const versionId = inst.versionId!
    const req = await requiredJava(root, versionId)
    const javaPath = await runTask({ key: `java:${req.component}`, kind: 'java', title: `Preparing Java ${req.majorVersion}`, instanceId: id }, (p) => pickJava(inst, req, p))
    const settings = getSettings()
    const extraJVMArgs = [...splitArgs(settings.jvmArgs), ...splitArgs(inst.jvmArgs)]
    say(`Launching ${versionId} with ${javaPath}`)

    const proc = await launch({
      gamePath: inst.gameDir,
      resourcePath: root,
      javaPath,
      version: versionId,
      gameProfile: { name: creds.name, id: creds.uuid },
      accessToken: creds.accessToken,
      launcherName: BRANDING.name,
      launcherBrand: BRANDING.name,
      minMemory: inst.minMemory ?? settings.minMemory,
      maxMemory: inst.maxMemory ?? settings.maxMemory,
      extraJVMArgs,
      extraMCArgs: splitArgs(inst.gameArgs),
    })
    processes.set(id, proc)
    setStatus({ instanceId: id, state: 'running', pid: proc.pid ?? null, startedAt, exitCode: null, crashReport: null })
    logActivity('launch', `Launched ${inst.name}`, id)

    for (const [stream, src] of [['stdout', proc.stdout], ['stderr', proc.stderr]] as const) {
      if (!src) continue
      src.setEncoding('utf8')
      const parser = createLogParser((l) => log(id, stream, stream === 'stderr' && l.level === 'info' ? 'warn' : l.level, l.text))
      src.on('data', (chunk: string) => parser.push(chunk))
      src.on('end', () => parser.end())
    }

    createMinecraftProcessWatcher(proc)
      .on('minecraft-exit', ({ code, crashReport, crashReportLocation }) => {
        processes.delete(id)
        recordPlay(id, startedAt)
        const crashed = code !== 0 && code !== null && !proc.killed
        if (crashed) {
          say(`Minecraft exited with code ${code}${crashReportLocation ? ` — crash report: ${crashReportLocation}` : ''}`, 'error')
          logActivity('crash', `${inst.name} crashed (exit code ${code})`, id)
        } else {
          say('Minecraft closed.')
        }
        setStatus({ instanceId: id, state: crashed ? 'crashed' : 'exited', pid: null, startedAt, exitCode: code, crashReport: crashReport || null })
        const win = BrowserWindow.getAllWindows()[0]
        if (win?.isMinimized()) win.restore()
      })
      .on('error', (e) => say(`Process error: ${(e as Error).message}`, 'error'))

    if (settings.onLaunch === 'minimize') BrowserWindow.getAllWindows()[0]?.minimize()
  } catch (e) {
    const message = (e as Error).message
    say(message, 'error')
    setStatus({ instanceId: id, state: 'crashed', pid: null, startedAt, exitCode: null, crashReport: null })
    logActivity('error', `Couldn't launch: ${message}`, id)
    throw e
  }
}
