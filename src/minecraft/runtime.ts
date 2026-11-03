import {
  type ExecuteInstallManifestOptions,
  createDefaultNodeInstallRuntime,
  executeInstallManifest,
  executeInstallWorkflow,
  ProgressTrackerMultiple,
  type InstallFile,
  type InstallManifest,
  type InstallWorkflow,
} from '@xmcl/installer'

/** How install code reports to whoever runs it (the task service in the app, a console in tests). */
export interface Progress {
  signal: AbortSignal
  concurrency: number
  stage(name: string): void
  update(done: number, total: number): void
  /** Optional trace of executor events (task start/end, retries), for diagnostics. */
  trace?(message: string): void
}

/**
 * Runs `fn` with an xmcl install runtime whose byte progress is sampled into `progress`.
 * The xmcl executor checksums existing files and only downloads what's missing or corrupt,
 * so an interrupted install resumes at file granularity when it's started again.
 */
async function withRuntime<T>(
  progress: Progress,
  fn: (runtime: ReturnType<typeof createDefaultNodeInstallRuntime>) => Promise<T>,
): Promise<T> {
  const tracker = new ProgressTrackerMultiple()
  const runtime = createDefaultNodeInstallRuntime({ tracker, maxConcurrency: progress.concurrency, signal: progress.signal })
  const sample = () => progress.update(tracker.progress, tracker.total)
  const timer = setInterval(sample, 250)
  try {
    return await fn(runtime)
  } catch (e) {
    throw flattenError(e)
  } finally {
    clearInterval(timer)
    sample()
  }
}

function executorOptions(progress: Progress): ExecuteInstallManifestOptions {
  const { trace } = progress
  return {
    signal: progress.signal,
    onEvent: trace
      ? (e) => {
          if (e.type === 'task-start') trace(`start ${e.task.id} (${e.task.type})`)
          else if (e.type === 'task-end') trace(`end ${e.task.id} in ${e.duration}ms${e.error ? `: ${String(e.error)}` : ''}`)
          else if (e.type === 'file-retry') trace(`retry ${e.task.id} #${e.attempt}, ${e.pending} pending: ${String(e.error)}`)
          else if (e.type === 'java-strategy-failed') trace(`java strategy ${e.strategy} failed for ${e.task.id}: ${String(e.error)}`)
        }
      : undefined,
  }
}

export function runManifest(manifest: InstallManifest, progress: Progress): Promise<unknown> {
  return withRuntime(progress, (rt) => executeInstallManifest(manifest, rt, executorOptions(progress)))
}

export function runFiles(id: string, files: InstallFile[], progress: Progress): Promise<unknown> {
  return runManifest({ schemaVersion: 1, tasks: [{ id, type: 'files', files }] }, progress)
}

export function runWorkflow<T>(workflow: InstallWorkflow<T>, progress: Progress): Promise<T> {
  return withRuntime(progress, (rt) => executeInstallWorkflow(workflow, rt, executorOptions(progress)))
}

/** Download failures arrive as nested AggregateErrors; surface the first cause and how many failed. */
export function flattenError(e: unknown): Error {
  const leaves: unknown[] = []
  const walk = (x: unknown) => (x instanceof AggregateError ? x.errors.forEach(walk) : leaves.push(x))
  walk(e)
  const first = leaves[0]
  const message = first instanceof Error ? first.message : String(first)
  if (leaves.length <= 1) return first instanceof Error ? first : new Error(message)
  return new Error(`${leaves.length} files failed to download (first error: ${message})`, { cause: e })
}
