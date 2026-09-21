import { Menu, Tray, nativeImage, app } from 'electron'
import { join } from 'path'
import type { LcuState } from '@shared/types'

function trayIcon(): Electron.NativeImage {
  const file = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png'
  const img = nativeImage.createFromPath(join(__dirname, '../../resources', file))
  return img.isEmpty() ? nativeImage.createEmpty() : img
}

export class AppTray {
  private tray: Tray

  constructor(onShow: () => void) {
    this.tray = new Tray(trayIcon())
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open Naughty List', click: onShow },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() }
      ])
    )
    this.tray.on('click', onShow)
    this.update('disconnected', 0)
  }

  update(state: LcuState, hitCount: number): void {
    const dot = state === 'connected' ? '🟢' : '⚪'
    // setTitle only renders on macOS; Windows users get the tooltip
    this.tray.setTitle(hitCount > 0 ? `${dot} ${hitCount}` : dot)
    this.tray.setToolTip(`Naughty List: ${state}${hitCount ? `, ${hitCount} flagged in game` : ''}`)
  }
}
