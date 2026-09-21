import { BrowserWindow, ipcMain } from 'electron'
import type { Invoke, InvokeChannel, PushChannel, PushEvents } from '@shared/ipc'

type Handler<C extends InvokeChannel> = (
  ...args: Invoke[C]['args']
) => Promise<Invoke[C]['result']> | Invoke[C]['result']

export function handle<C extends InvokeChannel>(channel: C, fn: Handler<C>): void {
  ipcMain.handle(channel, (_e, ...args) => fn(...(args as Invoke[C]['args'])))
}

export function push<C extends PushChannel>(channel: C, payload: PushEvents[C]): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(channel, payload)
}
