// Vue's checker currently requires the JavaScript TypeScript compiler API.
// Keep the engine on its native TypeScript compiler and check SFCs separately.
require('vue-tsc').run(require.resolve('typescript-vue/lib/tsc'))
