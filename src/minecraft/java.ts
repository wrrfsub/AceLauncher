import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  createJavaRuntimeInstallWorkflow,
  DEFAULT_RUNTIME_ALL_URL,
  getPotentialJavaLocations,
  resolveJava,
  scanLocalJava,
  type JavaRuntimeTarget,
  type JavaRuntimes,
} from '@xmcl/installer'
import type { JavaRuntime } from '../shared/types.ts'
import { getJson } from '../utils/http.ts'
import { runWorkflow, type Progress } from './runtime.ts'

/** Directory under `runtimesDir` where Mojang's runtime component is unpacked. */
export function managedRuntimeDir(runtimesDir: string, component: string): string {
  return join(runtimesDir, component)
}

export function managedJavaExecutable(dir: string): string {
  if (process.platform === 'win32') return join(dir, 'bin', 'javaw.exe')
  if (process.platform === 'darwin') return join(dir, 'jre.bundle', 'Contents', 'Home', 'bin', 'java')
  return join(dir, 'bin', 'java')
}

async function managedExecutables(runtimesDir: string): Promise<string[]> {
  const dirs = await readdir(runtimesDir).catch(() => [] as string[])
  return dirs.map((d) => managedJavaExecutable(join(runtimesDir, d))).filter((p) => existsSync(p))
}

/** System installs (JAVA_HOME, PATH, common install dirs) plus runtimes this launcher downloaded. */
export async function detectJava(runtimesDir: string): Promise<JavaRuntime[]> {
  const managed = await managedExecutables(runtimesDir)
  const system = await getPotentialJavaLocations()
  const found = await scanLocalJava([...managed, ...system])
  const seen = new Set<string>()
  return found
    .filter((j) => !seen.has(j.path) && seen.add(j.path))
    .map((j) => ({ path: j.path, version: j.version, majorVersion: j.majorVersion, managed: j.path.startsWith(runtimesDir) }))
    .sort((a, b) => b.majorVersion - a.majorVersion)
}

export async function probeJava(path: string): Promise<JavaRuntime | null> {
  const info = await resolveJava(path)
  return info ? { path: info.path, version: info.version, majorVersion: info.majorVersion, managed: false } : null
}

/** Mojang publishes official runtimes for these platforms only (notably: no Linux ARM). */
function mojangPlatformKey(): keyof JavaRuntimes | null {
  const { platform, arch } = process
  if (platform === 'win32') return arch === 'arm64' ? 'windows-arm64' : arch === 'ia32' ? 'windows-x86' : 'windows-x64'
  if (platform === 'darwin') return arch === 'arm64' ? 'mac-os-arm64' : 'mac-os'
  if (platform === 'linux') return arch === 'x64' ? 'linux' : arch === 'ia32' ? 'linux-i386' : null
  return null
}

/**
 * Downloads Mojang's official Java runtime `component` (e.g. "java-runtime-delta", named in every
 * version JSON) and returns the java executable. Files are checksummed, so re-running repairs it.
 */
export async function installMojangJava(
  component: string,
  majorVersion: number,
  runtimesDir: string,
  progress: Progress,
): Promise<string> {
  const key = mojangPlatformKey()
  const index = await getJson<JavaRuntimes>(DEFAULT_RUNTIME_ALL_URL)
  const target: JavaRuntimeTarget | undefined = key ? index[key]?.[component]?.[0] : undefined
  if (!target) {
    throw new Error(
      `Mojang doesn't provide Java ${majorVersion} for ${process.platform}/${process.arch}. ` +
        `Install Java ${majorVersion} yourself and select it in Settings → Java.`,
    )
  }
  const destination = managedRuntimeDir(runtimesDir, component)
  progress.stage(`Downloading Java ${majorVersion}`)
  await runWorkflow(createJavaRuntimeInstallWorkflow({ target, destination }), progress)
  const exe = managedJavaExecutable(destination)
  if (!existsSync(exe)) throw new Error(`Java ${majorVersion} was downloaded but ${exe} is missing`)
  return exe
}
