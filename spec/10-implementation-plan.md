# Implementation Plan — Parity Track and Browser-Max Track

## Goal

Finish the port in two explicit tracks:

1. a source-auditable parity tier
2. a browser showcase tier that deliberately goes beyond the original

The current tree already builds and renders, so the next work should focus on
restoring an honest baseline and removing the biggest runtime bottlenecks before
leaning further into graphics spectacle.

The codebase now also carries an explicit browser-only vehicle-sim foundation
layer:

- `scriptedFlyby` keeps the original screensaver-oriented runtime
- `freeFlight` adds a controllable aircraft sandbox
- `drive` adds a controllable car sandbox

These modes are adaptation work, not parity claims. They exist to let the port
grow into a browser simulation core while the default path remains accountable
to `FLYBY2`.

## Current Assessment

### Healthy Foundations

- maneuver scripts are still close to `FLYBY.C`
- parsers for SRF, FLD, PC2, and TER are in good shape
- recursive field traversal and runtime helpers are present
- the browser environment stack is coherent enough to support multiple map
  variants today
- raw and improved runway captures now show the authored PC2 markings again
  after restoring painter-ordered overlay drawing
- the browser showcase track now includes a distinct `san-francisco` variant
  that rides on `downtown.fld` with authored landmarks and sharper urban
  ground breakup
- the renderer now uploads static field geometry once instead of rebuilding it
  every frame
- gameplay modes now use a fixed-step vehicle/camera/input runtime separate
  from the scripted screensaver loop

### Immediate Problems

- the renderer is CPU-bound because it rebuilds most geometry every frame
- live browser recapture is still needed after the dynamic-actor uniform fix
- low-FPS cadence still differs from the original draw-per-step flow

## Phase 0: Restore an Honest Baseline

**Why first:** Raw parity is available again, so the remaining work can focus on
locking it down and keeping the showcase variants separate.

**Tasks**

- Make `airport-improved`, `airport-night`, and `downtown` explicitly opt-in.
- Add deterministic capture URLs that always target the raw parity tier.
- Keep a raw lighting mode that uses field sky/ground and the original
  eye-relative light intent as closely as the browser path allows.

**Done when**

- one runtime mode matches the original asset set as closely as possible
- browser-only variants remain available but are clearly separate
- screensaver mode inventory is source-faithful

## Phase 1: Close the Remaining Behavior Gaps

**Why second:** Once the baseline is honest, the remaining differences can be
measured instead of guessed.

**Tasks**

- Validate camera framing against representative original passes:
  - straight
  - roll
  - loop
  - low runway pass
- Reconcile low-FPS draw cadence with the original `PassedTime()` behavior.
- Keep `PC2` overlay painter ordering locked to `BiOvwPc2` while validating
  `PLT` insertion ordering with raw airport captures.
- Keep aircraft insertion ahead of smoke so ribbon/vapor occlusion follows the
  original `FLYBY.C` draw order.
- Validate terrain side walls, diagonals, and placement against `iterrain.c`.
- Decide whether smoke color transition semantics should follow the literal
  checked-in `ASMOKE.C` branch or stay as the safer browser interpretation.
- Tighten SRF collision semantics beyond bounding-box overlap if parity work
  requires it.

**Done when**

- parity claims are based on raw captures, not augmented scenes
- browser-only debug cameras stay clearly labeled as non-parity inspection aids
- camera, terrain, smoke, and draw ordering are source-audited

## Phase 2: Remove the Biggest CPU Bottlenecks

**Why third:** The current renderer is leaving a lot of performance on the CPU
and paying for work it already knows how to avoid.

**Tasks**

- Stop rebuilding static field geometry every frame.
- Keep aircraft meshes in model space and draw them with model matrices or
  instances instead of CPU-regenerating world-space vertices.
- Keep dynamic smoke / vapor uploads on distinct GPU buffers and continue
  reducing per-frame buffer churn.
- Reuse typed arrays or staging arenas for dynamic geometry.
- Add viewport / bounding-box rejection before tessellating off-screen SRF and
  terrain content.
