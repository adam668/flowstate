import { ipcMain } from 'electron'
import { saveImage } from '../media/mediaProtocol'

export function registerMediaHandlers(mediaDir: string): void {
  ipcMain.handle('media:saveImage', (_e, base64Data: string, mimeType: string) =>
    saveImage(mediaDir, base64Data, mimeType)
  )
}
