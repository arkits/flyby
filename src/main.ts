// FLYBY2 — Main Entry Point

import './style.css';
import type {
  AppMode, Config, AppState, SrfModel, GpuSrf, GpuField, RuntimeOptions, FlybyMode, ManeuverKey, CaptureScenario, MapVariant,
} from './types';
import {
  ARS_SOLIDSMOKE, ARS_RIBBONSMOKE, ARS_TRAILSMOKE, ARS_WIRESMOKE,
} from './types';
import { loadSrf } from './srf-parser';
import { loadField } from './fld-parser';
import { enhanceFieldForMap, resolveFieldFileForMap } from './airport-enhancement';
import { resolveMapEnvironment } from './environment';
import { Renderer } from './renderer';
import { GameRuntime } from './game-runtime';
import { initSmokeClass, initSmokeInstance } from './smoke';
import { registerInputHandler } from './input';
import { flyByMain } from './flight';

const SCREENSAVER_AIRCRAFT = [
  'a6.srf',
  'angels.srf',
  'av8b.srf',
  'ea6b.srf',
  'f1.srf',
  'f117a.srf',
  'f14sprd.srf',
  'f14swbk.srf',
  'f15.srf',
  'f16.srf',
  'f18.srf',
  'f86blue.srf',
  'mig21.srf',
  'mig23spd.srf',
  'mig23wbk.srf',
  'mrg2000.srf',
  'su27.srf',
  't2blue.srf',
  't400.srf',
  't4blue.srf',
  'thunder.srf',
  'viggen.srf',
];

function parseMode(value: string | null): FlybyMode {
  return value === 'flyby2_s' ? 'flyby2_s' : 'flyby2';
}

function parseAppMode(value: string | null): AppMode {
  switch (value) {
    case 'freeflight':
    case 'free-flight':
    case 'flight':
      return 'freeFlight';
    case 'drive':
    case 'car':
      return 'drive';
    default:
      return 'scriptedFlyby';
  }
}

function parseMapVariant(value: string | null): MapVariant {
  switch (value) {
    case 'airport':
    case 'raw-airport':
      return 'airport';
    case 'airport-improved':
    case 'airport_improved':
    case 'showcase':
      return 'airport-improved';
    case 'airport-night':
    case 'night':
      return 'airport-night';
    case 'downtown':
    case 'city':
      return 'downtown';
    default:
      return 'airport-improved';
  }
}

function parseManeuver(value: string | null): ManeuverKey | null {
  switch (value) {
    case 'straight':
    case 'roll':
    case 'loop':
    case 'climb':
    case 'eight':
    case 'turn360':
      return value;
    default:
      return null;
  }
}

function parseSmokeOverride(value: string | null): number | null {
  switch (value) {
    case 'ribbon': return ARS_RIBBONSMOKE;
    case 'wire': return ARS_WIRESMOKE;
    case 'trail': return ARS_TRAILSMOKE;
    case 'solid': return ARS_SOLIDSMOKE;
    default: return null;
  }
}

function parseCaptureScenario(value: string | null): CaptureScenario | null {
  switch (value) {
    case 'straight':
    case 'roll':
    case 'loop':
    case 'runway':
    case 'signal':
    case 'smoke_ribbon':
    case 'smoke_wire':
    case 'smoke_trail':
    case 'smoke_solid':
      return value;
    default:
      return null;
  }
}

