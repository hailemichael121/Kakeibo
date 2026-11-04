const crypto = require('node:crypto')
const http = require('node:http')
const os = require('node:os')

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024
const DEFAULT_TTL_MS = 5 * 60 * 1000

function lanIp() {
  const candidates = []
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (/^(docker|veth|virbr|br-|tun|tap|wg|zt|utun|lo)/i.test(name)) continue
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) candidates.push({ name, address: net.address })
    }
  }
  const home = candidates.find(({ address }) => address.startsWith('192.168.'))
  const privateIp = candidates.find(({ address }) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01]))\./.test(address))
  return (home ?? privateIp ?? candidates[0])?.address ?? '127.0.0.1'
}

function makeToken() {
  return crypto.randomBytes(32).toString('base64url')
}

function safeName(value, fallback) {
  const name = String(value || '')
    .replace(/[\\/]/g, '_')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(0, 160)
  return name && name !== '.' && name !== '..' ? name : fallback
}

function receivePage() {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kakeibo transfer</title>
<body style="font:16px/1.5 system-ui;margin:0;padding:32px;background:#f3f1eb;color:#343d35">
<h1 style="font-size:20px">Send a Kakeibo sync file to this computer</h1>
<p>Open Kakeibo on the phone, choose <strong>Send from this device</strong>, and scan the QR code on the computer instead of using this page.</p>
</body>`
}

function createLanServer({ onUpload = () => {}, maxBytes = DEFAULT_MAX_BYTES, ttlMs = DEFAULT_TTL_MS } = {}) {
  let active = null
  let expireTimer = null

  function stop() {
    if (expireTimer) {
      clearTimeout(expireTimer)
      expireTimer = null
    }
    if (!active) return
    const server = active.server
    active = null
    try {
      server.close()
    } catch {
      // already closed
    }
  }

  function start(payload) {
    stop()
    const mode = payload && payload.mode === 'receive' ? 'receive' : 'send'
    const data = payload && payload.data ? Buffer.from(payload.data) : null
    if (mode === 'send' && (!data || data.length === 0)) return Promise.resolve(null)
    if (data && data.length > maxBytes) return Promise.resolve(null)

    const secret = makeToken()
    const name = safeName(payload && payload.name, 'Kakeibo_sync.json')
    const receivedName = `Kakeibo_sync_${new Date().toISOString().slice(0, 10)}.json`
    const route = mode === 'send' ? 'download' : 'upload'
    let uploadConsumed = false

    return new Promise((resolve) => {
      const server = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Cache-Control', 'no-store')

        try {
          if (Date.now() > expiresAt) {
            stop()
            res.writeHead(410, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('This Kakeibo sync link has expired.')
            return
          }

          if (req.method === 'OPTIONS') {
            res.writeHead(204, {
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
              'Access-Control-Allow-Headers': 'content-type, x-kakeibo-name',
              'Access-Control-Max-Age': '600',
            })
            res.end()
            return
          }

          const url = new URL(req.url || '/', 'http://localhost')
          const expectedPath = `/${route}/${secret}`

          if (url.pathname !== expectedPath) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('Not found')
            return
          }

          if (req.method === 'GET' && mode === 'send') {
            res.writeHead(200, {
              'Content-Type': 'application/json; charset=utf-8',
              'Content-Disposition': `attachment; filename="${name}"`,
              'Content-Length': data.length,
              'Access-Control-Expose-Headers': 'Content-Disposition',
            })
            res.end(data)
            return
          }

          if (req.method === 'GET' && mode === 'receive') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end(receivePage())
            return
          }

          if (req.method === 'POST' && mode === 'receive') {
            if (uploadConsumed) {
              res.writeHead(410, { 'Content-Type': 'text/plain; charset=utf-8' })
              res.end('This Kakeibo sync link has already been used.')
              return
            }

            const chunks = []
            let size = 0
            let tooBig = false
            req.on('data', (chunk) => {
              if (tooBig) return
              size += chunk.length
              if (size > maxBytes) {
                tooBig = true
                res.writeHead(413, { 'Content-Type': 'text/plain; charset=utf-8' })
                res.end('The sync file is larger than 25 MB.')
                req.destroy()
                return
              }
              chunks.push(chunk)
            })
            req.on('error', () => {
              // The client disconnected before the upload finished.
            })
            req.on('end', () => {
              if (tooBig) return
              const bytes = Buffer.concat(chunks)
              if (bytes.length === 0) {
                res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
                res.end('No sync data was received.')
                return
              }
              let fileName = receivedName
              try {
                const header = req.headers['x-kakeibo-name']
                if (header) fileName = decodeURIComponent(String(header))
              } catch {
                // fall back to the default name when the header is malformed
              }
              fileName = safeName(fileName, receivedName)
              uploadConsumed = true
              onUpload(fileName, bytes)
              res.end(JSON.stringify({ ok: true, name: fileName }), () => stop())
            })
            return
          }

          res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('Method not allowed')
        } catch {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('Error')
        }
      })

      const expiresAt = Date.now() + ttlMs

      server.on('error', () => {
        if (active && active.server === server) stop()
        resolve(null)
      })

      server.listen(0, '0.0.0.0', () => {
        const address = server.address()
        if (!address || typeof address === 'string') {
          server.close()
          resolve(null)
          return
        }
        const ip = lanIp()
        const url = `http://${ip}:${address.port}/${route}/${secret}`
        active = { server, secret, mode, data, name, expiresAt }
        expireTimer = setTimeout(stop, Math.max(1000, ttlMs))
        if (typeof expireTimer.unref === 'function') expireTimer.unref()
        resolve({ mode, ip, port: address.port, url, expiresAt })
      })
    })
  }

  return { start, stop }
}

module.exports = { createLanServer, lanIp }
