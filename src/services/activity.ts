import { db } from '../database/index.ts'
import type { Activity } from '../shared/types.ts'
import { broadcast } from './events.ts'

export function listActivity(limit = 30): Activity[] {
  return db()
    .prepare('SELECT id, at, kind, message, instance_id AS instanceId FROM activity ORDER BY at DESC LIMIT ?')
    .all(limit) as unknown as Activity[]
}

export function logActivity(kind: Activity['kind'], message: string, instanceId: string | null = null): void {
  db().prepare('INSERT INTO activity (at, kind, message, instance_id) VALUES (?, ?, ?, ?)').run(Date.now(), kind, message, instanceId)
  // ponytail: unbounded table, trimmed on write; fine for a personal launcher's volume.
  db().prepare('DELETE FROM activity WHERE id NOT IN (SELECT id FROM activity ORDER BY at DESC LIMIT 500)').run()
  broadcast('activity:changed', listActivity())
}
