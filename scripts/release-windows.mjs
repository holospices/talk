import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const envPath = join(root, '.env')
const outputDir = join(root, 'release', 'windows-app')

function command(name) { return process.platform === 'win32' ? `${name}.cmd` : name }
function run(name, args) {
  const result = spawnSync(name, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${name} exited with status ${result.status}`)
}
function parseEnv(content) {
  const entries = []
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const index = line.indexOf('=')
    if (index > 0) entries.push([line.slice(0, index), line.slice(index + 1)])
  }
  return entries
}
function emptyReleaseEnv(content) {
  const keys = new Set(parseEnv(content).map(([key]) => key).filter((key) => key.startsWith('VITE_')))
  for (const key of ['VITE_DEEPSEEK_API_KEY', 'VITE_DEEPSEEK_BASE_URL', 'VITE_TAVILY_API_KEY', 'VITE_PEXELS_API_KEY']) keys.add(key)
  return `${[...keys].sort((a, b) => a.localeCompare(b)).map((key) => `${key}=`).join('\n')}\n`
}
function secretsToScan(content) {
  return parseEnv(content)
    .filter(([key, value]) => key.startsWith('VITE_') && !key.endsWith('_BASE_URL') && value.trim().length >= 8 && !value.includes('your_'))
    .map(([key, value]) => ({ key, value: Buffer.from(value.trim()) }))
}
function listFiles(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    return statSync(path).isDirectory() ? listFiles(path) : [path]
  })
}
function scanForSecrets(directory, secrets) {
  const hits = []
  for (const file of listFiles(directory)) {
    const content = readFileSync(file)
    for (const secret of secrets) if (content.includes(secret.value)) hits.push(`${secret.key} in ${file}`)
  }
  return hits
}

if (!existsSync(envPath)) throw new Error('Missing .env. Create it from .env.example before building a release.')
const originalEnv = readFileSync(envPath, 'utf8')
const secrets = secretsToScan(originalEnv)
try {
  writeFileSync(envPath, emptyReleaseEnv(originalEnv), 'utf8')
  console.log('[release-windows] Building with empty VITE_* release values.')
  run(command('npm'), ['run', 'build'])
  run(command('npx'), ['electron-builder', '--win', 'nsis', 'portable'])
  const hits = scanForSecrets(outputDir, secrets)
  if (hits.length) throw new Error(`Sensitive value leak detected:\n${hits.join('\n')}`)
  const artifacts = listFiles(outputDir).filter((file) => /\.(exe|blockmap)$/i.test(file) && !file.includes('win-unpacked'))
  console.log('[release-windows] Sensitive value scan passed.')
  for (const file of artifacts) {
    const size = (statSync(file).size / 1024 / 1024).toFixed(2)
    const sha256 = createHash('sha256').update(readFileSync(file)).digest('hex')
    console.log(`[release-windows] ${basename(file)} (${size} MB) SHA256=${sha256}`)
  }
} finally {
  writeFileSync(envPath, originalEnv, 'utf8')
  console.log('[release-windows] Restored local .env.')
}
