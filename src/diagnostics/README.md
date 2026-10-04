# Diagnostics

Bounded frame measurements. CPU is main-thread elapsed time, not GPU timing.

**Owns:** 1,800-sample CSV, recent 240-frame mean/p95/p99, suspension-gap exclusion.
**Does not own:** quality presets, tile overlay, or Studio preference persistence.

Studio **Diagnóstico** is an operator surface. See
[performance lab](../../docs/architecture/performance-lab.md) for that UI.
Quality keys live in [`src/config/performance.ts`](../config/performance.ts).

- Tests: `test/runtime`
- Measured review: [2026-10-04](../../docs/architecture/performance-review-2026-10-04.md)

- Generated reference: [REFERENCE.md](REFERENCE.md)
