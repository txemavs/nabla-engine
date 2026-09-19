# @nabla/engine

Reusable 3D mini-engine for Nabla apps.

## Status

**Scaffold phase** — interfaces and structure only. Core implementation will be extracted from [Agency](https://github.com/txemavs/agency-ui) stage in Phase 1.

## What is this?

Nabla Engine is designed to be a lightweight, renderer-agnostic 3D engine core. It provides:

- Physics adapter interfaces
- Scene management primitives
- Math utilities

Agency and other Nabla projects will consume versioned releases of this package.

## Installation

```bash
npm install @nabla/engine
```

## Usage

```typescript
import { VERSION, type PhysicsAdapter } from "@nabla/engine";

console.log(`Nabla Engine v${VERSION}`);
```

## Roadmap

- **Phase 0 (current)**: Scaffold — TypeScript lib structure, CI, placeholder interfaces
- **Phase 1**: Extract core interfaces and math from Agency stage
- **Phase 2**: Optional Three.js render adapter (Three.js will NOT be a required dependency)

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

## License

MIT
