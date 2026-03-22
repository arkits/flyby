# FLYBY2 WebGPU Port — Validation Report

## Overview

This report reflects the current checked-out tree in `/Users/archit/Dev/flyby`
as audited on 2026-03-22 against:

- `FLYBY2/flyby2/FLYBY.C`
- `FLYBY2/flyby2/ASMOKE.C`
- `FLYBY2/impulse/src/ifield.c`
- `FLYBY2/impulse/src/i2dpict.c`
- `FLYBY2/impulse/src/iterrain.c`
- `FLYBY2/impulse/src/i3dg.c`

Verification performed in this audit:

- `bun run build`

Browser recapture is still pending after the latest renderer correctness fixes.
The expected capture commands are:

- `bun run capture:parity -- 'http://127.0.0.1:4173/?seed=1&scenario=runway&map=airport' /tmp/flyby-airport.png`
- `bun run capture:parity -- 'http://127.0.0.1:4173/?seed=1&scenario=runway&map=airport-improved' /tmp/flyby-airport-improved.png`

## Executive Summary

### Strongest Areas

- the six maneuver programs still mirror `FLYBY.C`
- SRF, FLD, PC2, and TER parsing are structurally close to the original code
- recursive field traversal, `LOD` checks, terrain elevation, region lookup,
  and coarse SRF collision helpers are in place
- PC2 overlay vs PLT inserted-scene separation now matches `ifield.c`
- smoke traversal order in `src/smoke.ts` matches the local `ASMOKE.C`
- static field geometry is now uploaded once and reused across frames
- browser-only `freeFlight` and `drive` modes now sit on a separate fixed-step
  runtime instead of mutating the scripted flyby loop

### Current Blockers

- low-FPS cadence still differs from the original draw-per-step flow
- the new browser vehicle modes are useful foundations, but they are adaptation
  work and should not be mistaken for parity evidence

### Browser Runtime Note

- bootstrap/runtime failures now surface through an in-app fault overlay with
  diagnostics and reload actions, which is useful browser adaptation work but
  not part of the original executable's behavior

### Bottom Line

The code compiles and the raw-airport path is restored in source, but parity
still cannot be signed off yet. The next milestone is rerunning honest raw
captures and removing the biggest runtime bottlenecks, not adding more visual
flourish to the current default mode.

## Build Audit

`bun run build` passes on the current tree.

That confirms the environment/shader refactor is integrated, but it does not
resolve the main open questions:

- the browser lighting/sky path is still an adaptation, not a parity tier
- the largest remaining risks are runtime correctness and raw-vs-enhanced mode separation

## Browser Sandbox Modes

The checked-out tree now includes two browser-only gameplay modes:

- `?app=freeflight`
- `?app=drive`

These share the asset loaders, renderer, and field runtime helpers, but they
run on a separate fixed-step simulation/camera/input stack. They are useful for
turning the port into a vehicle-sim foundation; they are not part of the
original screensaver contract.

## Runtime Capture Notes

Source audit confirms two important scene-state facts, and fresh browser
captures should now be rerun to verify them in the live app:

- `?map=airport` currently reports `Field loaded: 4 SRF, 2 PC2, 1 TER`
- `?map=airport-improved` currently reports `Field loaded: 22 SRF, 3 PC2, 1 TER`

By contrast, the checked-in `public/data/airport.fld` text asset contains only:

- 4 `SRF`
- 2 `PC2`
- 2 `PLT`
- 1 `TER`

The raw default airport now matches the checked-in `airport.fld` asset counts,
while `airport-improved` remains the explicit browser-enhanced variant.

## Parity Matrix

| Area | Original | Current Port | Status |
|------|----------|--------------|--------|
| `flyby.inf` loading | field, smoke mode, altitude, aircraft list | Ported | Good |
| Maneuver scripts | straight, roll, loop, climb, eight, 360 | Ported structurally | Good |
| Motion constants | `100 units/sec`, original pitch/bank/turn rates | Ported | Needs runtime validation |
| Camera look-at | `BiVectorToHeadPitch` every frame | Ported | Needs visual validation |
| Fixed-step pacing | `PassedTime()` waits for at least `0.02s` and each accepted step is drawn | Browser fixed-step accumulator exists, but batched stepping still coalesces draws | Partial parity |
| SRF parser | vertices, faces, normals, twist, bbox | Ported | Good |
| FLD parser | `SRF`, `TER`, `PC2`, `PLT`, `RGN`, `FLD`, `LOD` | Ported | Good |
| PC2 parser | `PST`, `PLL`, `LSQ`, `PLG`, `DST` | Ported | Good |
| Terrain parser | block mesh + side walls | Ported | Good |
| Recursive field traversal | nested `FLD` composition | Ported | Good |
| `PC2` vs `PLT` draw path | overlay vs inserted scene object | Ported | Good |
| Field runtime helpers | region, elevation, SRF collision | Implemented | Partial parity |
| Smoke class / instance model | Aurora-style data layout | Ported | Good |
| Smoke traversal order | backward stepping over tips in `ASMOKE.C` | Matches local source | Good |
| Smoke color transition edge path | literal `ASMOKE.C` branch semantics | Current code uses a safer browser interpretation | Unvalidated edge case |
| Raw default airport | original `AIRPORT.FLD` layout and colors | Default browser airport now uses raw asset counts | Partial parity |
| Default lighting / ground-sky | field colors + split horizon + eye-relative light | Environment descriptor, procedural sky, fog, and directional light | Browser adaptation |
| `flyby2_s` aircraft inventory | `FLYBY2_S.INF` list | Source list now matches original 22-aircraft bundle | Good |
| Browser build | should compile cleanly | Verified with `bun run build` | Good |

