/** Verify relative markdown links and documentation paths mentioned in comments. */
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const skipDir = new Set([
  'node_modules',
  'dist',
  'demo-dist',
  'game-dist',
  'test-results',
  'playwright-report',
  '.git',
])

function walk(directory, files, test) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (skipDir.has(entry.name)) continue
    if (entry.name.startsWith('.') && entry.name !== '.github') continue
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(full, files, test)
    else if (test(entry.name)) files.push(full)
  }
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

function headingExists(file, hash) {
  if (/\.(ts|vue|js|mjs|json)$/.test(file)) return true
  if (!hash) return true
  const text = fs.readFileSync(file, 'utf8')
  const want = slug(decodeURIComponent(hash))
  if (!want) return true
  if (new RegExp(`(?:id|name)=["']${hash}["']`).test(text)) return true
  for (const line of text.split('\n')) {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*$/)
    if (heading && slug(heading[1]) === want) return true
  }
  return false
}

const markdown = []
walk(
  root,
  markdown,
  (name) => (name.endsWith('.md') && name !== 'REFERENCE.md') || name === 'llms.txt',
)
const code = []
walk(root, code, (name) => /\.(ts|mjs|js)$/.test(name) && name !== 'document-code.mjs')

const broken = []
const link = /\[(?:[^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
for (const file of markdown) {
  const text = fs.readFileSync(file, 'utf8')
  for (const match of text.matchAll(link)) {
    const href = match[1]
    if (/^(https?:|mailto:|#|data:)/i.test(href)) continue
    const [pathname, hash] = href.split('#')
    const target = path.resolve(path.dirname(file), pathname)
    const relative = `${path.relative(root, file)} → ${href}`
    if (!fs.existsSync(target)) broken.push(relative)
    else if (hash && !headingExists(target, hash)) broken.push(`${relative} (missing #${hash})`)
  }
}

const mention = /(?<![`\w/])((?:docs|src|game|services|test|examples|assets)\/[\w./-]+\.md)\b/g
for (const file of [...markdown, ...code]) {
  const text = fs.readFileSync(file, 'utf8')
  const relativeFile = path.relative(root, file)
  for (const match of text.matchAll(mention)) {
    const mentioned = match[1]
    if (mentioned.includes('REFERENCE.md')) continue
    if (fs.existsSync(path.join(root, mentioned))) continue
    // Markdown links are already checked; this catches comments and bare paths.
    if (text.includes(`](${mentioned}`) || text.includes(`](../${mentioned}`)) continue
    broken.push(`${relativeFile} mentions ${mentioned}`)
  }
}

if (broken.length) {
  throw new Error(`Broken documentation links:\n${[...new Set(broken)].sort().join('\n')}`)
}
console.log(`Documentation links: ${markdown.length} pages checked, no broken relative targets`)
