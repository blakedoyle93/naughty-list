import type { NaughtyApi } from './index'

declare global {
  interface Window {
    naughty: NaughtyApi
  }
}
