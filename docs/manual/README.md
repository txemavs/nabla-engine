# The Nabla Engine Manual

**Architecture, usage, and development of interactive worlds**

This manual explains how to build with `@nabla/engine`, how its subsystems work,
and how to change them without breaking ownership boundaries. It is written for
application developers, engine contributors, and coding agents. Read it alongside
the implementation: linked source files are evidence, not a promise that internal
modules are public APIs.

## Baseline and scope

First reviewed on **2026-10-23**, against package **0.3.9** and the working tree
based on commit `7015b8c25a083c8fa22e2d608d395ad74540e16c`. The working tree already
contained runtime and reference-game changes; this manual describes those inspected
files, not an assertion that the commit alone contains every described behavior.
The package version is owned by [package.json](../../package.json).

“Implemented” means present in the inspected source. “Executable example” means a
checked-in program with a documented command. Browser, device, remote-service, and
performance results require their own verification; a successful build establishes
none of those results. Experimental features are identified where discussed.

The engine, reference game, Atlas publisher, Studio editor, and Euskadi Online host
have different responsibilities. In particular, this repository is not the source
of truth for another repository's deployment. Known contradictions in older guides
and the current terrain integration are recorded in [maintenance](maintenance.md).

## Reading paths

- **First application:** chapters 1–4, then the runnable examples in appendix D.
- **Engine contributor:** chapters 5–9, the relevant subsystem, then 23–25.
- **Content author:** chapters 7–8 and 10–16.
- **Deployment or incident response:** chapters 24–26 and appendix E.
- **Coding agent:** read the repository's [AGENTS.md](../../AGENTS.md), this page,
  the relevant chapter's source links, and the maintenance discrepancy register.
  Check public exports before proposing an import. Preserve unrelated working-tree changes.

## Contents

### Part I — Discovering and using Nabla Engine

1. [What Nabla Engine is](01-introduction.md)
2. [Installation and development environment](02-development.md)
3. [Your first application](03-first-application.md)
4. [Using the engine in another project](04-integration.md)

### Part II — How the engine works

5. [Architecture and module ownership](05-architecture.md)
6. [Lifecycle and execution](06-lifecycle.md)
7. [Scenes, entities, and authored data](07-scenes.md)
8. [Coordinates and world representation](08-coordinates.md)
9. [Physics and simulation](09-physics.md)

### Part III — Worlds and content

10. [Geographic terrain and streaming](10-terrain.md)
11. [Assets and content catalogs](11-assets.md)
12. [Vehicles](12-vehicles.md)
13. [Vehicle presentation and equipment](13-vehicle-presentation.md)
14. [Characters and interaction](14-characters.md)
15. [Weapons and combat](15-combat.md)
16. [Portals](16-portals.md)

### Part IV — Presentation and user experience

17. [Rendering and the environment](17-rendering.md)
18. [Cameras and input](18-input.md)
19. [Audio](19-audio.md)
20. [Interface, settings, and languages](20-interface.md)
21. [Virtual and augmented reality](21-xr.md)
22. [Networking and multiplayer](22-networking.md)

### Part V — Extension, quality, and operations

23. [Extending the engine](23-extension.md)
24. [Performance and diagnostics](24-performance.md)
25. [Testing and maintenance](25-testing.md)
26. [Build, deployment, and services](26-deployment.md)

### Appendices

- [A. Public package entry points](appendix-api.md) — generated from package exports.
- [B. Configuration reference](appendix-configuration.md).
- [C. Data format reference](appendix-formats.md).
- [D. Practical recipes and executable examples](appendix-recipes.md).
- [E. Troubleshooting](appendix-troubleshooting.md).
- [F. Glossary and source map](appendix-glossary.md).
- [Maintenance procedure, evidence, and known discrepancies](maintenance.md).

## Keeping this manual current

Run `node scripts/check-manual.mjs` to check local links, chapter coverage, and the
generated package reference. After changing package exports, run
`node scripts/check-manual.mjs --write-reference`. Run the examples as described
in appendix D. These checks complement source review; they cannot certify that a
paragraph still describes runtime behavior. Record verification in
[maintenance.md](maintenance.md), including checks that were not performed.
