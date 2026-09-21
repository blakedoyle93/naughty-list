import type { NaughtyApi } from '../../preload'

/** Resolved on each call so the preload bridge (or a test mock) can be installed late. */
export const api: NaughtyApi = {
  invoke: (channel, ...args) => window.naughty.invoke(channel, ...args),
  on: (channel, cb) => window.naughty.on(channel, cb)
}
