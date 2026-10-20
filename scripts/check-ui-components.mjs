import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const manifest = JSON.parse(await readFile(path.join(root, 'scripts/ui-component-classification.json'), 'utf8'))
const standard = new Set(manifest.standard)
const special = new Map(Object.entries(manifest.special))
const failures = []
const files = []

async function walk(directory) {
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.posix.join(directory, entry.name)
    if (entry.isDirectory()) await walk(relative)
    else if (entry.name.endsWith('.tsx')) files.push(relative)
  }
}

await walk('src/components')
await walk('src/pages')

for (const file of files) {
  const categories = Number(standard.has(file)) + Number(special.has(file))
  if (categories === 0) failures.push(`${file}: component is not classified; add it as standard or special`)
  if (categories > 1) failures.push(`${file}: component cannot be both standard and special`)
}
for (const file of [...standard, ...special.keys()]) {
  if (!files.includes(file)) failures.push(`${file}: classification points to a missing component file`)
}
for (const [file, reason] of special) {
  if (typeof reason !== 'string' || reason.trim().length < 8) failures.push(`${file}: special component requires a concrete reason`)
}

// This is the fixed palette already used by Talk's standard visual system.
// Adding a new literal is a design-system change and must update this contract intentionally.
const allowedHex = new Set([
  '#f4f4f6', '#eef0f3', '#07a651', '#576b95', '#95ec69', '#f0fff5', '#07c160', '#e5f7ef', '#ededed',
  '#4ade80', '#9ca3af', '#ef4444', '#edf4ff', '#eef6f1', '#eef7f7', '#f3f6e8', '#f5efff', '#f7f0e8', '#fff3f0',
])
const allowedColorFamilies = new Set(['white', 'black', 'transparent', 'current', 'gray', 'red', 'amber', 'yellow', 'green', 'blue', 'orange', 'pink', 'slate'])
const shadedColorUtility = /(?:bg|text|border|ring|from|via|to)-([a-z]+)-(?:50|100|200|300|400|500|600|700|800|900|950)(?=\s|$|["'`}])/g
const customButtonEffect = /(?:active:scale-|transition-(?:all|colors|transform)|duration-\d+|ease-(?:in|out|in-out|linear))/g

for (const file of standard) {
  const source = await readFile(path.join(root, file), 'utf8')
  for (const match of source.matchAll(/#[0-9a-fA-F]{6}/g)) {
    if (!allowedHex.has(match[0].toLowerCase())) failures.push(`${file}: standard component uses unapproved color ${match[0]}`)
  }
  for (const match of source.matchAll(shadedColorUtility)) {
    if (!allowedColorFamilies.has(match[1])) failures.push(`${file}: standard component uses unapproved color family ${match[1]}`)
  }
  for (const match of source.matchAll(/(?:font|rounded|shadow)-\[([^\]]+)\]/g)) {
    if (!match[1].startsWith('var(--ui-')) failures.push(`${file}: standard component uses arbitrary ${match[0]}`)
  }
  const effects = [...source.matchAll(customButtonEffect)]
  if (effects.length) failures.push(`${file}: standard component overrides the shared button effect (${[...new Set(effects.map((item) => item[0]))].join(', ')})`)
}

if (failures.length) {
  console.error('UI component contract check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`UI component contract passed: ${standard.size} standard, ${special.size} special, no unclassified components.`)
