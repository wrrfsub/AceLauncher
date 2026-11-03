import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { EVENT_CHANNELS, INVOKE_CHANNELS, type EventChannel, type InvokeChannel, type IpcEvents, type IpcResult } from '../shared/ipc.ts'
import type { AceBridge } from './api'

/**
 * The renderer's only door into the main process: an allowlisted invoke and event subscription.
 * No Node APIs, no raw ipcRenderer.
 */
const bridge: AceBridge = {
  async invoke(channel: InvokeChannel, arg?: unknown) {
    if (!(INVOKE_CHANNELS as readonly string[]).includes(channel)) throw new Error(`Unknown channel ${channel}`)
    const res = (await ipcRenderer.invoke(channel, arg)) as IpcResult<unknown>
    if (!res.ok) throw new Error(res.error)
    return res.data as never
  },
  on<K extends EventChannel>(channel: K, listener: (payload: IpcEvents[K]) => void) {
    if (!(EVENT_CHANNELS as readonly string[]).includes(channel)) throw new Error(`Unknown event ${channel}`)
    const wrapped = (_e: IpcRendererEvent, payload: IpcEvents[K]) => listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => void ipcRenderer.removeListener(channel, wrapped)
  },
  platform: process.platform,
}

contextBridge.exposeInMainWorld('ace', bridge)
