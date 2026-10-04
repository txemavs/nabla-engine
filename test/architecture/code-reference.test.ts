import { expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

it('indexes Vue callbacks with original line offsets and rejects stale or removed modules', () => {
  const directory = fs.mkdtempSync(path.join(tmpdir(), 'nabla-doc-reference-'))
  const script = fileURLToPath(new URL('../../scripts/document-code.mjs', import.meta.url))
  const run = (...args: string[]) =>
    execFileSync(process.execPath, [script, ...args], {
      cwd: directory,
      encoding: 'utf8',
      stdio: 'pipe',
    })
  try {
    fs.mkdirSync(path.join(directory, 'studio'))
    fs.writeFileSync(path.join(directory, 'package.json'), '{"name":"@nabla/studio"}')
    const file = path.join(directory, 'studio/view.vue')
    fs.writeFileSync(
      file,
      '<template>🌍</template>\r\n<script setup lang="ts">\r\nconst value = () => 42\r\n</script>\r\n',
    )
    expect(run()).toContain('1 modules, 1 functions')
    const page = path.join(directory, 'studio/REFERENCE.md')
    expect(fs.readFileSync(page, 'utf8')).toContain('Implementation, line 3')
    expect(run('--check')).toContain('verified')
    fs.writeFileSync(file, '<script setup lang="ts">const changed = () => 17</script>')
    expect(() => run('--check')).toThrow()
    run()
    fs.unlinkSync(file)
    expect(() => run('--check')).toThrow()
    run()
    expect(fs.existsSync(page)).toBe(false)
  } finally {
    const parent = path.resolve(tmpdir()) + path.sep
    if (!path.resolve(directory).startsWith(parent)) throw new Error('Unsafe temporary directory')
    fs.rmSync(directory, { recursive: true, force: true })
  }
}, 30_000)
