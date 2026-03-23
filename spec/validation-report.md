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
- `bun run capture:parity -- 'http://127.0.0.1:4174/?seed=1&scenario=runway&map=airport' /tmp/flyby-airport.png`
- `bun run capture:parity -- 'http://127.0.0.1:4174/?seed=1&scenario=runway&map=airport-improved' /tmp/flyby-airport-improved.png`

## Executive Summary

### Strongest Areas

- the six maneuver programs still mirror `FLYBY.C`
- SRF, FLD, PC2, and TER parsing are structurally close to the original code
- recursive field traversal, `LOD` checks, terrain elevation, region lookup,
  and coarse SRF collision helpers are in place
- PC2 overlay vs PLT inserted-scene separation now matches `ifield.c`
- raw and improved airport runway captures now show the authored white PC2
  centerline and threshold markings again
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

The code compiles, the raw-airport path is restored in source, and fresh runway
captures now show the missing PC2 markings again. Parity still cannot be signed
off yet; the next milestone is broadening honest raw captures and removing the
biggest runtime bottlenecks, not adding more visual flourish to the current
default mode.

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

Scripted flyby mode now also exposes browser-only debug camera selectors
(`Director`, `Third Person`, `Top Down Follow`, `Top Down Static`) in the
debug HUD. The default `Director` path remains the only parity target for
`FLYBY.C` camera claims.

## Runtime Capture Notes

Source audit and fresh browser captures confirm two important scene-state
facts:

- `?map=airport` currently reports `Field loaded: 4 SRF, 2 PC2, 1 TER`
- `?map=airport-improved` currently reports `Field loaded: 22 SRF, 3 PC2, 1 TER`

By contrast, the checked-in `public/data/airport.fld` text asset contains only:

- 4 `SRF`
- 2 `PC2`
- 2 `PLT`
- 1 `TER`

The raw default airport now matches the checked-in `airport.fld` asset counts,
while `airport-improved` remains the explicit browser-enhanced variant.

The new deterministic runway captures also confirm that the white PC2 centerline
and threshold bars are visible again on both airport variants after restoring
source-faithful overlay painter ordering.

The enhanced airport variants now also treat the tiny `sample.ter` mesh as
runtime-only support data instead of a visible apron feature, and their
browser-authored road network has been tightened into perimeter/service access
roads rather than runway-crossing city blocks.

The `?map=san-francisco` path is now explicitly routed through `downtown.fld`
with browser-authored San Francisco showcase geometry: sharper procedural
ground breakup, SF-style street/water overlays, and landmark stand-ins for the
Salesforce Tower, Transamerica Pyramid, Golden Gate Bridge, Coit Tower, and
the Ferry Building clock tower. That work is intentional browser adaptation,
not parity evidence.

## Parity Matrix

| Area                             | Original                                                                  | Current Port                                                                                             | Status                   |
| -------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------ |
| `flyby.inf` loading              | field, smoke mode, altitude, aircraft list                                | Ported                                                                                                   | Good                     |
| Maneuver scripts                 | straight, roll, loop, climb, eight, 360                                   | Ported structurally                                                                                      | Good                     |
| Motion constants                 | `100 units/sec`, original pitch/bank/turn rates                           | Ported                                                                                                   | Needs runtime validation |
| Camera look-at                   | `BiVectorToHeadPitch` every frame                                         | Ported; debug HUD also exposes non-parity `Third Person`, `Top Down Follow`, and `Top Down Static` views | Needs visual validation  |
| Fixed-step pacing                | `PassedTime()` waits for at least `0.02s` and each accepted step is drawn | Browser fixed-step accumulator exists, but batched stepping still coalesces draws                        | Partial parity           |
| SRF parser                       | vertices, faces, normals, twist, bbox                                     | Ported                                                                                                   | Good                     |
| FLD parser                       | `SRF`, `TER`, `PC2`, `PLT`, `RGN`, `FLD`, `LOD`                           | Ported                                                                                                   | Good                     |
| PC2 parser                       | `PST`, `PLL`, `LSQ`, `PLG`, `DST`                                         | Ported                                                                                                   | Good                     |
| Terrain parser                   | block mesh + side walls                                                   | Ported                                                                                                   | Good                     |
| Recursive field traversal        | nested `FLD` composition                                                  | Ported                                                                                                   | Good                     |
| `PC2` vs `PLT` draw path         | overlay vs inserted scene object, with painter-ordered PC2 map drawing    | Ported                                                                                                   | Good                     |
| Field runtime helpers            | region, elevation, SRF collision                                          | Implemented                                                                                              | Partial parity           |
| Smoke class / instance model     | Aurora-style data layout                                                  | Ported                                                                                                   | Good                     |
| Smoke traversal order            | backward stepping over tips in `ASMOKE.C`                                 | Matches local source                                                                                     | Good                     |
| Smoke color transition edge path | literal `ASMOKE.C` branch semantics                                       | Current code uses a safer browser interpretation                                                         | Unvalidated edge case    |
| Raw default airport              | original `AIRPORT.FLD` layout and colors                                  | Default browser airport now uses raw asset counts                                                        | Partial parity           |
| Default lighting / ground-sky    | field colors + split horizon + eye-relative light                         | Environment descriptor, procedural sky, fog, and directional light                                       | Browser adaptation       |
| `flyby2_s` aircraft inventory    | `FLYBY2_S.INF` list                                                       | Source list now matches original 22-aircraft bundle                                                      | Good                     |
| Browser build                    | should compile cleanly                                                    | Verified with `bun run build`                                                                            | Good                     |

