import { randomUUID } from 'node:crypto'
import type { Progress } from '../minecraft/runtime.ts'
import type { Task } from '../shared/types.ts'
import { broadcast } from './events.ts'
import { getSettings } from './settings.ts'

interface Entry {
  task: Task
  key: string
  controller: AbortController
  promise: Promise<unknown>
}

const entries = new Map<string, Entry>()
let pending: NodeJS.Timeout | null = null

function publish(): void {
  pending ??= setTimeout(() => {
    pending = null
    broadcast('tasks:changed', listTasks())
  }, 150)
}

export function listTasks(): Task[] {
  return [...entries.values()].map((e) => e.task)
}

export function cancelTask(id: string): void {
  entries.get(id)?.controller.abort()
}

/**
 * Runs long work (installs, downloads) as a visible, cancellable task.
 * Calls with the same `key` while one is running join it instead of starting a duplicate.
 */
export function runTask<T>(
  opts: { key: string; kind: Task['kind']; title: string; instanceId?: string | null },
  fn: (progress: Progress) => Promise<T>,
): Promise<T> {
  for (const e of entries.values()) {
    if (e.key === opts.key && e.task.state === 'running') return e.promise as Promise<T>
  }

  const controller = new AbortController()
  const task: Task = {
    id: randomUUID(),
    kind: opts.kind,
    title: opts.title,
    instanceId: opts.instanceId ?? null,
    stage: 'Starting',
    progress: 0,
    total: 0,
    state: 'running',
    error: null,
    startedAt: Date.now(),
  }
  const progress: Progress = {
    signal: controller.signal,
    concurrency: getSettings().maxConcurrentDownloads,
    stage(name) {
      task.stage = name
      task.progress = 0
      task.total = 0
      publish()
    },
    update(done, total) {
      if (done === task.progress && total === task.total) return
      task.progress = done
      task.total = total
      publish()
    },
  }

  const promise = (async () => {
    try {
      const result = await fn(progress)
      task.state = 'done'
      return result
    } catch (e) {
      task.state = controller.signal.aborted ? 'cancelled' : 'error'
      task.error = controller.signal.aborted ? 'Cancelled' : (e as Error).message
      throw controller.signal.aborted ? new Error('Cancelled') : e
    } finally {
      publish()
      // Keep finished tasks around briefly so the UI can show the outcome.
      setTimeout(() => {
        entries.delete(task.id)
        publish()
      }, task.state === 'done' ? 4_000 : 30_000)
    }
  })()

  entries.set(task.id, { task, key: opts.key, controller, promise })
  publish()
  return promise
}
