import { protocol } from 'electron'
import { join, normalize, relative, isAbsolute, basename } from 'path'
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
 *
 * The scheme is registered as `standard: true` in the main process, so Chromium
 * parses these URLs with generic hierarchical URI syntax: for
 * `flowstate-media://abc.png` the filename lands in the *host* position and the
 * URL serializes with a trailing slash (`flowstate-media://abc.png/`). Parsing
 * with the `URL` API and combining `host` + `pathname` — then reducing to a
 * basename — handles that shape as well as any future path-shaped URL, and
 * keeps filenames flat as defense-in-depth alongside the containment guard.
 */
export function registerMediaProtocol(mediaDir: string): void {
  protocol.handle('flowstate-media', async (request) => {
    const url = new URL(request.url)
    // Trailing slashes come from Chromium's serialization of a host-only URL
    // for a `standard: true` scheme; they are not part of the filename.
    const requested = decodeURIComponent(url.host + url.pathname).replace(/[/\\]+$/, '')
    const requestedName = basename(requested)
    const resolved = normalize(join(mediaDir, requestedName))
    const rel = relative(mediaDir, resolved)
    // Media filenames are flat UUIDs — anything with a path separator in it is
    // an attempt to escape `mediaDir`, so reject rather than silently flatten.
    if (requestedName !== requested || rel.startsWith('..') || isAbsolute(rel)) {
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
