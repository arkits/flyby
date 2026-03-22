# Implementation Plan — Finish the Original FLYBY2 Port in WebGPU

## Goal

Close the remaining behavior gap between the original Windows screensaver and
the current WebGPU reimplementation. The focus is strict source parity first,
browser polish second.

---

## Current Assessment

### Already Good Enough to Build On

- application shell and asset loading
- SRF parsing and aircraft rendering
- original aircraft inventory
- six maneuver scripts
- smoke data model
- FLD / TER / full standard PC2 parsing
- browser `X` quit / help prompt flow
- field runtime helper layer for region/elevation/object queries

### Main Remaining Gaps

1. Camera and projection are not yet proven equivalent to the original engine.
2. Ground / sky backdrop still needs visual validation against the original.
3. Final visual validation is still needed for the restored `PC2` vs `PLT` split.
4. Terrain still needs runtime visual validation against the original.
5. Camera and final framing are still the main blockers.
6. PC2 point/line primitives still use browser/WebGPU approximations rather
   than the original raster path.

---

## Priority Order

### Phase 1: Lock Camera / Projection Parity

**Why first:** Every visual comparison is suspect until the camera model is
correct.

**Tasks**

- Add deterministic debug capture for:
  - aircraft position / attitude
  - eye position / attitude
  - projected runway reference points
- Reconcile the WebGPU view matrix with original `BiVectorToHeadPitch` and
  the `DrawScreen()` projection flow.
- Verify the original 2x magnification behavior from `FLYBY.C`.
- Produce comparison screenshots for:
  - straight pass
  - roll
  - loop

**Validation command**

- `npm run capture:parity -- http://127.0.0.1:4180/ parity-shot-webgpu.png`

**Progress on 2026-03-22**

- Re-audited `FLYBY.C`, `i3dg.c`, `icalc.c`, `ifield.c`, and `i2dpict.c`
- Restored original `BiGetStdProjection` magnification and far-plane values
- Reapplied FLYBY's extra 2x magnification in the browser render path
- Switched the renderer to a positive-Z-forward camera/view/projection path to
  match Blue Impulse engine space directly
- Extended the debug HUD with deterministic object-in-world, object-in-camera,
  and projected screen-position diagnostics
- Reworked the browser debug HUD into an aeronautics-style control panel with
  aircraft/maneuver selectors, a randomize button, maneuver progress, and live
  telemetry visualizations for validation sessions
- Added browser-only debug camera trim controls for pan, tilt, and zoom so
  representative capture framing can be inspected without changing the
  underlying simulation camera logic
- Replaced SRF/PC2 triangle-fan tessellation with cached polygon triangulation
  so concave source faces no longer explode into stray panels on some aircraft

**Done when**

- framing is stable across repeated runs
- runway and terrain appear in the correct screen-space position
- the scene no longer looks flipped, skewed, or vertically misplaced

**Current status**

Phase 1 is no longer blocked on unknown camera math. The remaining work is
runtime comparison and any follow-up corrections needed after validating field,
terrain, and runway composition against the original.

**Next step**

Lock representative camera shots for straight, roll, loop, and runway-adjacent
passes, then tune any remaining eye-distance / framing differences before
declaring the scene composition finished.

---

### Phase 2: Restore Original Scene Draw Order

**Why second:** The original flyby depends on the airport composition as much
as the aircraft.

**Tasks**

- Split field rendering back into the original conceptual passes:
  - ground / sky backdrop
  - `PC2` field-map overlays
  - grid
  - `SRF` / `TER` / `PLT` scene objects
  - aircraft
  - smoke
- Apply the original `PC2` overmap pitch adjustment for field overlays.
- Keep `PLT` on the inserted scene-object path rather than the overmap path.
- Re-validate recursive `FLD` composition once the draw order is fixed.

**Status**

- structural split implemented
- original overmap pitch restored
- overlay pass moved ahead of inserted scene objects
- full-scene world ground slab removed, but a smaller near-field support plane
  remains as a browser readability adaptation
- visual parity still needs validation

**Done when**

- runway overlays and signal boards occupy the same layers as the original
- scene composition matches the original airport layout

---

### Phase 3: Fix Terrain Semantics

