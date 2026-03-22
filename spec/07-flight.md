# Flight Logic Specification

Ported from `FLYBY.C` (562 lines).

## Audit Update (2026-03-22)

The checked-out runtime keeps the original maneuver programs, but it now also
includes browser-only control and capture features:

- deterministic query-parameter scenarios (`runway`, `signal`, `smoke_*`)
- seeded runtime selection
- a debug HUD with maneuver seeking, camera trim, and selectable debug views
  (`Director`, `Third Person`, `Top Down Follow`, `Top Down Static`)
- map switching between raw browser variants

Timing status:

- simulation still advances in fixed `0.02` second steps
- under slow browser frames, the loop still draws once and then consumes
  multiple pending simulation steps
- that keeps high-refresh displays from running too fast, but it is still only
  partial parity with the original draw-per-step cadence

## State Machine

```
FlyByMain (infinite loop)
  │
  ├── Pick random aircraft (0 to nAir-1)
  ├── Pick random direction (0 to 0xFFFF)
  ├── Set starting position:
  │     obj.p.x = -500 * sin(dir)
  │     obj.p.y = altitude (default 120)
  │     obj.p.z = 500 * cos(dir)
  │     obj.a.h = dir + 0x8000 (face opposite direction)
  │     obj.a.p = 0
  │     obj.a.b = 0
  ├── Set camera position:
  │     eye.p.x = -distance * sin(dir2)     [distance = rand 50-200]
  │     eye.p.y = altitude + rand(-25, +25)
  │     eye.p.z = distance * cos(dir2)
  │     eye.a.b = 0
  │
  └── FlyByShow → Pick random maneuver (0-5):
        0: FlyByStraight
        1: FlyByRoll
        2: FlyByLoop
        3: FlyByClimb
        4: FlyByEight
        5: FlyBy360
```

## Maneuvers

All maneuvers use the same pattern: a sequence of `FlyByAhead`, `FlyByPitch`, `FlyByBank`, `FlyByTurn`.

### FlyByStraight (FLYBY.C:300-304)
```
Ahead(1000)
```

### FlyByRoll (FLYBY.C:306-312)
```
Ahead(300)
Bank(65536, 1)   // Full 360° barrel roll
Ahead(300)
```

### FlyByLoop (FLYBY.C:314-320)
```
Ahead(500)
Pitch(65536, 1)  // Full 360° loop
Ahead(500)
```

### FlyByClimb (FLYBY.C:322-328)
```
Ahead(450)
Pitch(12800, 1)  // ~70° pitch up
Ahead(500)
```

### FlyByEight (FLYBY.C:330-344)
```
Ahead(400)
Pitch(0x4000, 1)    // 90° pitch up
Ahead(50)
Pitch(0x6000, 1)    // 135° pitch (over the top)
Bank(0x18000, 1)    // 337.5° bank (roll upside-down)
Pitch(0x6000, 1)    // 135° pitch
Ahead(50)
Pitch(0x6000, 1)    // 135° pitch (over the top again)
Bank(0x18000, 1)    // 337.5° bank
Pitch(0x2000, 1)    // 45° pitch (level out)
Ahead(400)
```

### FlyBy360 (FLYBY.C:346-354)
```
Ahead(450)
Bank(12800, 1)      // ~70° bank
Turn(65536, 1)      // Full 360° turn
Bank(12800, -1)     // Unbank
Ahead(500)
```

## Primitive Movement Functions

### FlyByAhead (FLYBY.C:358-370)
```typescript
function flyByAhead(show, obj, eye, dist: number): void {
  while (dist > 0) {
    drawScreen(show, obj, eye);
    const t = passedTime();
    currentTime += t;
    const vel = t * 100.0;  // 100 units/sec
    proceed(obj, vel);       // Move forward in local Z
    dist -= vel;
  }
}
```

### FlyByPitch (FLYBY.C:372-391)
```typescript
function flyByPitch(show, obj, eye, ctr: number, sgn: number): void {
  beginAppendSmokeNode(smokeInst);
  beginAppendSmokeNode(vaporInst);
  while (ctr > 0) {
    drawScreen(show, obj, eye);
    const t = passedTime();
    currentTime += t;
    const vel = t * 100.0;
    proceed(obj, vel);
    pitchUp(obj.a, obj.a, sgn * (t * 8192), 0);  // Rate: 8192 units/sec
    ctr -= (t * 8192);
    appendSmokeNode(smokeInst, obj, currentTime);
    appendSmokeNode(vaporInst, obj, currentTime);
  }
  endAppendSmokeNode(smokeInst);
  endAppendSmokeNode(vaporInst);
}
```

