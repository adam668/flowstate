import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, basename } from 'path'

let registeredHandler: ((request: Request) => Promise<Response>) | null = null

vi.mock('electron', () => ({
  protocol: {
    handle: vi.fn((_scheme: string, handler: (request: Request) => Promise<Response>) => {
      registeredHandler = handler
    })
  }
}))

import { registerMediaProtocol, saveImage } from './mediaProtocol'

describe('mediaProtocol', () => {
  let mediaDir: string

  beforeEach(() => {
    mediaDir = mkdtempSync(join(tmpdir(), 'flowstate-media-test-'))
    registeredHandler = null
    registerMediaProtocol(mediaDir)
  })

  it('serves a file that exists in the media directory', async () => {
    writeFileSync(join(mediaDir, 'test.png'), Buffer.from('fake-image-bytes'))
    const response = await registeredHandler!(new Request('flowstate-media://test.png'))
    expect(response.status).toBe(200)
    const body = Buffer.from(await response.arrayBuffer())
    expect(body.toString()).toBe('fake-image-bytes')
  })

  it('serves a file when the name lands in the host position with a trailing slash', async () => {
    // Chromium parses a `standard: true` scheme with generic hierarchical URI
    // syntax, so `flowstate-media://test.png` serializes as
    // `flowstate-media://test.png/` — the filename is the *host*, not a path.
    writeFileSync(join(mediaDir, 'test.png'), Buffer.from('fake-image-bytes'))
    const request = new Request('flowstate-media://test.png/')
    expect(new URL(request.url).host).toBe('test.png')
    const response = await registeredHandler!(request)
    expect(response.status).toBe(200)
    const body = Buffer.from(await response.arrayBuffer())
    expect(body.toString()).toBe('fake-image-bytes')
  })

  it('returns 404 for a file that does not exist', async () => {
    const response = await registeredHandler!(new Request('flowstate-media://missing.png'))
    expect(response.status).toBe(404)
  })

  it('rejects a path-traversal request with 403', async () => {
    const response = await registeredHandler!(
      new Request('flowstate-media://' + encodeURIComponent('../../../etc/passwd'))
    )
    expect(response.status).toBe(403)
  })

  it('rejects a sibling-directory prefix bypass with 403', async () => {
    // e.g. mediaDir = /tmp/flowstate-media-test-abc123, sibling =
    // /tmp/flowstate-media-test-abc123-evil/secret.txt — a naive
    // startsWith(mediaDir) string-prefix check would incorrectly allow this.
    const siblingName = `${basename(mediaDir)}-evil`
    const payload = `../${siblingName}/secret.txt`
    const response = await registeredHandler!(
      new Request('flowstate-media://' + encodeURIComponent(payload))
    )
    expect(response.status).toBe(403)
  })
})

describe('saveImage', () => {
  it('writes decoded base64 bytes to the media directory and returns a flowstate-media URL', async () => {
    const mediaDir = mkdtempSync(join(tmpdir(), 'flowstate-media-test-'))
    const base64 = Buffer.from('hello').toString('base64')
    const url = await saveImage(mediaDir, base64, 'image/png')
    expect(url).toMatch(/^flowstate-media:\/\/[\w-]+\.png$/)
  })
})
