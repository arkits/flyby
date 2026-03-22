# FLYBY2 WebGPU Port — Validation Report

## Overview

This report compares the current Vite/WebGPU implementation against the
original Windows screensaver in `FLYBY2/flyby2/FLYBY.C` and the original engine
subsystems in `FLYBY2/impulse/src/`.

**Validation Date:** 2026-03-22
**Status:** Partial port, not at parity
**Build Status:** `npm run build` passes
**Capture Path:** `npm run capture:parity -- http://127.0.0.1:4180/ parity-shot-webgpu.png`

The previous docs overstated completion. The current codebase has the core port
structure in place, but several original rendering and behavior paths are still
missing or diverge from the screensaver.

---

## Executive Summary

### Strongly Ported

- `flyby.inf` loading, including all 22 original aircraft entries
- SRF loading and aircraft rendering path
- The six original maneuver scripts
- Forward speed and main pitch / bank / turn constants
- Smoke class / instance data model
- FLD, TER, and standard PC2 object parsing
- Recursive field loading and `LOD`-based scene traversal
- Original `X` quit / help prompt behavior is now restored in browser form
- Live render now shows aircraft, runway, terrain, and field objects again
- Field runtime region, elevation, object lookup, and SRF collision helpers now exist

### Not Yet at Original Behavior

- Camera, view matrix, and projection still need source-level validation
- Ground / sky rendering still needs visual validation against the original backdrop path
- Terrain wall color handling was corrected, but still needs visual validation
- Camera and final framing still need visual validation after the renderer changes

### Bottom Line

This is a credible reimplementation foundation, but it is not yet a complete
port of the original screensaver's functionality and behavior.

---

## Original Asset Audit

### Aircraft Availability

`public/data/flyby.inf` matches the original `FLYBY2/flyby2/FLYBY.INF`, and all
22 referenced aircraft files exist in `public/data/`:

- `a6.srf`
- `angels.srf`
- `av8b.srf`
- `ea6b.srf`
- `f1.srf`
- `f117a.srf`
- `f14sprd.srf`
- `f14swbk.srf`
- `f15.srf`
- `f16.srf`
- `f18.srf`
- `f86blue.srf`
- `mig21.srf`
- `mig23spd.srf`
- `mig23wbk.srf`
- `mrg2000.srf`
- `su27.srf`
- `t2blue.srf`
- `t400.srf`
- `t4blue.srf`
- `thunder.srf`
- `viggen.srf`

This part of the port is complete from an asset-availability perspective.

### Airport Scene Availability

The bundled field data required by the original default experience is present:

- `airport.fld`
- `runway.pc2`
- `signal.pc2`
- `sample.ter`
- `hanger.srf`
- `tower.srf`

The parity risk is therefore in runtime behavior, not missing source assets.

---

## Parity Matrix

| Area | Original | Current Port | Status |
|------|----------|--------------|--------|
| `flyby.inf` script loading | Field, altitude, smoke mode, aircraft list | Ported | Good |
| Aircraft inventory | 22 selectable aircraft | Ported and available | Good |
| Maneuver set | Straight, Roll, Loop, Climb, Eight, 360 | Ported | Good |
| Motion constants | ~100 units/sec, original attitude update rates | Ported more closely, with 0.02s minimum timestep restored | Needs runtime validation |
| Camera spawn | Random offset around aircraft | Ported | Needs visual validation |
| Camera look-at | Aircraft-centered each frame | Ported | Needs visual validation |
| Projection setup | Original Blue Impulse camera space | Reimplemented, scene now renders correctly but equivalence is still unproven | Partial parity |
| Default smoke config | Engine default `SOLIDSMOKE`, bundled `flyby.inf` selects `RIBBONSMOKE` | Ported | Good |
| Smoke geometry types | Ribbon / Wire / Trail / Solid | Implemented | Needs end-to-end validation |
| Field parsing | `SRF`, `TER`, `PC2`, `PLT`, `RGN`, `FLD`, `LOD` | Ported structurally and backed by runtime helpers | Partial parity |
| Recursive `FLD` transforms | Nested field composition | Ported | Needs validation |
| `LOD` behavior | Distance culling in field traversal | Ported | Needs validation |
| Terrain mesh | Block triangles + side walls | Ported and now visibly present | Partial parity |
| PC2 format | Standard object types from `i2dpict.c` | Ported with thin-geometry approximations for line/point primitives | Partial parity |
| `PC2` vs `PLT` runtime behavior | Separate draw paths | Split into separate overlay vs scene paths | Partial parity |
| Region metadata (`RGN`) | Queryable at runtime | Recursive runtime query implemented | Partial parity |
| Screensaver exit/help UX | `X` exits, other keys show help | Restored with browser overlay text | Adapted parity |
| Render capture (`T`) | TIFF output | Browser PNG download | Browser adaptation |

