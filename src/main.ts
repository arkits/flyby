// FLYBY2 — Main Entry Point

import './style.css';
import type {
  Config, AppState, SrfModel, GpuSrf, GpuField, RuntimeOptions, FlybyMode, ManeuverKey, CaptureScenario,
} from './types';
import {
  ARS_SOLIDSMOKE, ARS_RIBBONSMOKE, ARS_TRAILSMOKE, ARS_WIRESMOKE,
} from './types';
import { loadSrf } from './srf-parser';
import { loadField } from './fld-parser';
import { Renderer } from './renderer';
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
  'hanger.srf',
  'mig21.srf',
  'mig23spd.srf',
  'mig23wbk.srf',
  'mrg2000.srf',
  'su27.srf',
  't2blue.srf',
  't400.srf',
  't4blue.srf',
  'thunder.srf',
  'tu160spd.srf',
  'tu160wbk.srf',
  'viggen.srf',
];

function parseMode(value: string | null): FlybyMode {
  return value === 'flyby2_s' ? 'flyby2_s' : 'flyby2';
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
    mode: parseMode(params.get('mode')),
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

  // Check WebGPU support
  if (!navigator.gpu) {
    app.innerHTML = '<p style="color:white;padding:2em;font-size:1.5em">WebGPU is not supported in this browser. Please use Chrome 113+ or Edge 113+.</p>';
    return;
  }

  // Init renderer
  const renderer = new Renderer();
  await renderer.init(canvas);

  // Handle resize
  function onResize(): void {
    const width = Math.max(1, Math.floor(canvas.clientWidth));
    const height = Math.max(1, Math.floor(canvas.clientHeight));
    renderer.resize(width, height);
  }
  onResize();
  new ResizeObserver(onResize).observe(rendererViewport);

  // Load config
  const dataBase = '/data/';
  const runtime = getRuntimeOptions();
  const config = await loadConfig(dataBase + 'flyby.inf', runtime.mode);
  config.smokeType = runtime.smokeOverride ?? scenarioSmokeType(runtime.scenario) ?? config.smokeType;

  // Load field
  console.log('Loading field...');
  const field = await loadField(dataBase + config.fieldFile);
  console.log(`Field loaded: ${field.srf.length} SRF, ${field.pc2.length} PC2, ${field.ter.length} TER`);

  // Build field GPU buffer
  const gpuField: GpuField = renderer.buildFieldGpuBuffer(field);

  // Load aircraft
  console.log(`Loading ${config.aircraft.length} aircraft...`);
  const aircraft: SrfModel[] = [];
  const aircraftLabels: string[] = [];
  const gpuAircraftList: GpuSrf[] = [];

  for (const fn of config.aircraft) {
    try {
      const model = await loadSrf(dataBase + fn);
      aircraft.push(model);
      aircraftLabels.push(fn);
      gpuAircraftList.push(renderer.buildSrfGpuBuffer(model));
      console.log(`  Loaded ${fn}: ${model.nv} vertices, ${model.np} polygons`);
    } catch (e) {
      console.warn(`  Failed to load ${fn}:`, e);
    }
  }

  console.log(`${aircraft.length} aircraft loaded. Starting animation...`);

  // Init state
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

  // Register keyboard handler
  registerInputHandler(state);

  // Start the flyby main loop
  flyByMain(state, renderer, gpuAircraftList, gpuField);
}

main().catch(console.error);
