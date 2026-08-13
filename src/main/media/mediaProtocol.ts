import { protocol } from 'electron'
import { join, normalize, relative, isAbsolute } from 'path'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { randomUUID } from 'crypto'

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp'
}

/**
 * Serves files from `mediaDir` over a custom `flowstate-media://<filename>`
 * scheme, so journal-embedded images never expose a raw filesystem path to
 * the renderer. Guards against path traversal — a request that would resolve
 * outside `mediaDir` (e.g. via `../`) is rejected with 403 rather than served.
 */
export function registerMediaProtocol(mediaDir: string): void {
  protocol.handle('flowstate-media', async (request) => {
    const requestedName = decodeURIComponent(request.url.replace('flowstate-media://', ''))
    const resolved = normalize(join(mediaDir, requestedName))
    const rel = relative(mediaDir, resolved)
    if (rel.startsWith('..') || isAbsolute(rel)) {
      return new Response('Forbidden', { status: 403 })
    }
    try {
      const data = await readFile(resolved)
      return new Response(data)
    } catch {
      return new Response('Not Found', { status: 404 })
    }
  })
}

export async function saveImage(
  mediaDir: string,
  base64Data: string,
  mimeType: string
): Promise<string> {
  await mkdir(mediaDir, { recursive: true })
  const extension = EXTENSION_BY_MIME[mimeType] ?? 'bin'
  const filename = `${randomUUID()}.${extension}`
  const buffer = Buffer.from(base64Data, 'base64')
  await writeFile(join(mediaDir, filename), buffer)
  return `flowstate-media://${filename}`
}
