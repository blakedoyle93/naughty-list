import { fetch as undiciFetch, Agent } from 'undici'
import type { FetchLike } from './lcu/client'

// Riot's local APIs (LCU, Live Client Data) use self-signed certs on 127.0.0.1. We accept those
// certs there and nowhere else. Must be undici's own fetch: Electron's global fetch is Node's
// built-in copy of undici, which rejects a dispatcher from this package with "fetch failed".
const localDispatcher = new Agent({ connect: { rejectUnauthorized: false } })

export const insecureLocalFetch: FetchLike = async (url, init) => {
  if (!url.startsWith('https://127.0.0.1:')) throw new Error(`refusing non-local url ${url}`)
  const res = await undiciFetch(url, { ...init, dispatcher: localDispatcher })
  return res as unknown as Awaited<ReturnType<FetchLike>>
}