## Source-Audited Findings

### 1. PC2 Overlay Painter Ordering Now Matches `BiOvwPc2`

`FLYBY2/impulse/src/i2dpict.c` draws PC2 map objects in order without writing
z-buffer depth, so later runway markings overwrite the base strip. The browser
renderer now mirrors that behavior for PC2 overlay triangles / lines / points.

Fresh deterministic runway captures show the previously missing white runway
paint on both `airport` and `airport-improved`, which makes the raw airport map
layout materially closer to the original data.

### 2. Dynamic Draw Uniforms and Smoke/Vapor Buffer Ownership Are Now Safe on Paper

The renderer now assigns each draw its own aligned uniform-buffer slot instead
of rewriting one shared uniform block throughout the frame, and smoke lines /
vapor lines no longer alias the same dynamic vertex buffer before submission.

That removes two source-audited render-correctness hazards from the current
tree. Live browser recapture is still required to confirm the aircraft framing
is visually restored in practice.

### 3. Aircraft/Smoke Layering Now Matches `FLYBY.C` Again

The checked-in `FLYBY2/flyby2/FLYBY.C` inserts the aircraft before calling
`ArInsSmoke(...)` and `ArInsSmoke(...)` for vapor. `src/renderer.ts` now does
the same again.

That matters for realism: the aircraft writes depth first, then the smoke pass
uses depth testing to decide whether each ribbon or vapor segment belongs in
front of or behind the aircraft instead of forcing the aircraft to sit on top
of every smoke pass.

### 4. Static Scene Rendering Is Still CPU-Rebuilt Every Frame

`src/renderer.ts` currently rebuilds:

- full field scene geometry
- aircraft world-space geometry
- camera-centered ground support geometry
- smoke and vapor upload arrays

on every render step.

This leaves the browser path heavily CPU-bound and creates avoidable
`Float32Array` churn on the hottest path.

### 5. The Code Already Pays for Prebuilt Aircraft GPU Buffers, but Does Not Use Them

`src/main.ts` still prebuilds `GpuSrf` buffers for every aircraft at load time,
and `state.gpuAircraft` is still tracked, but the renderer path consumes the
CPU model and rebuilds transformed aircraft vertices per frame instead.

This means startup cost is paid up front without getting the intended runtime
benefit.

### 6. The Default Airport Raw Path Is Restored

`enhanceFieldForMap(...)` now leaves the default `airport` variant
source-faithful and reserves browser-only scene augmentation for
`airport-improved` and `airport-night`.

That restores an honest raw capture path without removing the showcase variants.

### 7. The Browser Visual Stack Is Now an Explicit Adaptation Track

The current renderer uses a browser-only environment descriptor for:

- procedural sky
- subtle `airport-night` aurora ribbons and angular point-sampled stars
- directional key light
- hemisphere ambient
- fog / haze
- camera-relative ground ring
- emissive runway, city, and warm light-pole accents

This is coherent showcase work, but it is no longer the original ground/sky +
camera-relative light behavior from `FLYBY.C` / `i3dg.c`.

The same adaptation track now includes authored airport-circulation cleanup for
`airport-improved` / `airport-night`: the synthetic support roads stay on the
apron and perimeter side of the field, and the small raw `sample.ter` patch is
no longer rendered as a bright square in top-down inspection views.

The `airport-night` showcase pass now also leans into a denser star field while
keeping runway paint cooler and less emissive than the daytime browser
variants, so the strip reads more like reflected paint than self-lit markings.

That same night pass now uses denser multicolor runway lighting and a heavier
distant light field: amber edge lights, green threshold bars, red runway-end
accents, blue taxiway lights, and warmer pole / horizon glows that are meant
to read closer to photographed airport approaches than to sparse debug markers.

The downtown adaptation track now also uses an authored Times Square-style
core: denser showcase towers flank a protected north-south fly-through
corridor, tall facades use adaptive full-height window grids, and recent
straight / loop downtown checks report no SRF collision at the sampled capture
frames. This remains browser-authored showcase work, not original-scene parity.

### 8. `flyby2_s` Inventory Now Matches `FLYBY2_S.INF`

The hardcoded list in `src/main.ts` now matches the 22 aircraft entries listed
in `FLYBY2/flyby2_s/FLYBY2_S.INF`.

That removes a source-audited inventory mismatch and prevents non-aircraft
assets from being randomized as flyby subjects.

### 9. Low-FPS Animation Still Differs from the Original Draw Cadence

The original maneuver loops call `DrawScreen`, then wait for one accepted
`PassedTime()` slice, then advance simulation.

The browser loop accumulates elapsed time and, once enough time has built up,
draws once and then advances as many fixed steps as needed. Under load, that
coalesces multiple simulation advances behind a single presented frame.

The fixed-step browser loop is better than tying motion directly to every RAF,
but it is still only partial parity with the original cadence.

### 10. Smoke Traversal Itself Is Not the Missing Parity Item Previously Claimed

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
2. Re-run captures that exercise smoke-heavy passes and confirm aircraft/ribbon
   occlusion now matches the original ordering in practice.
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
