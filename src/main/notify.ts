import { Notification } from 'electron'
import type { Hit } from '@shared/types'

export function notifyHit(hit: Hit, onClick?: () => void): void {
  if (!Notification.isSupported()) return
  const { gameName, tagLine, team } = hit.player
  const n = new Notification({
    title: `⚠ ${gameName}#${tagLine} is on the naughty list (${team})`,
    body: hit.flags[0]?.note ?? '',
    silent: false
  })
  if (onClick) n.on('click', onClick)
  n.show()
}