function parseNumber(value: string | null): number | null {
  if (value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getRuntimeOptions(): RuntimeOptions {
  const params = new URLSearchParams(window.location.search);
  return {
    appMode: parseAppMode(params.get('app')),
    mode: parseMode(params.get('mode')),
    mapVariant: parseMapVariant(params.get('map')),
    seed: parseNumber(params.get('seed')),
    scenario: parseCaptureScenario(params.get('scenario')),
    forcedAircraftIndex: parseNumber(params.get('aircraft')),
    forcedManeuver: parseManeuver(params.get('maneuver')),
    smokeOverride: parseSmokeOverride(params.get('smoke')),
  };
}

function createRandom(seed: number | null): () => number {
  if (seed === null) {
    return () => Math.random();
  }

  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function scenarioSmokeType(scenario: RuntimeOptions['scenario']): number | null {
  switch (scenario) {
    case 'smoke_ribbon': return ARS_RIBBONSMOKE;
    case 'smoke_wire': return ARS_WIRESMOKE;
    case 'smoke_trail': return ARS_TRAILSMOKE;
    case 'smoke_solid': return ARS_SOLIDSMOKE;
    default: return null;
  }
}

interface FaultPresentation {
  code: string;
  title: string;
  message: string;
  hint: string;
  stage: string;
  diagnostics: string;
}

interface FaultOverlayController {
  show(presentation: FaultPresentation): void;
  hide(): void;
}

function errorSummary(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    return message.length > 0 ? message : error.name;
  }
  if (typeof error === 'string') {
    const message = error.trim();
    return message.length > 0 ? message : 'Unknown failure';
  }
  return 'Unknown failure';
}

function appendErrorDiagnostics(lines: string[], error: unknown, depth = 0): void {
  const indent = '  '.repeat(depth);
  if (error instanceof Error) {
    lines.push(`${indent}${error.name}: ${error.message}`);
    if (error.stack) {
      lines.push(error.stack);
    }
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause !== undefined) {
      lines.push(`${indent}Caused by:`);
      appendErrorDiagnostics(lines, cause, depth + 1);
    }
    return;
  }
  if (typeof error === 'string') {
    lines.push(`${indent}${error}`);
    return;
  }
  try {
    lines.push(`${indent}${JSON.stringify(error, null, 2)}`);
  } catch {
    lines.push(`${indent}${String(error)}`);
  }
}

function buildDiagnostics(stage: string, runtime: RuntimeOptions, error: unknown): string {
  const lines = [
    `Stage: ${stage}`,
    `Mode: ${runtime.mode}`,
    `App mode: ${runtime.appMode}`,
    `Map: ${runtime.mapVariant}`,
    `URL: ${window.location.href}`,
    `Timestamp: ${new Date().toLocaleString()}`,
    '',
    'Error',
  ];
  appendErrorDiagnostics(lines, error);
  return lines.join('\n');
}

function detectFaultCode(error: unknown): string {
  const message = errorSummary(error).toLowerCase();
  if (message.includes('webgpu')) return 'WEBGPU_OFFLINE';
  if (message.includes('failed to fetch')) return 'ASSET_FETCH_FAILURE';
  if (message.includes('field gpu')) return 'FIELD_BUFFER_FAULT';
  if (message.includes('device lost')) return 'GPU_DEVICE_LOST';
  return 'RENDER_BOOT_FAILURE';
}

function buildFaultMessage(stage: string, error: unknown): string {
  if (stage === 'Checking browser WebGPU support') {
    return 'This browser session cannot start the WebGPU renderer, so the simulation never reached first frame.';
  }
  return `Startup stopped during ${stage.toLowerCase()}. ${errorSummary(error)}`;
}

function buildFaultHint(code: string): string {
  switch (code) {
    case 'WEBGPU_OFFLINE':
      return 'Use a WebGPU-capable Chromium build, then reload this page.';
    case 'ASSET_FETCH_FAILURE':
      return 'The renderer needs its data files online before it can assemble the field.';
    case 'FIELD_BUFFER_FAULT':
      return 'The field parser finished, but scene geometry assembly hit malformed data and bailed out.';
    case 'GPU_DEVICE_LOST':
      return 'A reload usually reacquires the adapter and rebuilds the pipelines cleanly.';
    default:
      return 'Reload to retry boot, then use diagnostics if the fault repeats.';
  }
}

function buildFaultPresentation(stage: string, runtime: RuntimeOptions, error: unknown): FaultPresentation {
  const code = detectFaultCode(error);
  return {
    code,
    title: code === 'WEBGPU_OFFLINE' ? 'WebGPU Renderer Offline' : 'Flight Deck Fault',
    message: buildFaultMessage(stage, error),
    hint: buildFaultHint(code),
    stage,
    diagnostics: buildDiagnostics(stage, runtime, error),
  };
}

function createFaultOverlay(shell: HTMLElement, host: HTMLElement, runtime: RuntimeOptions): FaultOverlayController {
  const overlay = document.createElement('aside');
  overlay.className = 'fault-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="fault-card" role="alert" aria-live="assertive">
      <div class="fault-card__rail"></div>
      <div class="fault-card__masthead">
        <div>
          <div class="fault-card__eyebrow">Flyby Control Deck</div>
          <h1 class="fault-card__title">Flight Deck Fault</h1>
        </div>
        <div class="fault-card__badge">Fatal</div>
      </div>
      <p class="fault-card__message"></p>
      <p class="fault-card__hint"></p>
      <div class="fault-card__meta">
        <div class="fault-card__meta-item">
          <span>Stage</span>
          <strong data-field="stage"></strong>
        </div>
        <div class="fault-card__meta-item">
          <span>Mode</span>
          <strong data-field="mode"></strong>
        </div>
        <div class="fault-card__meta-item">
          <span>Map</span>
          <strong data-field="map"></strong>
        </div>
        <div class="fault-card__meta-item">
          <span>Code</span>
          <strong data-field="code"></strong>
        </div>
      </div>
      <div class="fault-card__actions">
        <button type="button" class="fault-card__button is-primary" data-action="reload">Restart Renderer</button>
        <button type="button" class="fault-card__button" data-action="copy">Copy Report</button>
        <button type="button" class="fault-card__button" data-action="toggle">Show Diagnostics</button>
      </div>
      <pre class="fault-card__details" hidden></pre>
    </div>
  `;
  host.appendChild(overlay);

  const titleEl = overlay.querySelector<HTMLHeadingElement>('.fault-card__title')!;
  const messageEl = overlay.querySelector<HTMLParagraphElement>('.fault-card__message')!;
  const hintEl = overlay.querySelector<HTMLParagraphElement>('.fault-card__hint')!;
  const stageEl = overlay.querySelector<HTMLElement>('[data-field="stage"]')!;
  const modeEl = overlay.querySelector<HTMLElement>('[data-field="mode"]')!;
  const mapEl = overlay.querySelector<HTMLElement>('[data-field="map"]')!;
  const codeEl = overlay.querySelector<HTMLElement>('[data-field="code"]')!;
  const detailsEl = overlay.querySelector<HTMLPreElement>('.fault-card__details')!;
  const reloadButton = overlay.querySelector<HTMLButtonElement>('[data-action="reload"]')!;
  const copyButton = overlay.querySelector<HTMLButtonElement>('[data-action="copy"]')!;
  const toggleButton = overlay.querySelector<HTMLButtonElement>('[data-action="toggle"]')!;

  let diagnostics = '';
  let detailsVisible = false;
  let copyResetToken = 0;

  function syncDetails(): void {
    detailsEl.hidden = !detailsVisible;
    toggleButton.textContent = detailsVisible ? 'Hide Diagnostics' : 'Show Diagnostics';
    overlay.classList.toggle('is-expanded', detailsVisible);
  }

  reloadButton.addEventListener('click', () => {
    window.location.reload();
  });

  toggleButton.addEventListener('click', () => {
    detailsVisible = !detailsVisible;
    syncDetails();
  });

  copyButton.addEventListener('click', async () => {
    const resetToken = ++copyResetToken;
    try {
      if (!navigator.clipboard) {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(diagnostics);
      copyButton.textContent = 'Report Copied';
    } catch {
      copyButton.textContent = 'Copy Unavailable';
    }
    window.setTimeout(() => {
      if (copyResetToken === resetToken) {
        copyButton.textContent = 'Copy Report';
      }
    }, 1600);
  });

  modeEl.textContent = runtime.appMode === 'scriptedFlyby'
    ? runtime.mode
    : `${runtime.appMode} / ${runtime.mode}`;
  mapEl.textContent = runtime.mapVariant;

  return {
    show(presentation): void {
      diagnostics = presentation.diagnostics;
      titleEl.textContent = presentation.title;
      messageEl.textContent = presentation.message;
      hintEl.textContent = presentation.hint;
      stageEl.textContent = presentation.stage;
      codeEl.textContent = presentation.code;
      detailsEl.textContent = diagnostics;
      detailsVisible = false;
      syncDetails();
      shell.classList.add('is-faulted');
      overlay.hidden = false;
      window.requestAnimationFrame(() => overlay.classList.add('is-visible'));
    },
    hide(): void {
      shell.classList.remove('is-faulted');
      overlay.classList.remove('is-visible', 'is-expanded');
      overlay.hidden = true;
      detailsVisible = false;
      syncDetails();
    },
  };
}

function attachGlobalErrorHandlers(
  overlay: FaultOverlayController,
  runtime: RuntimeOptions,
  getStage: () => string,
): void {
  window.addEventListener('error', (event) => {
    const error = event.error ?? new Error(event.message || 'Unhandled window error');
    overlay.show(buildFaultPresentation(getStage(), runtime, error));
  });
  window.addEventListener('unhandledrejection', (event) => {
    overlay.show(buildFaultPresentation(getStage(), runtime, event.reason));
  });
}

function attachRendererErrorHandlers(
  renderer: Renderer,
  overlay: FaultOverlayController,
  runtime: RuntimeOptions,
  getStage: () => string,
): void {
  void renderer.device.lost.then((info) => {
    overlay.show(buildFaultPresentation(getStage(), runtime, new Error(`GPU device lost (${info.reason}): ${info.message}`)));
  });

  renderer.device.addEventListener('uncapturederror', (event) => {
    const gpuError = (event as Event & { error?: { message?: string } }).error;
    const message = gpuError?.message ?? 'Unknown uncaptured GPU error';
    overlay.show(buildFaultPresentation(getStage(), runtime, new Error(`Uncaptured GPU error: ${message}`)));
  });
}

async function loadConfig(url: string, mode: FlybyMode): Promise<Config> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${url}`);
  const text = await resp.text();
  const lines = text.split(/\r?\n/);

  const config: Config = {
    mode,
    fieldFile: 'airport.fld',
    aircraft: [],
    altitude: 120.0,
    smokeType: ARS_SOLIDSMOKE,
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line[0] === '#') continue;
    const tok = line.split(/\s+/);
    const cmd = tok[0].toUpperCase();

    if (cmd === 'AIRCRAFT') {
      config.aircraft.push(tok[1]);
    } else if (cmd === 'FIELD') {
      config.fieldFile = tok[1];
    } else if (cmd === 'ALTITUDE') {
      config.altitude = parseFloat(tok[1]);
    } else if (cmd === 'SOLIDSMOKE') {
      config.smokeType = 8;
    } else if (cmd === 'WIRESMOKE') {
      config.smokeType = 2;
    } else if (cmd === 'TRAILSMOKE') {
      config.smokeType = 4;
    } else if (cmd === 'RIBBONSMOKE') {
      config.smokeType = 1;
    }
  }

  if (mode === 'flyby2_s') {
    config.fieldFile = 'airport.fld';
    config.aircraft = [...SCREENSAVER_AIRCRAFT];
    config.altitude = 120.0;
    config.smokeType = ARS_RIBBONSMOKE;
  }

  return config;
}

