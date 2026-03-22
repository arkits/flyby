# FLYBY2 WebGPU Port — Project Overview

## 1. Source Material

FLYBY2 is a military aircraft flyby screensaver by Soji Yamakawa (CaptainYS), circa 1994-2000.
It renders detailed polygon aircraft models performing acrobatic maneuvers over an airport scene
with smoke trails, using a custom C 3D graphics engine ("Blue Impulse") with an animation
library ("Aurora").

**Original source:** `FLYBY2/` directory (C, ANSI C99)
**Target:** Modern web browser via WebGPU, TypeScript, Vite bundler

## 2. Decisions

| Aspect | Decision |
|--------|----------|
| Shading | Flat per-face (original style). Smooth normals only on `R`-flagged vertices |
| Display | Fullscreen responsive. Adapt FOV to match original 640x480 field of view |
| Default smoke | Source-faithful defaults: engine default is solid smoke, bundled `flyby.inf` selects ribbon smoke |
| Framework | None — vanilla TypeScript + WebGPU |
| Asset loading | Fetch from `public/data/` at runtime |

## 2.1 Current Port Status

The project is no longer in the "initial implementation" stage. It has model
parsing, maneuver logic, smoke generation, field traversal, and an active
WebGPU renderer refactor in progress. However, it is **not yet a full
behavior-equivalent port** of the original screensaver.

Most importantly:

- maneuver scripting is largely ported
- asset parsing coverage is much better than before
- camera/view/projection is source-audited and much closer, but still not fully signed off visually
- terrain / PC2 / field rendering are present, but still need final parity validation

All current planning should prioritize reproducing the original behavior and
rendering semantics before adding more browser-specific features.

## 2.2 Audit Update (2026-03-22)

Current checked-out status, based on code and runtime capture:

- `bun run build` passes
- the browser runtime exposes four map variants:
  - `airport`
  - `airport-improved`
  - `airport-night`
  - `downtown`
- the default `airport` variant now stays on the raw `airport.fld` asset path
  while `airport-improved` and `airport-night` remain explicit browser-only variants
- the renderer now includes a procedural environment stack (sky, fog,
  hemisphere lighting, emissive accents, support ground), which is an explicit
  browser adaptation track
- the biggest remaining risks are:
  - per-frame field and aircraft CPU rebuilds
  - unsafe smoke / vapor buffer reuse
  - raw lighting still does not match the original ground/sky path closely enough

## 3. Source Files to Port

| Source (C) | Target (TypeScript) | Port Strategy |
|------------|---------------------|---------------|
| `impulse.h` (structs) | `src/types.ts` | Direct struct-to-interface translation |
| `icalc.c` + `impulse.h` macros | `src/math.ts` | Port all vector/angle/rotation functions |
| `imodel.c` BiLoadSrfMainLoop | `src/srf-parser.ts` | Port text parser, normal computation, twist constraint |
| `ifield.c` BiLoadFld | `src/fld-parser.ts` | Port scene parser, file loading via fetch |
| PC2 loader (i2dpict.c) | `src/pc2-parser.ts` | Port 2D picture parser |
| TER loader (iterrain.c) | `src/ter-parser.ts` | Port terrain mesh parser |
| `ASMOKE.C` | `src/smoke.ts` | Port smoke class/instance/draw logic |
| `FLYBY.C` | `src/flight.ts` + `src/main.ts` | Port maneuver logic, camera, main loop |
| OpenGL backend (iopengl.c) | `src/renderer.ts` + `src/shader.wgsl.ts` | Rewrite for WebGPU |
| Win32 input (idevice.c) | `src/input.ts` | Rewrite for DOM keyboard events |

## 4. Source Files to Create

| File | Est. Lines | Purpose |
|------|-----------|---------|
| `src/types.ts` | 200 | All data structures |
| `src/math.ts` | 400 | Vector, angle, rotation, projection math |
| `src/srf-parser.ts` | 300 | SRF 3D model parser |
| `src/fld-parser.ts` | 200 | FLD scene parser |
| `src/pc2-parser.ts` | 100 | PC2 2D picture parser |
| `src/ter-parser.ts` | 100 | TER terrain parser |
| `src/smoke.ts` | 350 | Smoke trail system |
| `src/flight.ts` | 350 | Flight maneuvers + camera |
| `src/renderer.ts` | 500 | WebGPU pipeline + draw calls |
| `src/shader.wgsl.ts` | 300 | WGSL shaders embedded in TypeScript |
| `src/input.ts` | 50 | Keyboard handling |
| `src/main.ts` | 200 | Entry point, asset loading, loop |
| `src/style.css` | 50 | Fullscreen canvas styles |
| `spec/` | — | This documentation |
| **Total** | **~3000** | |

## 5. Data Assets

Copy from `FLYBY2/flyby2/` to `public/data/`:

**Aircraft models (22):**
a6.srf, angels.srf, av8b.srf, ea6b.srf, f1.srf, f117a.srf, f14sprd.srf, f14swbk.srf,
f15.srf, f16.srf, f18.srf, f86blue.srf, mig21.srf, mig23spd.srf, mig23wbk.srf,
mrg2000.srf, su27.srf, t2blue.srf, t400.srf, t4blue.srf, thunder.srf, viggen.srf

**Field objects:**
hanger.srf, tower.srf

**Scene files:**
airport.fld, runway.pc2, signal.pc2, sample.ter

**Config:**
flyby.inf

## 6. Architecture Diagram

```
main.ts (entry)
  |
  +-- renderer.ts (WebGPU device, pipeline, vertex buffers)
  |     |
  |     +-- shader.wgsl.ts (embedded WGSL shader source)
  |
  +-- flight.ts (maneuver state machine)
  |     |
  |     +-- math.ts (vec3, angles, rotation, projection)
  |     +-- smoke.ts (smoke trail geometry generation)
  |
  +-- srf-parser.ts --> types.ts (SrfModel)
  +-- fld-parser.ts --> types.ts (Field)
  +-- pc2-parser.ts --> types.ts (Pc2)
  +-- ter-parser.ts --> types.ts (Ter)
  |
  +-- input.ts (keyboard events)
```

## 7. Implementation Order

1. Types + Math foundation
2. SRF Parser
3. WebGPU Renderer skeleton + shaders
4. Draw static SRF model (verify colors, back-face culling)
5. Flight logic + camera system
6. Animate aircraft with maneuvers
7. FLD/PC2/TER parsers
8. Draw airport scene (runway, hangars, terrain)
9. Sky/ground gradient + blue grid lines
10. Smoke trail system (ribbon)
11. Input handling + browser-appropriate controls
12. Asset bundling, fullscreen responsive, cleanup
13. Camera / projection validation against original behavior
14. Recursive field / terrain / PC2 parity validation

## 8. Verification

After each implementation step, run `bun run dev` and visually verify in browser:
- Step 4: Aircraft model renders with correct colors and back-face culling
- Step 6: Aircraft flies in loops/rolls/turns, camera tracks it
- Step 8: Airport runway markings, hangars, tower visible
- Step 9: Sky/ground gradient, blue reference grid
- Step 10: Smoke trails behind aircraft during maneuvers
- Step 11: Browser controls behave as intended without diverging from core flyby behavior

Final: Run `bun run build` to verify production build succeeds.
