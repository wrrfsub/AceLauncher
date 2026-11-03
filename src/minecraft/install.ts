import { MinecraftFolder, Version, type ResolvedVersion } from '@xmcl/core'
import {
  createFabricInstallWorkflow,
  createModernForgeInstallWorkflow,
  createQuiltInstallWorkflow,
  resolveAssetMetadataInstallManifest,
  resolveAssetObjectInstallFiles,
  resolveForgeArtifactVersion,
  resolveForgeInstallerFile,
  resolveLibraryInstallFiles,
  resolveMinecraftJarInstallFile,
  resolveMinecraftVersionJsonInstallFile,
  resolveNeoForgedInstallerFile,
  type InstallFile,
} from '@xmcl/installer'
import type { Loader } from '../shared/types.ts'
import { runFiles, runManifest, runWorkflow, type Progress } from './runtime.ts'
import { getForgeVersions, getMinecraftManifest } from './versions.ts'

export interface InstallTarget {
  minecraft: string
  loader: Loader
  loaderVersion: string | null
}

export interface InstallEnv {
  /** Shared folder holding versions/, libraries/ and assets/. */
  root: string
  /** Forge/NeoForge run their installer processors with Java, so the installer may need one. */
  resolveJava(version: ResolvedVersion, progress: Progress): Promise<string>
}

/**
 * Installs (or repairs — the same thing, since every file is checksummed) a Minecraft version plus
 * an optional mod loader, and returns the version id to launch.
 *
 * Order matters: Forge/NeoForge processors patch the vanilla client jar, so vanilla is fully
 * installed before the loader, then the loader's own libraries are fetched.
 */
export async function installVersion(target: InstallTarget, env: InstallEnv, progress: Progress): Promise<string> {
  const folder = MinecraftFolder.from(env.root)
  progress.stage('Fetching version metadata')
  const meta = (await getMinecraftManifest()).find((v) => v.id === target.minecraft)
  if (!meta) throw new Error(`Minecraft ${target.minecraft} doesn't exist in Mojang's version list`)
  await runFiles('version-json', [resolveMinecraftVersionJsonInstallFile(meta, folder)], progress)
  await installDependencies(folder, target.minecraft, progress)

  if (target.loader === 'vanilla') return target.minecraft
  if (!target.loaderVersion) throw new Error(`No ${target.loader} version selected`)
  progress.stage(`Installing ${loaderName(target.loader)} ${target.loaderVersion}`)
  const id = await installLoader(folder, target.minecraft, target.loader, target.loaderVersion, env, progress)
  await installDependencies(folder, id, progress)
  return id
}

async function installDependencies(folder: MinecraftFolder, id: string, progress: Progress): Promise<void> {
  const version = await Version.parse(folder, id)
  progress.stage('Downloading libraries')
  const jar = resolveMinecraftJarInstallFile(version)
  const files: InstallFile[] = resolveLibraryInstallFiles(version.libraries, folder)
  if (jar) files.unshift(jar)
  await runFiles(`${id}:client`, files, progress)
  progress.stage('Downloading asset index')
  await runManifest(resolveAssetMetadataInstallManifest(version, folder), progress)
  progress.stage('Downloading assets')
  await runFiles(`${id}:assets`, await resolveAssetObjectInstallFiles(version, folder), progress)
}

async function installLoader(
  folder: MinecraftFolder,
  minecraft: string,
  loader: Exclude<Loader, 'vanilla'>,
  loaderVersion: string,
  env: InstallEnv,
  progress: Progress,
): Promise<string> {
  switch (loader) {
    case 'fabric':
      return runWorkflow(createFabricInstallWorkflow({ minecraftVersion: minecraft, version: loaderVersion, minecraft: folder }), progress)
    case 'quilt':
      return runWorkflow(createQuiltInstallWorkflow({ minecraftVersion: minecraft, version: loaderVersion, minecraft: folder }), progress)
    case 'forge': {
      const listed = (await getForgeVersions(minecraft)).find((v) => v.version === loaderVersion)
      const artifactVersion = resolveForgeArtifactVersion(minecraft, loaderVersion)
      const { file } = resolveForgeInstallerFile(artifactVersion, listed?.installer, folder, {})
      return runForgeInstaller(folder, minecraft, `forge-${artifactVersion}`, artifactVersion, file, env, progress)
    }
    case 'neoforge': {
      const { file } = await resolveNeoForgedInstallerFile('neoforge', loaderVersion, folder, {})
      return runForgeInstaller(folder, minecraft, `neoforge-${loaderVersion}`, loaderVersion, file, env, progress)
    }
  }
}

async function runForgeInstaller(
  folder: MinecraftFolder,
  minecraft: string,
  id: string,
  artifactVersion: string,
  installer: InstallFile,
  env: InstallEnv,
  progress: Progress,
): Promise<string> {
  const java = await env.resolveJava(await Version.parse(folder, minecraft), progress)
  progress.stage(`Running ${id} installer`)
  const result = await runWorkflow(
    createModernForgeInstallWorkflow({ id, minecraft: folder, minecraftVersion: minecraft, installer, artifactVersion, java, installOptions: {} }),
    progress,
  )
  return result.version
}

export function loaderName(loader: Loader): string {
  return { vanilla: 'Vanilla', fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge', quilt: 'Quilt' }[loader]
}

/** The Java a version asks for; xmcl falls back to Java 8 / jre-legacy for old versions without the field. */
export async function requiredJava(root: string, versionId: string): Promise<{ component: string; majorVersion: number }> {
  const v = await Version.parse(root, versionId)
  return { component: v.javaVersion.component, majorVersion: v.javaVersion.majorVersion }
}
