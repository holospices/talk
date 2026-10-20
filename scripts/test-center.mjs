import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import process from 'node:process'

const execFileAsync = promisify(execFile)
const root = new URL('..', import.meta.url)
const rootPath = decodeURIComponent(root.pathname).replace(/^\/(\w:)/, '$1').replaceAll('/', '\\')
const devUrl = 'http://127.0.0.1:5173'
const children = new Set()
let stopping = false
let androidStarted = false

function line(message = '') {
  process.stdout.write(`${message}\n`)
}

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    windowsHide: false,
    ...options,
  })
  children.add(child)
  child.once('exit', () => children.delete(child))
  return child
}

async function waitForServer(url, attempts = 120) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return true
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return false
}

async function output(command, args) {
  try {
    const result = await execFileAsync(command, args, { cwd: rootPath, windowsHide: true })
    return `${result.stdout ?? ''}${result.stderr ?? ''}`
  } catch (error) {
    return `${error.stdout ?? ''}${error.stderr ?? ''}`
  }
}

function parseDevices(text) {
  return text
    .split(/\r?\n/)
    .map((entry) => entry.trim().split(/\s+/))
    .filter((entry) => entry.length >= 2 && entry[1] === 'device')
    .map((entry) => entry[0])
}

async function findAndroidTarget(adb) {
  let devices = parseDevices(await output(adb, ['devices']))
  if (devices.length > 0) return devices[0]

  const manager = 'D:\\Program Files\\Netease\\MuMu\\nx_main\\MuMuManager.exe'
  if (!existsSync(manager)) return undefined

  line('[安卓] 没检测到真机，正在启动 MuMu 12……')
  await output(manager, ['control', '-v', '0', 'launch'])
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const infoText = await output(manager, ['info', '-v', '0'])
    try {
      const info = JSON.parse(infoText.slice(infoText.indexOf('{')))
      if (info.is_android_started) break
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  await output(manager, ['adb', '-v', '0', '-c', 'connect'])
  for (let attempt = 0; attempt < 30; attempt += 1) {
    devices = parseDevices(await output(adb, ['devices']))
    if (devices.length > 0) return devices[0]
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  return undefined
}

async function startAndroid() {
  const sdk = process.env.ANDROID_HOME || `${process.env.LOCALAPPDATA}\\Android\\Sdk`
  const adb = `${sdk}\\platform-tools\\adb.exe`
  if (!existsSync(adb)) {
    line('[安卓] 未找到 ADB，本次跳过安卓端；PC 和 Web 不受影响。')
    return
  }

  const target = await findAndroidTarget(adb)
  if (!target) {
    line('[安卓] MuMu/真机没有成功连接，本次跳过安卓端；稍后可重开启动器重试。')
    return
  }
  if (stopping) return

  line(`[安卓] 已连接 ${target}，正在安装测试壳并接入热更新（首次会稍慢）……`)
  const env = {
    ...process.env,
    ANDROID_HOME: sdk,
    JAVA_HOME: process.env.JAVA_HOME || 'C:\\Projects\\AndroidStudio\\jbr',
  }
  androidStarted = true
  const cap = run('cmd.exe', [
    '/d', '/s', '/c',
    `npx cap run android --target ${target} --live-reload --host 127.0.0.1 --port 5173 --forwardPorts 5173:5173`,
  ], { env })
  cap.once('exit', (code) => {
    if (!stopping && code !== 0) line(`[安卓] 启动失败（退出码 ${code}），PC 和 Web 仍可继续测试。`)
  })
}

async function stopAll() {
  if (stopping) return
  stopping = true
  line('\n正在关闭本次测试服务……')
  await Promise.all([...children].map(async (child) => {
    if (!child.pid || child.killed) return
    try {
      await execFileAsync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true })
    } catch {}
  }))
  if (androidStarted) {
    // cap run temporarily writes server.url into the generated Android config.
    // Sync once after shutdown so later APK/release builds cannot inherit it.
    await output('cmd.exe', ['/d', '/s', '/c', 'npx cap sync android'])
  }
}

process.on('SIGINT', async () => {
  await stopAll()
  process.exit(0)
})
process.on('SIGTERM', async () => {
  await stopAll()
  process.exit(0)
})

line('==============================================')
line(' Talk 一键测试中心')
line(' PC 客户端 + Web + Android 热更新')
line('==============================================')
line('[服务] 正在启动本地开发服务器……')

const vite = run('cmd.exe', ['/d', '/s', '/c', 'npm run dev'])
vite.once('exit', (code) => {
  if (!stopping) line(`[服务] 开发服务器已退出（退出码 ${code}）。`)
})

if (!await waitForServer(devUrl)) {
  line('[错误] 5173 端口的开发服务器未能启动，请查看上方日志。')
  await stopAll()
  process.exit(1)
}

line(`[Web] 已就绪：${devUrl}`)
spawn('cmd.exe', ['/d', '/s', '/c', 'start', '', devUrl], { detached: true, stdio: 'ignore', windowsHide: true }).unref()

line('[PC] 正在打开 Talk 桌面开发版……')
const electron = run('cmd.exe', ['/d', '/s', '/c', 'npx electron .'], {
  env: { ...process.env, TALK_DESKTOP_DEV_URL: devUrl },
})

void startAndroid()

line('')
line('测试已启动。修改源码并保存后，三个端会自动刷新。')
line('关闭 Talk PC 窗口即可结束；也可以在这里按 Ctrl+C。')

await new Promise((resolve) => electron.once('exit', resolve))
await stopAll()
