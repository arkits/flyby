# AGENTS.md

## Purpose

This repository is a TypeScript/WebGPU reimplementation of the original
Windows `FLYBY2` screensaver in [`FLYBY2/`](./FLYBY2). The primary goal is
behavior parity with the original C code, not feature expansion.

When working here, prefer source-faithful fixes over aesthetic rewrites.

## Current Priorities

1. Match the original maneuver timing and camera behavior from
   [`FLYBY2/flyby2/FLYBY.C`](./FLYBY2/flyby2/FLYBY.C).
2. Keep the airport scene readable in the browser:
   runway, hangars, tower, signal boards, terrain, aircraft, smoke.
3. Port original rendering/runtime behavior before adding browser polish.
4. Update the docs in [`spec/`](./spec) whenever parity status changes.

## Key Commands

- `bun run build`
  Type-check and produce a production build. Run this after code changes.
- `bun run dev`
  Start the Vite dev server for live inspection.
- `bun run capture:parity -- <url> <output.png>`
  Capture a deterministic browser frame for parity review.

## Important Source Files

- [`src/main.ts`](./src/main.ts)
  App bootstrap, config loading, asset loading, state creation.
- [`src/flight.ts`](./src/flight.ts)
  Main flyby loop, maneuver sequencing, timing, camera look-at.
- [`src/renderer.ts`](./src/renderer.ts)
  WebGPU pipelines and scene composition.
- [`src/smoke.ts`](./src/smoke.ts)
  Smoke node storage and ribbon/trail/wire/solid geometry generation.
- [`src/fld-parser.ts`](./src/fld-parser.ts)
  Field scene parser (`FLD`).
- [`src/field-runtime.ts`](./src/field-runtime.ts)
  Runtime field queries: region, elevation, collision helpers.
- [`src/pc2-parser.ts`](./src/pc2-parser.ts)
  PC2 parser for runway boards and other 2D picture assets.
- [`src/ter-parser.ts`](./src/ter-parser.ts)
  Terrain mesh parser.
- [`src/math.ts`](./src/math.ts)
  Core Blue Impulse math helpers and projection setup.

## Original C References

Use these as the source of truth when behavior is unclear:

- [`FLYBY2/flyby2/FLYBY.C`](./FLYBY2/flyby2/FLYBY.C)
  Main app, timing, camera, interaction, maneuver flow.
- [`FLYBY2/flyby2/ASMOKE.C`](./FLYBY2/flyby2/ASMOKE.C)
  Smoke behavior and geometry semantics.
- [`FLYBY2/impulse/src/ifield.c`](./FLYBY2/impulse/src/ifield.c)
  FLD parsing, field draw order, runtime queries.
- [`FLYBY2/impulse/src/i2dpict.c`](./FLYBY2/impulse/src/i2dpict.c)
  PC2 parsing and draw behavior.
- [`FLYBY2/impulse/src/iterrain.c`](./FLYBY2/impulse/src/iterrain.c)
  Terrain construction and side-wall semantics.
- [`FLYBY2/impulse/src/i3dg.c`](./FLYBY2/impulse/src/i3dg.c)
  Projection, view setup, and original ground/sky behavior.

## Working Rules

- Do not claim parity unless it has been checked against the original source
  or a captured browser frame.
- If a change materially affects behavior, update:
  - [`spec/validation-report.md`](./spec/validation-report.md)
  - [`spec/10-implementation-plan.md`](./spec/10-implementation-plan.md)
- Prefer small, auditable fixes over broad refactors.
- Preserve existing asset formats and data loading paths under
  [`public/data/`](./public/data).
- Treat browser-specific behavior as an adaptation and document it explicitly.

## Known Sensitive Areas

- Timing:
  The original waits for `0.02` seconds between simulation advances. High
  refresh rate browsers can easily run too fast if simulation is tied directly
  to `requestAnimationFrame`.
- Camera/framing:
  A fix that makes the scene "look better" can still be wrong if it no longer
  matches the original camera behavior.
- Ground/sky:
  This area has been unstable. Validate visual changes carefully.
- Smoke:
  Ribbon/trail/wire/solid behavior is easy to approximate incorrectly.
- PC2 vs PLT:
  They do not share the same runtime path in the original engine.

## Expected Verification

At minimum after non-trivial changes:

1. Run `bun run build`.
2. Inspect the running app in browser.
3. If rendering/timing changed, capture a frame with `capture:parity`.
4. Update `spec/` with the new status.

## Good Outcomes

- The app behaves more like the original screensaver.
- The user can see the aircraft, ground, runway, and smoke reliably.
- The docs tell the truth about what is ported and what is still approximate.
