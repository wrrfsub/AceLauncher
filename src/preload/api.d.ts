import type { EventChannel, InvokeChannel, IpcApi, IpcEvents } from '../shared/ipc'

export interface AceBridge {
  invoke<K extends InvokeChannel>(
    channel: K,
    ...arg: Parameters<IpcApi[K]> extends [] ? [] : Parameters<IpcApi[K]>
  ): Promise<Awaited<ReturnType<IpcApi[K]>>>
  on<K extends EventChannel>(channel: K, listener: (payload: IpcEvents[K]) => void): () => void
  platform: string
}

declare global {
  interface Window {
    ace: AceBridge
  }
}
