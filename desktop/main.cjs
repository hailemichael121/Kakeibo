const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { createLanServer } = require('./lan.cjs')

// GNOME/Wayland draws no title bar for Electron windows, which hides the
// minimize/maximize/close buttons. XWayland gives back the native decorations.
const ozoneArg = process.argv.slice(1).find((arg) => arg.startsWith('--ozone-platform'))
const wantsWayland = process.env.KAKEIBO_OZONE === 'wayland' || (ozoneArg !== undefined && ozoneArg !== '--ozone-platform=x11')
if (process.platform === 'linux' && process.env.WAYLAND_DISPLAY && process.env.DISPLAY && !wantsWayland && ozoneArg === undefined) {
  app.relaunch({ args: [...process.argv.slice(1), '--ozone-platform=x11'] })
  app.exit(0)
}

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)
const stateFile = () => path.join(app.getPath('userData'), 'desktop-state.json')

function readState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8'))
  } catch {
    return {}
  }
}

function writeState(patch) {
  const next = { ...readState(), ...patch }
  try {
    fs.mkdirSync(path.dirname(stateFile()), { recursive: true })
    fs.writeFileSync(stateFile(), JSON.stringify(next))
  } catch (error) {
    console.error('Could not save desktop state', error)
  }
  return next
}

let mainWindow = null

function createWindow() {
  const state = readState()
  mainWindow = new BrowserWindow({
    width: state.width || 1180,
    height: state.height || 800,
    minWidth: 720,
    minHeight: 560,
    show: false,
    autoHideMenuBar: false,
    backgroundColor: '#f3f1eb',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })

  if (isDev) mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('resize', () => {
    if (!mainWindow || mainWindow.isMinimized() || mainWindow.isMaximized()) return
    const [width, height] = mainWindow.getSize()
    writeState({ width, height })
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev ? url.startsWith(process.env.VITE_DEV_SERVER_URL) : url.startsWith('file:')
    if (!allowed) {
      event.preventDefault()
      if (/^https?:/i.test(url)) void shell.openExternal(url)
    }
  })
  mainWindow.webContents.on('will-prevent-unload', (event) => event.preventDefault())
}

function buildMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'About Kakeibo',
          click: () => {
            void dialog.showMessageBox({
              type: 'info',
              title: 'About Kakeibo',
              message: `Kakeibo ${app.getVersion()}`,
              detail: 'Mindful, offline-first personal budgeting. Your data stays in this device profile; no account or cloud service is used. Move data between phone and computer by exchanging a sync file or a short-lived private Wi-Fi QR code.',
              buttons: ['OK'],
            })
          },
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

const lan = createLanServer({
  onUpload: (name, data) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('kakeibo:lanReceived', { name, data: new Uint8Array(data) })
  },
})

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    createWindow()
    buildMenu()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
      else {
        mainWindow?.show()
        mainWindow?.focus()
      }
    })
  })

  app.on('before-quit', () => {
    lan.stop()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

ipcMain.handle('kakeibo:saveFile', async (_event, { name, data, mime }) => {
  const extension = path.extname(String(name || '')).replace('.', '').toLowerCase()
  const filters = extension
    ? [{ name: `${extension.toUpperCase()} file`, extensions: [extension] }]
    : mime && mime.includes('json')
      ? [{ name: 'Kakeibo sync file', extensions: ['json'] }]
      : undefined
  const options = {
    title: 'Save file',
    defaultPath: path.join(app.getPath('downloads'), name || 'Kakeibo'),
    filters,
  }
  const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return { saved: false, canceled: true }
  try {
    fs.writeFileSync(result.filePath, Buffer.from(data))
    return { saved: true, path: result.filePath }
  } catch (error) {
    console.error('saveFile failed', error)
    return { saved: false }
  }
})

ipcMain.handle('kakeibo:lanStart', (_event, payload) => lan.start(payload))

ipcMain.handle('kakeibo:lanStop', () => {
  lan.stop()
})