**Why third:** Terrain is present now, but correctness is not yet trustworthy.

**Tasks**

- Align terrain side-wall color ordering with original `BOT`, `RIG`, `LEF`,
  `TOP` semantics.
- Verify side-wall normals and winding against `iterrain.c`.
- Validate triangle diagonal choice and visibility against the original mesh.
- Compare terrain silhouette and wall colors against the original airport.

**Status**

- side-wall color index mapping corrected
- visual comparison still pending

**Done when**

- side walls use the correct color for each edge
- terrain does not float, invert, or cover the runway incorrectly

---

### Phase 4: Complete the PC2 Port

**Why fourth:** The default assets load, but the original PC2 feature set is
still larger than the current browser subset.

**Tasks**

- Audit `i2dpict.c` object types required for full compatibility.
- Extend parser/runtime support beyond polygon-only PC2 files.
- Preserve original visibility and depth behavior for PC2 insertion.
- Confirm the default bundled PC2 assets still render identically after the
  parser/runtime expansion.

**Status**

- parser/runtime now supports `PST`, `PLL`, `LSQ`, and `PLG`
- per-object `DST` visibility distance handling is implemented
- center-based PC2 visibility checks are implemented
- exact raster equivalence for line/point primitives still needs validation

**Done when**

- PC2 support is no longer limited to polygon blocks
- browser runtime behavior matches original PC2 rendering assumptions
- point and line primitives are visually acceptable against the original

---

### Phase 5: Port Field Runtime Semantics

**Why fifth:** Field parity is more than drawing objects.

**Tasks**

- Implement `RGN` runtime behavior or explicitly scope it out.
- Port field helpers needed for:
  - region lookup
  - elevation queries
  - collision-style field queries used by original field semantics
- Document which original field APIs are fully ported versus intentionally not
  exposed in the browser build.

**Status**

- recursive `RGN` lookup is now implemented and exposed to runtime diagnostics
- recursive terrain elevation lookup is now implemented and exposed to runtime diagnostics
- terrain eye/up vector query path is implemented
- exact collision semantics still need validation

**Done when**

- `RGN` is not parse-only dead data
- field behavior can be described accurately and defensibly

---

### Phase 6: Tighten Simulation and Smoke Fidelity

**Why sixth:** The current motion is close, but parity requires the remaining
small timing differences to be resolved.

**Tasks**

- Reconcile `PassedTime()` behavior with the original minimum timestep logic.
- Verify smoke append ordering, especially during turns.
- Validate all smoke modes:
  - ribbon
  - wire
  - trail
  - solid
- Test `flyby.inf` smoke mode variants manually in browser.

**Status**

- redraw cadence is now tied to simulation advances rather than every
  high-refresh `requestAnimationFrame` tick
- remaining work is slow-frame validation and smoke-density comparison

**Done when**

- timing no longer drifts on high-refresh displays
- smoke density and growth match original intent closely

---

### Phase 7: Restore Original Interaction Contract

**Why seventh:** This is lower priority than graphics parity, but still part of
original behavior.

**Tasks**

- Reintroduce `X` to stop the animation loop cleanly.
- Reintroduce help prompt behavior for non-special keys.
- Keep `T` as a browser-native capture path, but document it as an adaptation.

**Status**

- implemented
- only documentation/validation remains

**Done when**

- browser controls preserve the original screensaver flow where practical
- intentional deviations are explicit rather than accidental

---

### Phase 8: Final Parity Audit

**Tasks**

- Re-audit against:
  - `FLYBY2/flyby2/FLYBY.C`
  - `FLYBY2/flyby2/ASMOKE.C`
  - `FLYBY2/impulse/src/ifield.c`
  - `FLYBY2/impulse/src/iterrain.c`
  - `FLYBY2/impulse/src/i2dpict.c`
- Update spec docs with:
  - fully ported behavior
  - intentionally adapted browser behavior
  - any explicitly out-of-scope engine features

**Done when**

- the spec can truthfully say the port is complete

---

## Immediate Next Step

The next concrete implementation step should be:

**Validate the corrected camera/projection path against the original with
repeatable screenshots, then split `PC2` overmap rendering from `PLT` scene
insertion so airport composition can be compared with confidence.**
