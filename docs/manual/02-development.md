# 2. Installation and development environment

[Manual contents](README.md)

The package requires Node.js 22.12 or later and npm. The lockfile records the
dependency graph; use `npm ci` for a reproducible installation. Run commands from
the repository root unless a recipe explicitly says otherwise.

```sh
npm ci
npm run build
npm run dev
```

The library build writes `dist/`. The development command serves the reference game
through `vite.game.config.ts`, using port 5174 with `strictPort: true`. If that port
is occupied, resolve the existing process deliberately; do not silently move a
configured local test to another origin. The `predev` hook prepares asset packs.

Open `http://localhost:5174/?example=flat` for bundled content or
`http://localhost:5174/test.html` for the test entry. With HTTPS configured, use the
same paths on the HTTPS origin. `/headset.html` selects headset experiences.

## HTTPS and remote devices

The Vite configuration reads `NABLA_HTTPS_CERT` and `NABLA_HTTPS_KEY` together. Supplying
only one is an error. Both values are file paths, not PEM contents. A PowerShell
setup using your existing certificate files looks like this:

```powershell
$env:NABLA_HTTPS_CERT = 'C:\certificates\local-cert.pem'
$env:NABLA_HTTPS_KEY = 'C:\certificates\local-key.pem'
npm run dev
```

Replace those paths with real files and ensure the device trusts the certificate
for the hostname being used. A remote headset's `localhost` is the headset itself.
The server binds to `0.0.0.0`; use the development machine's reachable hostname.
Device support and secure-context requirements still apply.

## Repository map

`src/` contains reusable implementation; `game/` composes it; `assets/` contains
content; `examples/` demonstrates public imports; `test/` holds regressions;
`scripts/` contains build and preparation tools. `docs/reference/` is generated
code documentation, while this manual explains relationships and workflows.

For a terrain producer and cache, the optional development stack starts with:

```sh
docker compose -f compose.dev.yaml up --build -d
```

Read the [local stack guide](../local-development.md) before using its services.
It is not required for the flat example. Published terrain has an additional
contract issue documented in [chapter 10](10-terrain.md).

After a local gameplay change, follow `AGENTS.md`: restart the development server
and preserve its HTTPS settings. Documentation-only edits do not change the game
and do not require restarting it.

## Source of truth

- [Scripts and Node requirement](../../package.json).
- [Vite server and proxy](../../vite.game.config.ts).
- [Contributor workflow](../../CONTRIBUTING.md).
- [Local instructions](../../AGENTS.md).
