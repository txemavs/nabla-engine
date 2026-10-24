# 25. Testing and maintenance

[Manual contents](README.md)

Validation should match the change. A schema edit needs valid/invalid data cases;
a vehicle change needs physical behavior checks; a UI or backend change needs a
browser journey; a new export needs an independent consumer. Passing one category
does not establish the others.

## Repository commands

```sh
npm run build
npm run typecheck
npm test
npm run build:game
```

`npm run check` combines rig checks, generated documentation checking, formatting,
library build, typechecking, unit tests, and game build. Read the current script
definition rather than assuming this list remains fixed. Browser regressions are
separate:

```sh
npx playwright install chromium
npm run test:e2e
```

Use the project's supported Chromium configuration and fixture conventions.
Mocked terrain tests verify behavior against fixtures; they do not prove that a
remote Atlas object currently exists. Headset checks require the target device.

## Manual-specific validation

```sh
node scripts/check-manual.mjs
npm run build
node examples/manual/session.mjs
node examples/manual/contracts.mjs
npx tsc -p examples/manual/tsconfig.json
```

The manual checker verifies relative file links, heading fragments, expected
chapters, and the generated public-export reference. It does not execute fenced
shell commands, check remote URLs, or prove semantic accuracy. The examples exercise
real public contracts and their cleanup. The browser example is typechecked; a
successful typecheck does not claim a rendered browser session.

## Keeping evidence honest

When updating a chapter, follow its source links and inspect behavior, not just
comments. Comments and historical guides can disagree with code. Record unresolved
differences explicitly in the maintenance register. Do not mark the whole manual
“verified” because links resolve.

Before publishing a package, inspect `npm pack --dry-run` and run
`node scripts/check-package.mjs` according to the contributor workflow. Preserve
unrelated work and avoid running a repository-wide formatter over another task's
changes. Documentation-only work can use scoped formatting and the manual checks.

## Source of truth

- [Package scripts](../../package.json).
- [Browser testing guide](../../test/browser/README.md).
- [Manual checker](../../scripts/check-manual.mjs).
- [Manual maintenance record](maintenance.md).
