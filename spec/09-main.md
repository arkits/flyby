# Main Application Entry Point Specification

Ported from `FLYBY.C` `main()` (lines 47-82) and `FlyByMain()` (lines 202-264).

## Entry Flow

```typescript
// main.ts

async function main(): Promise<void> {
  // 1. Create fullscreen canvas
  const canvas = createCanvas();

  // 2. Init WebGPU
  const renderer = new Renderer();
  await renderer.init(canvas);

  // 3. Load configuration
  const config = await loadConfig('/data/flyby.inf');

  // 4. Load all aircraft models
  const aircraft: SrfModel[] = [];
  for (const fn of config.aircraft) {
    aircraft.push(await loadSrf(`/data/${fn}`));
  }
  // Pre-build GPU buffers for all models
  const gpuModels = aircraft.map(a => renderer.buildSrfGpuBuffer(a));

  // 5. Load field/scene
  const field = await loadField(`/data/${config.fieldFile}`);

  // 6. Init smoke system
  const smokeClass = initSmokeClass(config.smokeType);
  const vaporClass = initVaporClass();
  const smokeInst = initSmokeInstance(1000, 100);
  const vaporInst = initSmokeInstance(100, 10);

  // 7. Seed random
  // Math.random() used throughout

  // 8. Start animation loop
  const state = {
    quitFlag: false,
    helpCount: 0,
    currentTime: 0,
    aircraft,
    gpuModels,
    field,
    smokeClass,
    vaporClass,
    smokeInst,
    vaporInst,
  };

  registerInputHandler(state);
  startMainLoop(state, renderer);
}
```

## Configuration Loading

```typescript
// flyby.inf format:
// FIELD airport.fld
// RIBBONSMOKE
// ALTITUDE 120.0
// AIRCRAFT a6.srf
// AIRCRAFT f15.srf
// ...

interface Config {
  fieldFile: string;
  aircraft: string[];
  altitude: number;
  smokeType: number;  // ARS_RIBBONSMOKE, etc.
}

async function loadConfig(url: string): Promise<Config>
```

## Main Loop

```typescript
function startMainLoop(state: AppState, renderer: Renderer): void {
  let lastTimestamp = 0;

  function frame(timestamp: number): void {
    if (state.quitFlag) return;

    // Calculate delta time
    const dt = Math.max((timestamp - lastTimestamp) / 1000, 0.001);
    lastTimestamp = timestamp;

    // Run one frame of the current maneuver
    // (maneuvers call drawScreen internally, which calls renderer.render)
    tickManeuver(state, renderer, dt);

    requestAnimationFrame(frame);
  }

  // Outer loop: pick new aircraft + maneuver when current one finishes
  flyByMain(state, renderer);
  requestAnimationFrame(frame);
}
```

## Draw Screen (per frame)

Ported from `DrawScreen` (FLYBY.C:452-553):

```typescript
function drawScreen(
  show: ShowObj, obj: PosAtt, eye: PosAtt,
  state: AppState, renderer: Renderer
): void {
  const prj = getStdProjection(window.innerWidth, window.innerHeight);
  prj.magx *= 2.0;  // Match original 2x magnification
  prj.magy *= 2.0;

  // Camera looks at aircraft
  const vec = subV3(obj.p, eye.p);
  vectorToHeadPitch(eye.a, vec);

  // Light above camera
  const light = { x: eye.p.x, y: eye.p.y + 1000, z: eye.p.z };

  // Begin rendering
  renderer.beginFrame(state.field.sky);

  // Sky and ground
  renderer.drawGroundSky(state.field.gnd, state.field.sky);

  // Grid lines (blue reference grid on ground)
  renderer.drawGridLines();

  // Field objects
  renderer.drawField(state.field, BiOrgPA);

  // Aircraft model
  renderer.drawSrfModel(state.gpuModels[show.aircraft], obj);

  // Smoke trails
  const smokeVerts = drawSmoke(
    state.smokeClass, state.smokeInst, state.currentTime, eye
  );
  const vaporVerts = drawSmoke(
    state.vaporClass, state.vaporInst, state.currentTime, eye
  );
  renderer.drawSmokeGeometry(smokeVerts);
  renderer.drawSmokeGeometry(vaporVerts);

  // Help text
  if (state.helpCount > 0) {
    renderer.drawText("PRESS X TO EXIT", 48, 48, { r: 1, g: 1, b: 1 });
    state.helpCount--;
  }

  renderer.endFrame();
}
```

## Input Handler

```typescript
function registerInputHandler(state: AppState): void {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'x' || e.key === 'X') {
      state.quitFlag = true;
    } else {
      state.helpCount = 30;
    }
  });
}
```

## CSS

```css
body {
  margin: 0;
  overflow: hidden;
  background: #000;
}

canvas {
  display: block;
  width: 100vw;
  height: 100vh;
}
```

## index.html

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FLYBY2 - Military Aircraft Flyby</title>
  <link rel="stylesheet" href="/src/style.css" />
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

## Error Handling

- WebGPU not available: show fallback message "WebGPU not supported in this browser"
- Asset fetch failure: log error, continue with available assets
- SRF parse failure: skip that aircraft, log warning

## Performance Considerations

- SRF models are static geometry — build vertex buffers once at load time
- Smoke geometry is dynamic — rebuild each frame (small buffer, <1000 nodes)
- Grid lines are static — build once at load time
- Sky/ground quad is static — build once
- Field objects: build once at load time (they don't move)
- Aircraft model: transform via model matrix uniform (no buffer rebuild)
- Smoke: requires buffer rebuild since geometry changes every frame

## Asset Loading Strategy

```typescript
// Parallel fetch all assets
const responses = await Promise.all([
  fetch('/data/flyby.inf'),
  fetch('/data/airport.fld'),
  fetch('/data/runway.pc2'),
  fetch('/data/signal.pc2'),
  fetch('/data/sample.ter'),
  fetch('/data/hanger.srf'),
  fetch('/data/tower.srf'),
  ...aircraftFilenames.map(fn => fetch(`/data/${fn}`)),
]);
```

All data files are small (< 50KB each, most < 10KB). Total asset size is approximately 500KB.
