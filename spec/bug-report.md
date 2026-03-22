# FLYBY2 WebGPU Port — Critical Bug Report

## Summary

The implementation has several **critical bugs** causing low FPS and erratic camera behavior.

---

## 🐛 BUG 1: Aircraft Not Rendering (Vertex Count Check)

**Location:** `renderer.ts:309-315`

**Problem:**
```typescript
if (aircraftModel.vertexCount > 0) {
    passEncoder.setVertexBuffer(0, aircraftModel.buffer);
    passEncoder.draw(aircraftModel.vertexCount);
}
```

**Root Cause:** The aircraft model has `vertexCount = 0` due to triangulation issues.

**Impact:** No aircraft is ever rendered, just empty scene with smoke.

**Fix Required:**
Check the triangulation in `renderer.ts`:
1. Verify SRF parsing produces valid polygons (3+ vertices)
2. Verify vertex count is calculated correctly
3. Add debug logging to see actual vertex counts

---

## 🐛 BUG 2: Low FPS - Too Many Per-Frame Allocations

**Location:** `renderer.ts:270-338` (render function)

**Problem:**
```typescript
render(...) {
  const commandEncoder = this.device.createCommandEncoder();
  const textureView = this.context.getCurrentTexture().createView();  // NEW OBJECT

  const passEncoder = commandEncoder.beginRenderPass({  // NEW OBJECT
    colorAttachments: [{
      view: textureView,  // NEW OBJECT
      clearValue: { ... },
      ...
    }],
    ...
  });  // NEW OBJECT
```

**Impact:** Every frame creates:
- New `commandEncoder` object
- New `textureView` object
- New `passEncoder` object

**Fix Required:**
Cache the render pass objects as class properties:
```typescript
export class Renderer {
  private commandEncoder!: GPUCommandEncoder;  // Reuse
  private passEncoder!: GPURenderPass;           // Reuse

  // Create once in init()
  this.commandEncoder = this.device.createCommandEncoder();
  this.passEncoder = commandEncoder.beginRenderPass(...);
```

---

## 🐛 BUG 3: Camera Not Tracking - Missing Camera Updates

**Location:** `renderer.ts:render()` function

**Problem:** The camera `eye` parameter is passed but never updated during aircraft movement.

Looking at `drawScreen()` in `flight.ts`:
```typescript
function drawScreen(...): void {
  const vec = subV3(obj.p, eye.p);
  vectorToHeadPitch(eye.a, vec);  // Updates eye.a

  // Generate smoke geometry
  const smokeVerts = drawSmoke(state.smokeClass, state.smokeInst, state.currentTime, eye);

  renderer.render(eye, ..., obj, ...);  // eye is passed in
}
```

But `eye.p` (camera position) is NEVER updated between frames!

**Root Cause:** The `mainLoop()` in `flight.ts` doesn't update camera position. Camera was set once in `flyByMain()` at initialization, then never updated.

**Expected Behavior:** Camera should smoothly follow aircraft during maneuvers.

**Fix Required:**
The camera should be updated to look at the aircraft every frame. In the original C code from `spec/07-flight.md`, the camera updates via `vectorToHeadPitch()` in each frame.

The issue is that `eye` needs to track the aircraft, not just maintain a fixed position.

---

## 🐛 BUG 4: Camera Just "Moving Around"

**Possible Cause:** If camera is updated (see BUG 3) but aircraft isn't moving (BUG 1), then the camera appears to be moving around randomly.

This is a cascade effect:
1. Aircraft doesn't render (BUG 1)
2. Camera tries to track invisible aircraft
3. Camera appears to move randomly

---

## 🐛 BUG 5: Math Errors in renderer.ts

**Location:** `renderer.ts:293-309` (buildSrfGpuBuffer)

**Problem:**
```typescript
buildSrfGpuBuffer(model: SrfModel): GpuSrf {
  const verts: number[] = [];
  for (const plg of model.polygons) {
    triangulateSrfPolygon(verts, plg, model.vertices);  // Missing 3rd parameter
  }
  ...
}
```

But the function signature is:
```typescript
function triangulateSrfPolygon(
  verts: number[],
  plg: SrfPolygon,
  vertices: SrfVertex[],  // But call doesn't pass this!
): void {
  const nVt = plg.nVt;
  ...
}
```

**Impact:** Compile-time error preventing aircraft models from being built.

