import { spawn } from 'node:child_process'
import process from 'node:process'

const root = new URL('..', import.meta.url)
const command = (name) => process.platform === 'win32' ? `${name}.cmd` : name
const vite = spawn(command('npm'), ['run', 'dev'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })

async function waitForServer(url, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

let electron
try {
  await waitForServer('http://127.0.0.1:5173')
  electron = spawn(command('npx'), ['electron', '.'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, TALK_DESKTOP_DEV_URL: 'http://127.0.0.1:5173' },
  })
  await new Promise((resolve) => electron.once('exit', resolve))
} finally {
  if (electron && !electron.killed) electron.kill()
  if (!vite.killed) vite.kill()
}