### FlyByBank (FLYBY.C:393-409)
```typescript
function flyByBank(show, obj, eye, ctr: number, sgn: number): void {
  beginAppendSmokeNode(vaporInst);  // Vapor only during bank
  while (ctr > 0) {
    drawScreen(show, obj, eye);
    const t = passedTime();
    currentTime += t;
    const vel = t * 100.0;
    proceed(obj, vel);
    obj.a.b += sgn * (t * 32768);   // Rate: 32768 units/sec (faster than pitch)
    ctr -= (t * 32768);
    appendSmokeNode(vaporInst, obj, currentTime);
  }
  endAppendSmokeNode(vaporInst);
}
```

### FlyByTurn (FLYBY.C:411-430)
```typescript
function flyByTurn(show, obj, eye, ctr: number, sgn: number): void {
  beginAppendSmokeNode(smokeInst);
  beginAppendSmokeNode(vaporInst);
  while (ctr > 0) {
    appendSmokeNode(smokeInst, obj, currentTime);  // Append BEFORE draw (unlike others)
    appendSmokeNode(vaporInst, obj, currentTime);
    drawScreen(show, obj, eye);
    const t = passedTime();
    currentTime += t;
    const vel = t * 100.0;
    proceed(obj, vel);
    obj.a.h += sgn * (t * 8192);   // Rate: 8192 units/sec
    ctr -= (t * 8192);
  }
  endAppendSmokeNode(smokeInst);
  endAppendSmokeNode(vaporInst);
}
```

### Proceed (FLYBY.C:555-561)
```typescript
function proceed(obj: PosAtt, dist: number): void {
  // Move forward in local Z direction
  let vec = { x: 0, y: 0, z: dist };
  rotLtoG(vec, vec, obj.a);  // Rotate local forward vector to global
  obj.p.x += vec.x;
  obj.p.y += vec.y;
  obj.p.z += vec.z;
}
```

## Camera System (FLYBY.C:483-488)

```typescript
function updateCamera(eye: PosAtt, obj: PosAtt): void {
  // Camera always looks at aircraft
  const vec = subV3(obj.p, eye.p);
  vectorToHeadPitch(eye.a, vec);  // Derive heading/pitch from direction to aircraft
  // eye.a.b remains unchanged (no roll on camera)
}
```

Browser adaptation note:

- the parity target remains the default `Director` camera above
- `Third Person`, `Top Down Follow`, and `Top Down Static` are debug-only
  browser views layered in the render path for inspection; they are not claims
  about the original `FLYBY.C` camera behavior

## Frame Timing (FLYBY.C:432-450)

Original uses busy-wait loop with `clock()`:

```typescript
function passedTime(): number {
  // Returns time since last call, minimum 0.02 seconds (50fps cap)
  // Multiplied by TimeScale (default 1.0)
  const now = performance.now();
  let dt = (now - lastTime) / 1000.0;
  while (dt < 0.02) {
    // In original: busy-wait. In web: we use requestAnimationFrame timing instead
    dt = 0.02;  // Clamp
  }
  lastTime = now;
  return dt * timeScale;
}
```

**Web adaptation**: Accumulate `requestAnimationFrame` time and only redraw once
at least one `0.02` second simulation step is due. This keeps browser pacing
closer to the original wait-then-advance loop without letting high-refresh
displays present extra in-between redraws.

## Input Handling

```typescript
// FLYBY.C:463-476
function handleInput(key: string): void {
  switch (key) {
    case 'x': case 'X':
      quitFlag = true;
      break;
    case 't': case 'T':
      // Original: render to TIFF file. Skip in web.
      break;
    default:
      helpCount = 30;  // Show help text for 30 frames
      break;
  }
}
```

## Quit

`QuitFlag` checked in all maneuver loops. When set (X key pressed), loops exit cleanly.
Main loop in `FlyByMain` also checks it and exits.