async function main(): Promise<void> {
  const runtime = getRuntimeOptions();
  const app = document.getElementById('app')!;
  const shell = document.createElement('div');
  const rendererStage = document.createElement('section');
  const rendererViewport = document.createElement('div');
  const canvas = document.createElement('canvas');
  canvas.className = 'flight-canvas';
  const debugOverlay = document.createElement('div');
  const helpOverlay = document.createElement('div');
  shell.className = 'app-shell';
  rendererStage.className = 'flight-stage';
  rendererViewport.className = 'flight-stage__viewport';
  debugOverlay.className = 'debug-console';
  helpOverlay.className = 'help-banner';
  rendererViewport.appendChild(canvas);
  rendererViewport.appendChild(helpOverlay);
  rendererStage.appendChild(rendererViewport);
  shell.appendChild(rendererStage);
  shell.appendChild(debugOverlay);
  app.appendChild(shell);
  const faultOverlay = createFaultOverlay(shell, rendererViewport, runtime);
  let bootStage = 'Checking browser WebGPU support';
  attachGlobalErrorHandlers(faultOverlay, runtime, () => bootStage);

  try {
    if (!navigator.gpu) {
      faultOverlay.show(buildFaultPresentation(
        bootStage,
        runtime,
        new Error('WebGPU is not supported in this browser. Please use Chrome or Edge with WebGPU enabled.'),
      ));
      return;
    }

    bootStage = 'Initializing WebGPU renderer';
    const renderer = new Renderer();
    await renderer.init(canvas);
    attachRendererErrorHandlers(renderer, faultOverlay, runtime, () => bootStage);
    faultOverlay.hide();

    function onResize(): void {
      const width = Math.max(1, Math.floor(canvas.clientWidth));
      const height = Math.max(1, Math.floor(canvas.clientHeight));
      renderer.resize(width, height);
    }
    onResize();
    new ResizeObserver(onResize).observe(rendererViewport);

    const dataBase = '/data/';
    bootStage = 'Loading flight configuration';
    const config = await loadConfig(dataBase + 'flyby.inf', runtime.mode);
    config.fieldFile = resolveFieldFileForMap(config.fieldFile, runtime.mapVariant);
    config.smokeType = runtime.smokeOverride ?? scenarioSmokeType(runtime.scenario) ?? config.smokeType;

    bootStage = 'Loading field data';
    console.log('Loading field...');
    const field = enhanceFieldForMap(await loadField(dataBase + config.fieldFile), config.fieldFile, runtime.mapVariant);
    const environment = resolveMapEnvironment(runtime.mapVariant, field);
    console.log(`Field loaded: ${field.srf.length} SRF, ${field.pc2.length} PC2, ${field.ter.length} TER`);

    bootStage = 'Building field GPU buffers';
    const gpuField: GpuField = renderer.buildFieldGpuBuffer(field, environment.keyLight.direction);

    bootStage = 'Loading aircraft models';
    console.log(`Loading ${config.aircraft.length} aircraft...`);
    const aircraft: SrfModel[] = [];
    const aircraftLabels: string[] = [];
    const gpuAircraftList: GpuSrf[] = [];
    const modelsByFile = new Map<string, { model: SrfModel; gpu: GpuSrf }>();

    for (const fn of config.aircraft) {
      try {
        const model = await loadSrf(dataBase + fn);
        const gpuModel = renderer.buildSrfGpuBuffer(model);
        aircraft.push(model);
        aircraftLabels.push(fn);
        gpuAircraftList.push(gpuModel);
        modelsByFile.set(fn, { model, gpu: gpuModel });
        console.log(`  Loaded ${fn}: ${model.nv} vertices, ${model.np} polygons`);
      } catch (e) {
        console.warn(`  Failed to load ${fn}:`, e);
      }
    }

    console.log(`${aircraft.length} aircraft loaded. Starting animation...`);

    bootStage = 'Starting runtime';
    if (runtime.appMode !== 'scriptedFlyby') {
      const game = new GameRuntime({
        appMode: runtime.appMode,
        renderer,
        canvas,
        hudRoot: debugOverlay,
        helpOverlay,
        environment,
        field,
        gpuField,
        initialAltitude: config.altitude,
        modelsByFile,
      });
      game.start();
      return;
    }

    const state: AppState = {
      quitFlag: false,
      paused: false,
      helpCount: 0,
      debugOverlayVisible: true,
      currentTime: 0,
      config,
      runtime,
      random: createRandom(runtime.seed),
      aircraft,
      aircraftLabels,
      field,
      environment,
      smokeClass: initSmokeClass(config.smokeType),
      vaporClass: initSmokeClass(4), // ARS_TRAILSMOKE
      smokeInst: initSmokeInstance(1000, 100),
      vaporInst: initSmokeInstance(100, 10),
      altitude: config.altitude,
      canvas,
      debugOverlay,
      helpOverlay,
      fpsSampleTime: performance.now(),
      fpsFrameCount: 0,
      fps: 0,
      restartRequested: false,
      telemetryHistory: [],
      telemetryMaxSamples: 72,
      debugPanel: null,
      showSnapshot: null,
      pendingSeekRatio: null,
      renderDebug: {
        targetVecWorld: { x: 0, y: 0, z: 0 },
        targetVecCamera: { x: 0, y: 0, z: 0 },
        targetVecMatrix: { x: 0, y: 0, z: 0 },
        targetScreen: null,
        projectionMag: 0,
        objectRegion: '-',
        eyeRegion: '-',
        objectElevation: '-',
        objectCollision: '-',
        mode: config.mode,
        seed: runtime.seed === null ? '-' : String(runtime.seed),
        scenario: runtime.scenario ?? '-',
        referenceScreens: '-',
      },
      cameraPan: {
        heading: 0,
        pitch: 0,
        zoom: 1,
        dragging: false,
        pointerId: null,
        lastX: 0,
        lastY: 0,
      },

      // Maneuver state
      show: { aircraft: 0 },
      obj: { p: { x: 0, y: config.altitude, z: 0 }, a: { h: 0, p: 0, b: 0 } },
      eye: { p: { x: 0, y: config.altitude + 10, z: 100 }, a: { h: 0, p: 0, b: 0 } },
      gpuAircraft: gpuAircraftList[0],
      gpuField: gpuField,
      currentManeuverKey: null,
      currentManeuver: null,
    };

    registerInputHandler(state);
    flyByMain(state, renderer, gpuAircraftList, gpuField);
  } catch (error) {
    faultOverlay.show(buildFaultPresentation(bootStage, runtime, error));
  }
}

void main();
