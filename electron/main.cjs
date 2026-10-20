const { app, BrowserWindow, ipcMain, net, protocol, shell } = require('electron')
const { existsSync } = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

protocol.registerSchemesAsPrivileged([{
  scheme: 'talk',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}])

const rootDir = path.resolve(__dirname, '..')
const distDir = path.join(rootDir, 'dist')
const isDev = Boolean(process.env.TALK_DESKTOP_DEV_URL)
let mainWindow

// The local test client must be able to run beside an installed/portable Talk
// release. A separate user-data directory also keeps test IndexedDB and settings
// from changing the user's everyday data.
if (isDev) {
  app.setName('Talk Test')
  app.setPath('userData', path.join(app.getPath('appData'), 'Talk Test'))
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

async function handleTalkProtocol(request) {
  const url = new URL(request.url)
  if (url.hostname !== 'app') return jsonError(404, 'Unknown Talk host')
  if (url.pathname.startsWith('/__api__/')) {
    const target = decodeURIComponent(url.pathname.slice('/__api__/'.length))
    let targetUrl
    try { targetUrl = new URL(target) } catch { return jsonError(400, 'Invalid target URL') }
    if (!['http:', 'https:'].includes(targetUrl.protocol)) return jsonError(403, 'Unsupported target protocol')
    const headers = new Headers(request.headers)
    headers.delete('origin')
    headers.delete('referer')
    return net.fetch(targetUrl.toString(), {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      duplex: request.body ? 'half' : undefined,
    })
  }

  const requestedPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)
  const filePath = path.normalize(path.join(distDir, requestedPath))
  if (!filePath.startsWith(distDir) || !existsSync(filePath)) return jsonError(404, 'File not found')
  return net.fetch(pathToFileURL(filePath).toString())
}

function sendWindowState() {
  mainWindow?.webContents.send('window:maximized', mainWindow.isMaximized())
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: isDev ? 'Talk 测试版' : 'Talk',
    width: 1380,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    show: false,
    frame: false,
    backgroundColor: '#f7f8fa',
    icon: path.join(rootDir, 'public', 'app-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: !isDev,
    },
  })
  mainWindow.setMenuBarVisibility(false)
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('maximize', sendWindowState)
  mainWindow.on('unmaximize', sendWindowState)
  mainWindow.on('closed', () => { mainWindow = undefined })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev ? url.startsWith(process.env.TALK_DESKTOP_DEV_URL) : url.startsWith('talk://app/')
    if (!allowed) {
      event.preventDefault()
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    }
  })
  if (isDev) void mainWindow.loadURL(process.env.TALK_DESKTOP_DEV_URL)
  else void mainWindow.loadURL('talk://app/index.html')
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
  void app.whenReady().then(() => {
    protocol.handle('talk', handleTalkProtocol)
    ipcMain.on('window:minimize', () => mainWindow?.minimize())
    ipcMain.on('window:toggle-maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize())
    ipcMain.on('window:close', () => mainWindow?.close())
    ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false)
    createWindow()
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
  })
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
