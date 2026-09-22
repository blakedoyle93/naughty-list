import { describe, it, expect } from 'vitest'
import https from 'node:https'
import { generate } from 'selfsigned'
import { insecureLocalFetch } from './localFetch'

describe('insecureLocalFetch', () => {
  it('refuses anything that is not local https', async () => {
    await expect(insecureLocalFetch('https://example.com/x', {})).rejects.toThrow(
      /refusing non-local url/
    )
    await expect(insecureLocalFetch('http://127.0.0.1:1/x', {})).rejects.toThrow(
      /refusing non-local url/
    )
  })

  // Electron's global fetch rejects an undici Agent with "TypeError: fetch failed", which is how
  // every LCU call failed in 0.1.4. This is the regression test for using undici's own fetch.
  it('accepts a self-signed cert on 127.0.0.1 (the LCU case)', async () => {
    const pems = await generate([{ name: 'commonName', value: 'rclient' }], { days: 1 })
    const server = https.createServer({ key: pems.private, cert: pems.cert }, (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{"puuid":"ok"}')
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const { port } = server.address() as { port: number }
    try {
      const res = await insecureLocalFetch(`https://127.0.0.1:${port}/x`, { method: 'GET' })
      expect(res.status).toBe(200)
      expect(JSON.parse(await res.text())).toEqual({ puuid: 'ok' })
    } finally {
      server.close()
    }
  })
})
