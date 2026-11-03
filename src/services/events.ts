import { BrowserWindow } from 'electron'
import type { EventChannel, IpcEvents } from '../shared/ipc.ts'

export function broadcast<K extends EventChannel>(channel: K, payload: IpcEvents[K]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}