- Collapse redundant per-frame uniform uploads.
- Reduce per-frame debug HUD DOM churn during normal playback.

**Done when**

- static field uploads happen at load time or on coarse visibility changes
- aircraft rendering uses the prebuilt GPU buffers already created at startup
- frame time is dominated by real rendering work instead of CPU mesh rebuilds

## Phase 3: Lock the Parity Tier

**Why fourth:** Before pushing graphics hard, we need a browser tier that still
looks recognizably like the original screensaver.

**Tasks**

- Keep a source-faithful visual preset with:
  - raw airport composition
  - field-driven sky / ground colors
  - restrained smoke opacity
  - no browser-only scene augmentation
- Document every browser adaptation separately from this tier.
- Capture parity reference frames and keep them stable as regression targets.

**Done when**

- the repo has a defendable parity tier
- later rendering work can be compared against that tier instead of replacing it

## Phase 4: Strengthen the Browser Showcase Tier

**Why fifth:** Once the parity tier is protected, the browser path can be
allowed to look better on purpose.

**Tasks**

- Keep the environment-driven shader path in the browser-only track:
  - procedural sky gradients and cloud bands
  - restrained night-sky augmentations such as point-sampled stars and subtle aurora ribbons
  - keep `airport-night` runway paint subdued enough that markings read as paint, not lighting
  - let `airport-night` use denser multicolor approach / runway / taxiway lighting as showcase-only browser adaptation
  - fog / haze
  - hemisphere lighting
  - directional key light control
  - emissive runway / apron / city accents
- Maintain dedicated sky and support-ground passes.
- Keep `airport-improved` as the richest airport showcase variant.
- Keep showcase airport circulation readable from top-down:
  - perimeter/service roads instead of runway-crossing road grids
  - suppress the tiny raw `sample.ter` patch when it reads as a stray square
- Add higher-quality contact shadows for large structures.
- Add procedural runway and terrain material breakup that scales with quality.
- Introduce quality tiers so parity mode stays cheap on integrated GPUs while
  richer variants can stretch on faster hardware.

**Done when**

- enhanced rendering is coherent, optional, and performant
- the parity tier still exists and still tells the truth

## Phase 5: Browser-Max Graphics Track

This is the deliberate “push the browser hard” track. It should start only
after Phases 0-3 are stable.

### Visual Ambition

- volumetric-looking cloud layers in the sky pass
- runway, apron, and city-light bloom in night scenes
- temporal AA or SMAA-style edge cleanup
- half-resolution atmospheric scattering / haze resolve
- denser smoke shading with soft self-shadowing approximation
- richer terrain detail and runway material response at close range

### GPU Ambition

- GPU instancing for repeated airport props, markers, and city lights
- compact visible-object lists or indirect draws for larger scenes
- compute-assisted smoke ribbon generation if browser support is good enough
- dynamic resolution or multi-resolution rendering for expensive scenes
- optional shadow atlases or cascaded shadows for showcase variants

### Scene Ambition

- larger city / downtown fields driven by the same runtime
- richer night-light passes and window grids
- optional weather presets built on the environment system
- high-end replay / capture presets for deterministic showcase renders

**Guardrail**

Every item in this phase must remain clearly labeled as browser enhancement, not
backfilled into parity claims.

Current downtown status: the browser-authored variant now has a more Manhattan /
Times Square-style core with fuller facade window coverage and a protected
fly-through corridor, but the scene should still be treated as showcase work
that needs continued capture review rather than a settled parity target.

## Verification Loop

After each non-trivial phase:

1. Run `bun run build`.
2. Run `bun run dev`.
3. Capture deterministic frames with `bun run capture:parity -- <url> <png>`.
4. Update `spec/validation-report.md` with the actual result.

## Immediate Next Steps

1. Add a raw no-augmentation airport mode for honest parity capture.
2. Re-run deterministic signal / loop captures after the runway-overlay
   painter-order fix.
3. Move aircraft and static field geometry out of the per-frame rebuild path.
4. Add earlier viewport/bounding-box rejection before CPU tessellation.

Those four steps unlock both trustworthy parity work and the browser-max
rendering path you want.