---

## Source-Audited Findings

### 1. Flight Script Coverage Is Largely Correct

`src/flight.ts` preserves the original six maneuver scripts and uses the same
high-level sequencing as `FLYBY.C`:

- Straight
- Roll
- Loop
- Climb
- Eight
- 360

The core forward progression and attitude changes are close to the original.
This is the strongest parity area in the current codebase.

### 2. Time Stepping Now Tracks the Original Cadence More Closely

The original `PassedTime()` waits until at least `0.02` seconds have elapsed
before advancing simulation time. The browser port now uses a minimum `0.02`
simulation step, caps elapsed frame time at `0.1`, and only redraws when at
least one simulation step is due instead of presenting every high-refresh RAF
tick.

Impact:

- maneuver timing is less sensitive to 120 Hz style redraw rates
- on-screen pacing like help-text lifetime is closer to simulation cadence
- smoke density and slow-frame behavior still need browser-side visual
  validation

### 3. Camera / Projection Was Source-Audited and Corrected at the Math Layer

The original screensaver computes a random eye position, then reorients the
camera every frame with `BiVectorToHeadPitch`, and renders using the engine's
standard projection with an extra 2x magnification applied in `DrawScreen()`.

The browser port now matches several source-level facts that were previously
wrong in the renderer:

- `getStdProjection()` now uses the original Blue Impulse default
  magnification and far plane values
- the WebGPU render path now reapplies the extra 2x projection magnification
  that `FLYBY.C` performs in `DrawScreen()`
- the camera path now preserves the original engine's positive-Z-forward camera
  space instead of forcing a conventional RH camera-space `z` flip
- the projection matrix is now left-handed to match that camera space

This removes the biggest known camera/render-space mismatch. Visual parity is
still not fully signed off, but the framing is now based on audited engine
assumptions rather than inferred WebGPU conventions.

### 4. Ground / Sky Rendering Now Follows the Original Approach

The original `DrawScreen()` path uses the field's actual ground and sky colors
via `BiGetFieldGroundSky()` and `BiDrawGroundSky()`.

The current renderer builds a screen-space ground/sky split from eye pitch and
bank using the same horizon-line approach as `BiDrawGroundSky()`.

For browser readability, it also keeps a smaller near-field ground support
plane under the airport scene. This is an adaptation rather than a claim of
exact engine equivalence, but it avoids the airport falling back to an all-sky
floor when the backdrop split alone is insufficient in WebGPU.

Impact:

- the previous full-scene fake-ground slab is gone
- a smaller near-field support plane remains as an explicit browser adaptation
- final visual equivalence of the backdrop split still needs runtime validation

### 5. `PC2` and `PLT` Are Partially Restored

The original field runtime treats these differently:

- `PC2` objects are drawn by `BiOvwFld()` as overlaid field maps
- those `PC2` objects are explicitly pitched by `-16384` before drawing
- `PLT` objects are inserted later by `BiInsFld()` with scene geometry

The current WebGPU renderer now separates these paths again:

- `PC2` field maps use an overlay path with the original `-16384` pitch
  adjustment applied before composition
- `PLT` objects go through the scene insertion path

This closes one of the biggest structural parity gaps. What remains is visual
validation of the final composition and depth behavior.

Impact:

- runway / field-map behavior is structurally closer to the original
- inserted PC2 objects now follow the correct high-level path

### 6. PC2 Parsing and Runtime Now Cover the Standard Object Types

The original `i2dpict.c` supports multiple object types including:

- point sets
- polylines
- line sequences
- polygons

The browser parser/runtime now supports:

- point sets
- polylines
- line sequences
- polygons

It also preserves per-object `DST` visibility distances and center-based
visibility checks derived from `i2dpict.c`.

Impact:

- standard PC2 data no longer has to be polygon-only
- exact raster equivalence for point/line objects still needs visual validation

