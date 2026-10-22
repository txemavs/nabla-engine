// The relay (services/relay, plain Node, own image) uses the engine's combat rules without a
// build: this copies the compiled rules (dist/simulation/combat/damage.js, pure, no imports)
// to services/relay/combat.mjs. Run after `tsc -p tsconfig.build.json` when the rules change;
// test/net/relay-combat.test.ts fails while the copy disagrees with src.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const from = fileURLToPath(new URL('../dist/simulation/combat/damage.js', import.meta.url))
const to = fileURLToPath(new URL('../services/relay/combat.mjs', import.meta.url))
const source = readFileSync(from, 'utf8').replace(/\n\/\/# sourceMappingURL=.*$/m, '')
if (/^\s*import\s/m.test(source)) throw new Error('combat rules must stay import-free for the relay')
writeFileSync(
  to,
  `// Copied by scripts/relay-combat.mjs from the engine build of src/simulation/combat/damage.ts. Do not edit.\n${source}`,
)
console.log('wrote', to)
