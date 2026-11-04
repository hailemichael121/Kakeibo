import { spawn } from 'node:child_process'

const URL = 'http://127.0.0.1:5173'
const shell = process.platform === 'win32'

let vite = null
let electron = null
let closing = false

function shutdown() {
  if (closing) return
  closing = true
  for (const child of [vite, electron]) {
    if (child && !child.killed) child.kill()
  }
}

process.on('SIGINT', () => {
  shutdown()
  process.exit(0)
})
process.on('SIGTERM', () => {
  shutdown()
  process.exit(0)
})

// Children get no stdin: Vite's key-shortcut reader would otherwise crash with
// "read EIO" when the terminal or the dev session is closed.
vite = spawn('npx', ['vite', '--port', '5173', '--strictPort'], { stdio: ['ignore', 'inherit', 'inherit'], shell })
vite.on('error', (error) => {
  console.error('Vite failed to start:', error.message)
})

async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(URL)
      if (response.ok) return true
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return false
}

const ready = await waitForServer()
if (!ready) {
  console.error('Vite dev server did not start.')
  shutdown()
  process.exit(1)
}

electron = spawn('npx', ['electron', '.'], {
  stdio: ['ignore', 'inherit', 'inherit'],
  shell,
  env: { ...process.env, VITE_DEV_SERVER_URL: URL },
})
electron.on('error', (error) => {
  console.error('Electron failed to start:', error.message)
})

electron.on('exit', (code) => {
  shutdown()
  process.exit(code ?? 0)
})

vite.on('exit', (code) => {
  if (closing) return
  console.error('Vite exited.')
  shutdown()
  process.exit(code ?? 0)
})
