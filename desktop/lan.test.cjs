const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { test } = require('node:test')
const { createLanServer } = require('./lan.cjs')

function localUrl(url) {
  const parsed = new URL(url)
  parsed.hostname = '127.0.0.1'
  return parsed.toString()
}

test('send session serves the sync file over a private-address QR link', async () => {
  const bytes = crypto.randomBytes(32 * 1024)
  const server = createLanServer()
  try {
    const session = await server.start({ mode: 'send', name: 'Kakeibo_sync_2026-11-04.json', data: bytes })
    assert.ok(session)
    assert.equal(session.mode, 'send')
    assert.match(session.url, /^http:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)[^/]+\/download\/[A-Za-z0-9_-]{43}$/)
    assert.ok(session.expiresAt > Date.now())

    const response = await fetch(localUrl(session.url))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('access-control-allow-origin'), '*')
    assert.match(response.headers.get('content-disposition') ?? '', /Kakeibo_sync_2026-11-04\.json/)
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array(bytes))

    const rejected = await fetch(localUrl(session.url.replace(/[A-Za-z0-9_-]{43}$/, 'A'.repeat(43))))
    assert.equal(rejected.status, 404)
  } finally {
    server.stop()
  }
})

test('receive session accepts one upload and sanitizes its file name', async () => {
  let receive
  const uploadReady = new Promise((resolve) => { receive = resolve })
  const server = createLanServer({
    onUpload: (name, data) => receive({ name, data }),
  })
  try {
    const session = await server.start({ mode: 'receive' })
    assert.ok(session)
    assert.match(session.url, /^http:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)[^/]+\/upload\/[A-Za-z0-9_-]{43}$/)

    const bytes = crypto.randomBytes(4096)
    const response = await fetch(localUrl(session.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-kakeibo-name': encodeURIComponent('../../from phone.json') },
      body: bytes,
    })
    assert.equal(response.status, 200)
    const file = await uploadReady
    assert.equal(file.name, '.._.._from_phone.json')
    assert.deepEqual(new Uint8Array(file.data), new Uint8Array(bytes))

    const reused = await fetch(localUrl(session.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: bytes,
    }).catch(() => null)
    assert.ok(reused === null || reused.status === 410)
  } finally {
    server.stop()
  }
})

test('preflight and invalid sessions are handled without exposing data', async () => {
  const server = createLanServer()
  try {
    assert.equal(await server.start({ mode: 'send', name: 'empty.json', data: new Uint8Array() }), null)
    const session = await server.start({ mode: 'receive' })
    assert.ok(session)

    const preflight = await fetch(localUrl(session.url), { method: 'OPTIONS' })
    assert.equal(preflight.status, 204)
    assert.match(preflight.headers.get('access-control-allow-methods') ?? '', /POST/)
    assert.match(preflight.headers.get('access-control-allow-headers') ?? '', /content-type/)

    const wrongPath = await fetch(localUrl(session.url).replace('/upload/', '/download/'))
    assert.equal(wrongPath.status, 404)

    const emptyUpload = await fetch(localUrl(session.url), { method: 'POST', body: new Uint8Array() })
    assert.equal(emptyUpload.status, 400)
  } finally {
    server.stop()
  }
})
