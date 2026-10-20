import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const sourceRoots = ['src/components', 'src/pages']
const forbiddenStructuralColors = /(?:purple|violet|fuchsia|indigo)-(?:50|100|200|300|400|500|600|700|800|900|950)|#aa3bff/gi
const hardcodedSvgColor = /(?:stroke|fill)=["']#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})["']/gi
const allowedSvgFiles = new Set([])
const failures = []

async function walk(directory) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const relative = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(relative))
    else if (/\.(?:tsx|ts|css)$/.test(entry.name)) files.push(relative)
  }
  return files
}

for (const sourceRoot of sourceRoots) {
  for (const file of await walk(sourceRoot)) {
    const source = await readFile(path.join(root, file), 'utf8')
    const structuralMatches = [...source.matchAll(forbiddenStructuralColors)]
    if (structuralMatches.length) failures.push(`${file}: fixed structural theme colors (${[...new Set(structuralMatches.map((match) => match[0]))].join(', ')})`)
    const svgMatches = [...source.matchAll(hardcodedSvgColor)]
    if (svgMatches.length && !allowedSvgFiles.has(file)) failures.push(`${file}: hardcoded SVG colors; use currentColor (${[...new Set(svgMatches.map((match) => match[0]))].join(', ')})`)
  }
}

const themeCss = await readFile(path.join(root, 'src/index.css'), 'utf8')
for (const theme of ['sage', 'forge', 'fox', 'ink', 'nord', 'wetalk']) {
  if (!themeCss.includes(`data-ui-theme='${theme}'`)) failures.push(`src/index.css: missing ${theme} theme tokens`)
}
if (!themeCss.includes("data-ui-scope='special'")) failures.push('src/index.css: missing special-scope contract')
for (const token of ['--ui-font-body', '--ui-font-display', '--ui-font-reading', '--ui-font-control', '--ui-font-mono']) {
  if (!themeCss.includes(token)) failures.push(`src/index.css: missing font token ${token}`)
}
if (/--ui-font\s*:/.test(themeCss)) failures.push('src/index.css: legacy --ui-font token remains; use semantic font tokens')
if (!themeCss.includes('@font-face') || !themeCss.includes('font-display: swap')) failures.push('src/index.css: local font-face contract is incomplete')

const distAssets = path.join(root, 'dist/assets')
if (process.argv.includes('--dist') && existsSync(distAssets)) {
  for (const entry of await readdir(distAssets)) {
    if (!entry.endsWith('.css')) continue
    const builtCss = await readFile(path.join(distAssets, entry), 'utf8')
    if (/okl(?:ch|ab)\(/i.test(builtCss)) failures.push(`dist/assets/${entry}: Chromium 99-incompatible OKLab color syntax remains`)
  }
  for (const font of [
    'talk-sage-regular.woff2', 'talk-sage-medium.woff2',
    'talk-fox-regular.woff2', 'talk-fox-medium.woff2',
    'talk-ink-regular.woff2', 'talk-ink-medium.woff2',
    'talk-nord-regular.woff2', 'talk-nord-medium.woff2',
  ]) {
    if (!existsSync(path.join(root, 'dist/fonts', font))) failures.push(`dist/fonts/${font}: bundled theme font is missing`)
  }
}

if (failures.length) {
  console.error('Theme contract check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Theme contract check passed: six themes, scoped exceptions, no structural purple or hardcoded SVG colors.')