### 7. Terrain Port Exists, and Side-Wall Color Mapping Was Corrected

The terrain port handles:

- `BLO` entries
- `L` / `R` diagonal choice
- per-triangle visibility
- side-wall generation

The original terrain code stores side-wall colors in the natural order
`BOT`, `RIG`, `LEF`, `TOP`. The current renderer now maps those indices
correctly, but the terrain still needs visual validation against the original
airport scene.

Impact:

- terrain wall color semantics are no longer obviously wrong in code
- visual parity for the airport terrain is still not yet trustworthy

### 8. `RGN` Blocks Are No Longer Parse-Only

The original field system exposes region queries and related field helpers. The
TypeScript port now includes a recursive field-region query matching the
`BiGetFldRegion()` traversal pattern, and the debug HUD uses it at runtime for
aircraft and camera positions.

Remaining gap:

- the broader field helper surface from the original engine still needs
  validation against more than the bundled airport scene

### 9. Terrain Elevation Queries Are Partially Ported

The field-runtime helper layer now includes recursive terrain-elevation lookup
derived from `BiGetFldElevation()` / `BiTerHeight()`, and the debug HUD reports
the sampled elevation under the aircraft when terrain coverage exists.

Remaining gap:

- terrain query vectors still need behavioral validation against the original
- collision helpers still need exact source-level validation

### 10. Browser Input Is Now Much Closer to the Screensaver Contract

Original behavior in `DrawScreen()`:

- `X` sets the quit flag
- any other key shows the help text for 30 frames
- `T` triggers render-to-file

Current browser behavior:

- `T` downloads the canvas as PNG
- `X` stops the animation loop
- non-special keys show the help prompt for 30 frames
- the browser-only debug panel now exposes aircraft/maneuver selection,
  randomize controls, maneuver progress, and telemetry graphs for validation
- the browser-only debug panel and canvas input now expose pan/tilt/zoom
  camera trim controls for inspection without changing the underlying
  maneuver/camera simulation state
- SRF and PC2 polygon rendering no longer assumes a triangle fan, which fixes
  the browser-only concave-face artifacts that showed up on some aircraft

This is now an intentional browser adaptation rather than a missing port.

---

## Current Status by Subsystem

### Safe to Treat as Ported

- aircraft list and asset loading
- SRF parser
- high-level maneuver coverage
- smoke data structures and append logic
- `X` quit / help prompt interaction flow
- standard PC2 parser/runtime coverage
- field runtime helper surface for queries and metadata

### Ported but Still Needs Validation

- camera spawn and camera tracking
- final framing after the 2026-03-22 camera/projection correction
- recursive field composition
- `LOD` culling
- final `PC2` overlay / `PLT` scene composition after restoring the split
- ground / sky backdrop split after replacing the fixed ground slab
- smoke mode behavior in browser
- terrain transform / placement
- exact scene framing and camera distance on representative passes
- broader parity review of the new concave-polygon tessellation against the
  original software polygon rasterizer

### Validation Workflow

- Start the app locally with `npm run dev -- --host 127.0.0.1 --port 4180`
- Capture a deterministic WebGPU frame with:
  `npm run capture:parity -- http://127.0.0.1:4180/ parity-shot-webgpu.png`
- Compare the captured frame and HUD values against source expectations and any
  available original-reference screenshots

### Not Yet Fully Ported

- exact raster equivalence for PC2 point/line primitives
- original TIFF render capture behavior
- final visual signoff for camera/framing and airport composition

---

## Definition of Done for Full Port

The WebGPU version should only be called complete when all of the following are
true:

1. The six maneuvers visually match the original timing and attitude behavior.
2. Camera framing matches the original screensaver for representative passes.
3. The airport scene matches original composition:
   - runway
   - signal boards
   - hangars
   - tower
   - terrain
4. `PC2` and `PLT` follow the same layering and transform rules as the
   original engine.
5. Terrain side walls and colors match original data semantics.
6. All smoke modes behave correctly, not just the default ribbon path.
7. `RGN` and field runtime semantics are either ported or explicitly declared
   out of scope.
8. Browser-specific adaptations are documented separately from parity claims.
9. The WebGPU output is visually checked against the original on representative
   straight, roll, loop, and low-runway passes.

Until then, the correct label is:

**Active source-faithful reimplementation, not yet complete.**
