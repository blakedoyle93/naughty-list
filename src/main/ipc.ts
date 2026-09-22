import { BrowserWindow, ipcMain } from 'electron'
import { toReadableError } from './errors'
import type { Invoke, InvokeChannel, PushChannel, PushEvents } from '@shared/ipc'

type Handler<C extends InvokeChannel> = (
  ...args: Invoke[C]['args']
) => Promise<Invoke[C]['result']> | Invoke[C]['result']

/**
 * Electron only serialises real Errors across IPC. A Supabase error object
 * arrives in the renderer as "[object Object]", so every handler's failure is
 * turned into an Error with a sentence worth reading.
 */
export function handle<C extends InvokeChannel>(channel: C, fn: Handler<C>): void {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return await fn(...(args as Invoke[C]['args']))
    } catch (e) {
      throw toReadableError(e, channel)
    }
  })
}

export function push<C extends PushChannel>(channel: C, payload: PushEvents[C]): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(channel, payload)
}
