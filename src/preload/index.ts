import { contextBridge, ipcRenderer } from 'electron'
import type { Invoke, InvokeChannel, PushChannel, PushEvents } from '@shared/ipc'

const api = {
  invoke<C extends InvokeChannel>(
    channel: C,
    ...args: Invoke[C]['args']
  ): Promise<Invoke[C]['result']> {
    return ipcRenderer.invoke(channel, ...args)
  },
  on<C extends PushChannel>(channel: C, cb: (payload: PushEvents[C]) => void): () => void {
    const listener = (_: unknown, payload: PushEvents[C]): void => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  }
}

export type NaughtyApi = typeof api
contextBridge.exposeInMainWorld('naughty', api)
