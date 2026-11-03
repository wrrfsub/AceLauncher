import { BrowserWindow } from 'electron'
import { EventEmitter } from 'node:events'
import type { EventChannel, IpcEvents } from '../shared/ipc.ts'

/** In-process mirror of every renderer event, so main-side features (Discord presence) can react too. */
export const bus = new EventEmitter()

export function broadcast<K extends EventChannel>(channel: K, payload: IpcEvents[K]): void {
  bus.emit(channel, payload)
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}