## Source-Audited Findings

### 1. Dynamic Draw Uniforms and Smoke/Vapor Buffer Ownership Are Now Safe on Paper

The renderer now assigns each draw its own aligned uniform-buffer slot instead
of rewriting one shared uniform block throughout the frame, and smoke lines /
vapor lines no longer alias the same dynamic vertex buffer before submission.

That removes two source-audited render-correctness hazards from the current
tree. Live browser recapture is still required to confirm the aircraft framing
is visually restored in practice.

### 2. Static Scene Rendering Is Still CPU-Rebuilt Every Frame

`src/renderer.ts` currently rebuilds:

- full field scene geometry
- aircraft world-space geometry
- camera-centered ground support geometry
- smoke and vapor upload arrays

on every render step.

This leaves the browser path heavily CPU-bound and creates avoidable
`Float32Array` churn on the hottest path.

### 3. The Code Already Pays for Prebuilt Aircraft GPU Buffers, but Does Not Use Them

`src/main.ts` still prebuilds `GpuSrf` buffers for every aircraft at load time,
and `state.gpuAircraft` is still tracked, but the renderer path consumes the
CPU model and rebuilds transformed aircraft vertices per frame instead.

This means startup cost is paid up front without getting the intended runtime
benefit.

### 4. The Default Airport Raw Path Is Restored

`enhanceFieldForMap(...)` now leaves the default `airport` variant
source-faithful and reserves browser-only scene augmentation for
`airport-improved` and `airport-night`.

That restores an honest raw capture path without removing the showcase variants.

### 5. The Browser Visual Stack Is Now an Explicit Adaptation Track

The current renderer uses a browser-only environment descriptor for:

- procedural sky
- directional key light
- hemisphere ambient
- fog / haze
- camera-relative ground ring
- emissive runway and city accents

This is coherent showcase work, but it is no longer the original ground/sky +
camera-relative light behavior from `FLYBY.C` / `i3dg.c`.

### 6. `flyby2_s` Inventory Now Matches `FLYBY2_S.INF`

The hardcoded list in `src/main.ts` now matches the 22 aircraft entries listed
in `FLYBY2/flyby2_s/FLYBY2_S.INF`.

That removes a source-audited inventory mismatch and prevents non-aircraft
assets from being randomized as flyby subjects.

### 7. Low-FPS Animation Still Differs from the Original Draw Cadence

The original maneuver loops call `DrawScreen`, then wait for one accepted
`PassedTime()` slice, then advance simulation.

The browser loop accumulates elapsed time and, once enough time has built up,
draws once and then advances as many fixed steps as needed. Under load, that
coalesces multiple simulation advances behind a single presented frame.

The fixed-step browser loop is better than tying motion directly to every RAF,
but it is still only partial parity with the original cadence.

### 8. Smoke Traversal Itself Is Not the Missing Parity Item Previously Claimed

The local `FLYBY2/flyby2/ASMOKE.C` iterates smoke tips backward for ribbon,
wire, trail, and solid smoke. The TypeScript port does the same.

The earlier doc claim about a missing forward anti-tremble traversal was not
supported by the checked-in `FLYBY2/` source tree and has been removed.

## Performance Audit

### Highest-Impact CPU Issues

- per-frame `buildFieldSceneGeometry(...)`
- per-frame `buildAircraftGeometry(...)`
- per-frame ground ring rebuilds and uploads
- repeated `Float32Array` allocations for field, aircraft, smoke, and vapor
- repeated identical uniform uploads before nearly every draw
- debug HUD DOM churn during active playback

### Missing Performance Features vs Original Runtime Intent

- no viewport/bounding-box rejection equivalent before most CPU tessellation
- no persistent static field mesh residency on the GPU
- no model-space aircraft draw using the already-built GPU buffers
- no clean separation of smoke and vapor buffer ownership

## Missing or Divergent Behavior vs Original

These are the main items still missing or materially divergent from the local
`FLYBY2/` codebase:

- browser showcase lighting/sky path replaces the original baseline visual path
- low-FPS draw cadence still differs from `PassedTime()` loops
- SRF collision remains a coarse bounding-box helper

## Suggested Next Verification Targets

1. Re-run deterministic raw-airport and improved-airport captures after the
   default-map fix and record the actual live results.
2. Fix smoke/vapor buffer aliasing before trusting smoke captures.
3. Move aircraft and static field rendering off the per-frame CPU rebuild path.
4. Re-run parity captures after those changes and update this report again.

## Definition of Done

The WebGPU port should only be called complete when all of the following are
true:

1. `bun run build` passes cleanly.
2. A raw original-airport validation mode exists and has fresh deterministic captures.
3. The six maneuvers match original timing and framing on representative runs.
4. `PC2`, `PLT`, terrain, and smoke behavior are checked against the original.
5. `flyby2_s` matches the original bundle inventory and defaults.
6. Browser-only enhancements are documented separately from parity claims.

Until then, the correct label is:

**Active source-faithful reimplementation with documented browser-side renderer divergence.**