**Fix Required:**
Add the missing `vertices` parameter:
```typescript
function triangulateSrfPolygon(
  verts: number[],
  plg: SrfPolygon,
  vertices: SrfVertex[],  // ADD THIS
): void {
```

---

## 🐛 BUG 6: Incorrect Trigonometry in flight.ts

**Location:** `flight.ts:240-247` (flyByMain)

**Problem:**
```typescript
const obj: PosAtt = {
  p: vec3(
    -500.0 * sin16(dir),
    altitude,
    500.0 * cos16(dir),  // ERROR: should be +
  ),
  a: { h: dir + 0x8000, p: 0, b: 0 },
};
```

The `z` coordinate calculation `500.0 * cos16(dir)` is missing the `+` operator for the third component.

**Impact:** Aircraft start at incorrect Z position.

**Fix Required:**
Change line 243:
```typescript
const obj: PosAtt = {
  p: vec3(
    -500.0 * sin16(dir),
    altitude,
    500.0 * cos16(dir),  // Add missing +
  ),
  ...
};
```

---

## 🐛 BUG 7: Smoke Geometry Function Signature Mismatch

**Location:** `renderer.ts:line 294` vs `renderer.ts` implementation

The `render()` function calls:
```typescript
renderer.render(
  eye,
  skyColor,
  _groundColor,
  srfModel,
  aircraftModel,
  aircraftPos,
  smokeVerts: Float32Array,
  vaporVerts: Float32Array,
);
```

But `drawSmoke()` returns `Float32Array`, and the parameter name is `ctim` (current time):
```typescript
export function drawSmoke(
  cla: SmokeClass, inst: SmokeInst, ctim: number, eye: PosAtt,
): Float32Array {  // Note: ctim parameter name
```

**Impact:** May cause type errors or incorrect parameter passing.

---

## 🐛 BUG 8: Main Loop Structure

**Location:** `flight.ts:232-267`

**Problem:**
```typescript
function flyByMain(...): void {
  // ...
  function mainLoop(): void {
    if (state.quitFlag) return;
    // ...
    flyByShow(show, obj, eye, state, ...);
    if (!state.quitFlag) {
      requestAnimationFrame(mainLoop);
    }
  }
  requestAnimationFrame(mainLoop);  // Called ONCE
}
```

**Issue:** The `requestAnimationFrame(mainLoop)` at the end is called ONCE, but `mainLoop` itself also calls `requestAnimationFrame` recursively. This creates an animation loop, but after one maneuver completes, a NEW aircraft and maneuver are selected.

This might be intentional (show different aircraft in sequence), but it's not clear if this matches the original behavior.

**Expected Behavior:** Original `FlyByMain` should loop infinitely, selecting random aircraft and maneuvers.

---

## Priority Fixes

### 🔴 CRITICAL (Prevents Rendering)

1. **Fix BUG 1** - Aircraft vertex count zero
2. **Fix BUG 5** - Math triangulation signature
3. **Fix BUG 6** - Verify camera is tracking aircraft correctly

### 🟡 HIGH (Performance)

4. **Fix BUG 2** - Reuse render pass objects

### 🟢 MEDIUM (Correctness)

5. **Fix BUG 4** - Update camera position every frame
6. **Fix BUG 3** - Verify smoke parameter naming

### ⚪ LOW (Potential)

7. **Review BUG 7** - Main loop structure behavior

---

## Immediate Action Plan

1. **Check browser console** for any runtime errors
2. **Add debug logging** to renderer:
   ```typescript
   console.log('Rendering aircraft:', aircraftModel.vertexCount);
   console.log('Camera eye:', eye.p);
   ```
3. **Verify aircraft models are loading** by checking console output
4. **Fix triangulation signature** in renderer.ts line 204
5. **Fix missing + operator** in flight.ts line 243
6. **Test with smoke disabled** to isolate aircraft rendering issue

---

## Additional Investigation Needed

**Check math.ts for these functions:**
- [ ] `vectorToAngle()` - 2D vector to angle conversion
- [ ] `buildModelMatrix()` - Build model matrix from PosAtt
- [ ] Are all rotation matrices correct?

**Check smoke.ts for:**
- [ ] Are all 4 smoke types (Ribbon, Wire, Trail, Solid) implemented?
- [ ] Does `drawSmoke` return geometry for all types?

**Check flight.ts for:**
- [ ] Does `flyByMain` loop correctly?
- [ ] Are all 6 maneuvers calling `drawScreen`?
- [ ] Is aircraft position being updated in maneuvers?
