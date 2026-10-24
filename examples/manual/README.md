# Manual examples

These examples accompany [The Nabla Engine Manual](../../docs/manual/README.md).
Run commands from the repository root with dependencies installed.

```sh
npm run build
node examples/manual/session.mjs
node examples/manual/contracts.mjs
npx tsc -p examples/manual/tsconfig.json
```

- [scene.mjs](scene.mjs) creates validated authored data through public APIs.
- [session.mjs](session.mjs) drives a procedural vehicle and checks lifecycle/data isolation.
- [contracts.mjs](contracts.mjs) checks validation, geographic parsing, selected documented
  defaults, and single-owner pickup behavior.
- [browser.ts](browser.ts) exports a browser mount function. Import it into a bundler
  entry, pass a sized canvas, and invoke the returned cleanup function on unmount.

The Node examples require no GPU, DOM, remote terrain, or model download. The browser
module is typechecked here; it is not an HTML entry automatically served by Vite.
Serve engine assets in a real host as described in the manual. A successful
typecheck is not a browser rendering or headset test.
