// FLYBY2 — Flight Logic + Maneuvers
// Ported from FLYBY.C

import type {
  PosAtt, AppState, ManeuverState, GpuSrf, GpuField, ManeuverKey, Vec3,
  DebugPanelRefs, TelemetrySample, MapVariant, WorldSnapshot, FlybyCameraView, FlybyTopDownMode,
} from './types';
import {
  vec3, subV3, rotLtoG, vectorToHeadPitch, pitchUp, sin16, cos16,
  convGtoL, getStdProjection, project, makeTrigonomy,
} from './math';
import {
  ARS_RIBBONSMOKE, ARS_SOLIDSMOKE, ARS_TRAILSMOKE, ARS_WIRESMOKE,
} from './types';
import { Renderer, debugViewTransform } from './renderer';
import { getFieldElevation, getFieldRegion, getFieldSrfCollision } from './field-runtime';
import {
  CAMERA_ZOOM_MAX, CAMERA_ZOOM_MIN,
  clampCameraPitch, clampCameraZoom, downloadFrame, togglePause, wrapAngle16,
} from './input';
import {
  initSmokeClass, initSmokeInstance, clearSmokeInstance,
  beginAppendSmokeNode, appendSmokeNode, endAppendSmokeNode, drawSmoke,
} from './smoke';

let lastTime = 0;
let timeScale = 1.0;
let timeAccumulator = 0;
const SIMULATION_STEP = 0.02;
const CAMERA_CONTROL_TILT_LIMIT_DEG = 80;
const CAMERA_CONTROL_ZOOM_STEP = 0.1;
const TELEMETRY_CHARTS = [
  { key: 'altitude', label: 'Altitude', unit: 'm' },
  { key: 'bank', label: 'Bank', unit: 'deg' },
  { key: 'pitch', label: 'Pitch', unit: 'deg' },
  { key: 'range', label: 'Camera Range', unit: 'm' },
] as const;
const MANEUVER_OPTIONS: Array<{ key: ManeuverKey; label: string }> = [
  { key: 'straight', label: 'Straight Pass' },
  { key: 'roll', label: 'Roll Program' },
  { key: 'loop', label: 'Loop Program' },
  { key: 'climb', label: 'Climb Program' },
  { key: 'eight', label: 'Figure Eight' },
  { key: 'turn360', label: '360 Turn' },
];
const CAMERA_VIEW_OPTIONS: Array<{ key: FlybyCameraView; label: string }> = [
  { key: 'director', label: 'Director' },
  { key: 'thirdPerson', label: 'Third Person' },
  { key: 'topDown', label: 'Top Down' },
];
const TOP_DOWN_MODE_OPTIONS: Array<{ key: FlybyTopDownMode; label: string }> = [
  { key: 'follow', label: 'Follow' },
  { key: 'static', label: 'Static' },
];
const THIRD_PERSON_DISTANCE = 38;
const THIRD_PERSON_HEIGHT = 10;
const TOP_DOWN_HEIGHT = 320;
const CAPTURE_REFERENCE_POINTS: { label: string; point: Vec3 }[] = [
  { label: 'rw1', point: vec3(92.86, 0, 19.84) },
  { label: 'rw2', point: vec3(199.06, 0, -98.37) },
  { label: 'sig1', point: vec3(148.56, 0, 1483.84) },
  { label: 'sig2', point: vec3(43.85, 0, 1483.97) },
];
const RANDOMIZED_AIRCRAFT_LABEL = 'Randomized pool';
const RANDOMIZED_MANEUVER_LABEL = 'Randomized program';

function fmtVec(v: PosAtt['p']): string {
  return `${v.x.toFixed(1)} ${v.y.toFixed(1)} ${v.z.toFixed(1)}`;
}

function fmtSigned(value: number, digits = 1): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
}

function angle16ToDegrees(angle: number): number {
  return (angle / 0x10000) * 360;
}

function degreesToAngle16(degrees: number): number {
  return (degrees / 360) * 0x10000;
}

function wrapCompassDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

function wrapSignedDegrees(degrees: number): number {
  const normalized = wrapCompassDegrees(degrees);
  return normalized > 180 ? normalized - 360 : normalized;
}

function cameraPanDegrees(state: AppState): number {
  return wrapSignedDegrees(angle16ToDegrees(state.cameraPan.heading));
}

function cameraTiltDegrees(state: AppState): number {
  return wrapSignedDegrees(angle16ToDegrees(state.cameraPan.pitch));
}

function setCameraPanDegrees(state: AppState, degrees: number): void {
  state.cameraPan.heading = wrapAngle16(degreesToAngle16(degrees));
}

function setCameraTiltDegrees(state: AppState, degrees: number): void {
  state.cameraPan.pitch = clampCameraPitch(degreesToAngle16(degrees));
}

function resetCameraControls(state: AppState): void {
  state.cameraPan.heading = 0;
  state.cameraPan.pitch = 0;
  state.cameraPan.zoom = 1;
}

function getAircraftLabel(state: AppState): string {
  return state.aircraftLabels[state.show.aircraft] ?? `#${state.show.aircraft}`;
}

function getManeuverLabel(key: ManeuverKey | null): string {
  return MANEUVER_OPTIONS.find((option) => option.key === key)?.label ?? 'Randomized Program';
}

function updateRandomizedSelectionStatus(state: AppState, panel: DebugPanelRefs): void {
  const showAircraftStatus = state.runtime.forcedAircraftIndex === null;
  panel.aircraftRandomStatus.hidden = !showAircraftStatus;
  panel.aircraftRandomStatus.textContent = showAircraftStatus
    ? `This scene: ${getAircraftLabel(state)}`
    : '';

  const showManeuverStatus = state.runtime.forcedManeuver === null && state.currentManeuverKey !== null;
  panel.maneuverRandomStatus.hidden = !showManeuverStatus;
  panel.maneuverRandomStatus.textContent = showManeuverStatus
    ? `This scene: ${getManeuverLabel(state.currentManeuverKey)}`
    : '';
}

function getTopDownModeLabel(mode: FlybyTopDownMode): string {
  return TOP_DOWN_MODE_OPTIONS.find((option) => option.key === mode)?.label ?? 'Follow';
}

function getCameraViewLabel(state: AppState): string {
  const base = CAMERA_VIEW_OPTIONS.find((option) => option.key === state.cameraView)?.label ?? 'Director';
  return state.cameraView === 'topDown'
    ? `${base} ${getTopDownModeLabel(state.topDownMode)}`
    : base;
}

function getManeuverMetric(maneuver: ManeuverState | null): string {
  if (!maneuver) return 'standby';
  return maneuver.type === 'AHEAD'
    ? `${(maneuver.dist ?? 0).toFixed(1)} m remaining`
    : `${Math.round(maneuver.ctr ?? 0)} ctr remaining`;
}

function getManeuverProgress(maneuver: ManeuverState | null): number {
  if (!maneuver) return 0;
  if (maneuver.type === 'AHEAD') {
    const total = maneuver.initialDist ?? 0;
    if (total <= 0) return 1;
    return Math.max(0, Math.min(1, 1 - ((maneuver.dist ?? 0) / total)));
  }

  const total = maneuver.initialCtr ?? 0;
  if (total <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - ((maneuver.ctr ?? 0) / total)));
}

function buildPitchLadder(): string {
  const marks: string[] = [];
  for (let degrees = -30; degrees <= 30; degrees += 10) {
    const y = 88 - degrees * 2.2;
    marks.push(`
      <div class="debug-console__pitch-mark" style="top:${y.toFixed(1)}px">
        <span>${Math.abs(degrees)}</span>
        <i></i>
        <span>${Math.abs(degrees)}</span>
      </div>
    `);
  }
  return marks.join('');
}

function buildHeadingScale(headingDeg: number): string {
  const marks: string[] = [];
  for (let offset = -90; offset <= 90; offset += 15) {
    const value = wrapCompassDegrees(headingDeg + offset);
    const major = offset % 30 === 0;
    const label = major
      ? ({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' } as Record<number, string>)[Math.round(value)] ?? Math.round(value).toString().padStart(3, '0')
      : '·';
    const left = ((offset + 90) / 180) * 100;
    marks.push(`
      <span class="debug-console__heading-mark${offset === 0 ? ' is-center' : ''}${major ? ' is-major' : ''}" style="left:${left}%">
        ${label}
      </span>
    `);
  }
  return marks.join('');
}

function queryElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector(selector);
  if (!element) {
    throw new Error(`Missing debug overlay element: ${selector}`);
  }
  return element as T;
}

function requestShowRestart(state: AppState): void {
  state.restartRequested = true;
}

function updateMapVariant(mapVariant: MapVariant): void {
  const params = new URLSearchParams(window.location.search);
  if (mapVariant === 'airport-improved') {
    params.delete('map');
  } else {
    params.set('map', mapVariant);
  }
  const query = params.toString();
  window.location.search = query.length > 0 ? `?${query}` : '';
}

function clonePosAtt(posAtt: PosAtt): PosAtt {
  return {
    p: { ...posAtt.p },
    a: { ...posAtt.a },
  };
}

function addOffsetFromAttitude(origin: PosAtt, offset: Vec3): Vec3 {
  const worldOffset = vec3(0, 0, 0);
  rotLtoG(worldOffset, offset, origin.a);
  return {
    x: origin.p.x + worldOffset.x,
    y: origin.p.y + worldOffset.y,
    z: origin.p.z + worldOffset.z,
  };
}

function resolveDirectorCamera(state: AppState): PosAtt {
  const renderEye = clonePosAtt(state.eye);
  if (state.currentManeuver?.type === 'AHEAD') {
    const maxAheadVerticalOffset = 28;
    renderEye.p.y = Math.max(
      state.obj.p.y - maxAheadVerticalOffset,
      Math.min(state.obj.p.y + maxAheadVerticalOffset, renderEye.p.y),
    );
  }

  const vec = subV3(state.obj.p, renderEye.p);
  vectorToHeadPitch(renderEye.a, vec);
  renderEye.a.h = wrapAngle16(renderEye.a.h + state.cameraPan.heading);
  renderEye.a.p = clampCameraPitch(renderEye.a.p + state.cameraPan.pitch);
  return renderEye;
}

function resolveThirdPersonCamera(state: AppState): PosAtt {
  const renderEye: PosAtt = {
    p: addOffsetFromAttitude(
      state.obj,
      vec3(0, THIRD_PERSON_HEIGHT, -THIRD_PERSON_DISTANCE),
    ),
    a: {
      h: wrapAngle16(state.obj.a.h + state.cameraPan.heading),
      p: state.obj.a.p + state.cameraPan.pitch,
      b: state.obj.a.b,
    },
  };
  return renderEye;
}

function currentFollowTopDownPosition(state: AppState): Vec3 {
  return {
    x: state.obj.p.x,
    y: state.obj.p.y + TOP_DOWN_HEIGHT,
    z: state.obj.p.z,
  };
}

function resolveTopDownCamera(state: AppState): PosAtt {
  const anchor = state.topDownMode === 'static' ? state.topDownAnchor : null;
  const renderEye: PosAtt = {
    p: anchor ?? currentFollowTopDownPosition(state),
    a: { h: 0, p: 0, b: 0 },
  };
  vectorToHeadPitch(renderEye.a, subV3(state.obj.p, renderEye.p));
  return renderEye;
}

function latchTopDownAnchor(state: AppState): void {
  state.topDownAnchor = currentFollowTopDownPosition(state);
}

function resolveRenderCamera(state: AppState): PosAtt {
  switch (state.cameraView) {
    case 'thirdPerson':
      return resolveThirdPersonCamera(state);
    case 'topDown':
      return resolveTopDownCamera(state);
    case 'director':
    default:
      return resolveDirectorCamera(state);
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function maneuverDurationSeconds(maneuver: ManeuverState | null): number {
  if (!maneuver) return 0;

  const nextDuration = maneuverDurationSeconds(maneuver.nextManeuvers[0] ?? null);
  switch (maneuver.type) {
    case 'AHEAD':
      return ((maneuver.initialDist ?? maneuver.dist ?? 0) / 100.0) + nextDuration;
    case 'PITCH':
    case 'TURN':
      return ((maneuver.initialCtr ?? maneuver.ctr ?? 0) / 8192.0) + nextDuration;
    case 'BANK':
      return ((maneuver.initialCtr ?? maneuver.ctr ?? 0) / 32768.0) + nextDuration;
  }
}

function queueSeekToProgress(state: AppState, ratio: number): void {
  state.pendingSeekRatio = clamp01(ratio);
}

function findManeuverOptionIndex(key: ManeuverKey): number {
  return MANEUVER_OPTIONS.findIndex((option) => option.key === key);
}

function cycleManeuverSelection(state: AppState, panel: DebugPanelRefs, direction: -1 | 1): void {
  const fallbackKey = MANEUVER_OPTIONS[0]?.key ?? null;
  const baseKey = state.runtime.forcedManeuver ?? state.currentManeuverKey ?? fallbackKey;
  if (!baseKey) return;

  const currentIndex = findManeuverOptionIndex(baseKey);
  if (currentIndex < 0) return;

  const nextIndex = (currentIndex + direction + MANEUVER_OPTIONS.length) % MANEUVER_OPTIONS.length;
  const nextKey = MANEUVER_OPTIONS[nextIndex]?.key;
  if (!nextKey) return;

  state.runtime.forcedManeuver = nextKey;
  panel.maneuverSelect.value = nextKey;
  requestShowRestart(state);
}

function progressRatioFromPointer(panel: DebugPanelRefs, clientX: number): number {
  const bounds = panel.progressTrack.getBoundingClientRect();
  if (bounds.width <= 0) return 0;
  return clamp01((clientX - bounds.left) / bounds.width);
}

function initializeDebugOverlay(state: AppState): DebugPanelRefs {
  if (state.debugPanel) return state.debugPanel;

  const aircraftOptions = state.aircraftLabels
    .map((label, index) => `<option value="${index}">${label}</option>`)
    .join('');
  const maneuverOptions = MANEUVER_OPTIONS
    .map((option) => `<option value="${option.key}">${option.label}</option>`)
    .join('');
  const cameraViewOptions = CAMERA_VIEW_OPTIONS
    .map((option) => `<option value="${option.key}">${option.label}</option>`)
    .join('');
  const topDownModeOptions = TOP_DOWN_MODE_OPTIONS
    .map((option) => `<option value="${option.key}">${option.label}</option>`)
    .join('');
  const mapOptions = `
    <option value="airport">Airport</option>
    <option value="airport-improved">Airport Improved</option>
    <option value="airport-night">Airport Night</option>
    <option value="downtown">Downtown</option>
  `;
  const chartCards = TELEMETRY_CHARTS
    .map((chart) => `
      <div class="debug-console__chart-card">
        <div class="debug-console__chart-head">
          <span>${chart.label}</span>
          <span data-chart-value="${chart.key}">-</span>
        </div>
        <svg viewBox="0 0 100 48" aria-hidden="true">
          <path class="debug-console__chart-gridline" d="M 0 12 L 100 12"></path>
          <path class="debug-console__chart-gridline" d="M 0 24 L 100 24"></path>
          <path class="debug-console__chart-gridline" d="M 0 36 L 100 36"></path>
          <path class="debug-console__chart-trace" data-chart="${chart.key}" d="M 0 24 L 100 24"></path>
        </svg>
      </div>
    `)
    .join('');

  state.debugOverlay.innerHTML = `
    <div class="debug-console__header">
      <div class="debug-console__header-copy">
        <div class="debug-console__title">FLYBY2 DEBUG</div>
      </div>
      <div class="debug-console__hint-stack">
        <div class="debug-console__hint">D</div>
        <div class="debug-console__hint-label">toggle</div>
      </div>
    </div>
    <div class="debug-console__section">
      <div class="debug-console__section-title">Sortie Director</div>
      <div class="debug-console__controls">
        <label class="debug-console__control">
          <span>Map</span>
          <select data-control="map">
            ${mapOptions}
          </select>
        </label>
        <label class="debug-console__control">
          <span>Aircraft</span>
          <select data-control="aircraft">
            <option value="random">${RANDOMIZED_AIRCRAFT_LABEL}</option>
            ${aircraftOptions}
          </select>
          <div class="debug-console__control-status" data-value="aircraft-random-status" hidden></div>
        </label>
        <label class="debug-console__control">
          <span>Maneuver</span>
          <select data-control="maneuver">
            <option value="random">${RANDOMIZED_MANEUVER_LABEL}</option>
            ${maneuverOptions}
          </select>
          <div class="debug-console__control-status" data-value="maneuver-random-status" hidden></div>
        </label>
      </div>
      <button type="button" class="debug-console__randomize" data-control="randomize">Randomize Aircraft + Maneuver</button>
      <button type="button" class="debug-console__action-button is-secondary" data-control="screenshot">Capture Frame</button>
    </div>
    <div class="debug-console__section">
      <div class="debug-console__section-title">Maneuver Progress</div>
      <div class="debug-console__progress-head">
        <span data-value="progress-label">Standby</span>
        <span data-value="progress-value">0%</span>
      </div>
      <div class="debug-console__transport-row">
        <button
          type="button"
          class="debug-console__transport-step"
          data-control="previous-maneuver"
          aria-label="Previous maneuver"
          title="Previous maneuver"
        >&lt;</button>
        <button
          type="button"
          class="debug-console__transport-toggle"
          data-control="pause"
          aria-label="Pause render"
          title="Pause render"
        ></button>
        <button
          type="button"
          class="debug-console__transport-step"
          data-control="next-maneuver"
          aria-label="Next maneuver"
          title="Next maneuver"
        >&gt;</button>
        <div
          class="debug-console__progress"
          data-control="progress"
          role="slider"
          tabindex="0"
          aria-label="Maneuver progress"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow="0"
        >
          <div class="debug-console__progress-fill"></div>
          <div class="debug-console__progress-thumb"></div>
        </div>
      </div>
    </div>
    <div class="debug-console__section">
      <div class="debug-console__section-title">Camera View</div>
      <div class="debug-console__controls">
        <label class="debug-console__control">
          <span>View</span>
          <select data-control="camera-view">
            ${cameraViewOptions}
          </select>
        </label>
        <label class="debug-console__control">
          <span>Top Down</span>
          <select data-control="top-down-mode">
            ${topDownModeOptions}
          </select>
        </label>
      </div>
      <div class="debug-console__camera-grid">
        <label class="debug-console__slider-control">
          <div class="debug-console__slider-head">
            <span>Pan</span>
            <span data-value="camera-pan">+0.0 deg</span>
          </div>
          <input type="range" min="-180" max="180" step="1" value="0" data-control="camera-pan">
        </label>
        <label class="debug-console__slider-control">
          <div class="debug-console__slider-head">
            <span>Tilt</span>
            <span data-value="camera-tilt">+0.0 deg</span>
          </div>
          <input type="range" min="-80" max="80" step="1" value="0" data-control="camera-tilt">
        </label>
        <label class="debug-console__slider-control">
          <div class="debug-console__slider-head">
            <span>Zoom</span>
            <span data-value="camera-zoom">1.00x</span>
          </div>
          <input type="range" min="${CAMERA_ZOOM_MIN}" max="${CAMERA_ZOOM_MAX}" step="${CAMERA_CONTROL_ZOOM_STEP}" value="1" data-control="camera-zoom">
        </label>
      </div>
      <button type="button" class="debug-console__action-button" data-control="camera-reset">Reset Camera Trim</button>
    </div>
    <div class="debug-console__section">
      <div class="debug-console__section-title">Flight Instruments</div>
      <div class="debug-console__instrument-grid">
        <div class="debug-console__attitude">
          <div class="debug-console__attitude-mask">
            <div class="debug-console__attitude-horizon"></div>
            <div class="debug-console__attitude-pitch-scale">${buildPitchLadder()}</div>
          </div>
          <div class="debug-console__attitude-frame"></div>
          <div class="debug-console__attitude-bank-scale"></div>
          <div class="debug-console__attitude-bank-bug"></div>
        </div>
        <div class="debug-console__instrument-stack">
          <div class="debug-console__heading-panel">
            <div class="debug-console__heading-head">
              <span>Heading</span>
              <span data-value="heading">000</span>
            </div>
            <div class="debug-console__heading-tape">
              <div class="debug-console__heading-scale" data-value="heading-scale"></div>
              <div class="debug-console__heading-caret"></div>
            </div>
          </div>
          <div class="debug-console__instrument-readouts">
            <div>
              <span>Pitch</span>
              <strong data-value="pitch">0.0 deg</strong>
            </div>
            <div>
              <span>Bank</span>
              <strong data-value="bank">0.0 deg</strong>
            </div>
            <div>
              <span>Range</span>
              <strong data-value="range">0.0 m</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="debug-console__section">
      <div class="debug-console__section-title">Telemetry Strips</div>
      <div class="debug-console__telemetry-grid">
        ${chartCards}
      </div>
    </div>
    <div class="debug-console__section">
      <div class="debug-console__section-title">Flight Data</div>
      <div class="debug-console__grid">
        <span>aircraft</span><span data-value="aircraft">-</span>
        <span>maneuver</span><span data-value="maneuver">-</span>
        <span>fps</span><span data-value="fps">0.0</span>
        <span>dt</span><span data-value="dt">0.0 ms</span>
        <span>plane pos</span><span data-value="plane-pos">-</span>
        <span>camera pos</span><span data-value="camera-pos">-</span>
        <span>view</span><span data-value="view">-</span>
        <span>obj scr</span><span data-value="screen">-</span>
        <span>regions</span><span data-value="regions">-</span>
        <span>elevation</span><span data-value="elevation">-</span>
        <span>collision</span><span data-value="collision">-</span>
        <span>smoke</span><span data-value="smoke">-</span>
        <span>time</span><span data-value="time">-</span>
        <span>paused</span><span data-value="paused">-</span>
        <span>seed/scn</span><span data-value="runtime">-</span>
      </div>
    </div>
  `;

  const panel: DebugPanelRefs = {
    mapSelect: queryElement<HTMLSelectElement>(state.debugOverlay, '[data-control="map"]'),
    aircraftSelect: queryElement<HTMLSelectElement>(state.debugOverlay, '[data-control="aircraft"]'),
    maneuverSelect: queryElement<HTMLSelectElement>(state.debugOverlay, '[data-control="maneuver"]'),
    aircraftRandomStatus: queryElement<HTMLDivElement>(state.debugOverlay, '[data-value="aircraft-random-status"]'),
    maneuverRandomStatus: queryElement<HTMLDivElement>(state.debugOverlay, '[data-value="maneuver-random-status"]'),
    cameraViewSelect: queryElement<HTMLSelectElement>(state.debugOverlay, '[data-control="camera-view"]'),
    topDownModeSelect: queryElement<HTMLSelectElement>(state.debugOverlay, '[data-control="top-down-mode"]'),
    randomizeButton: queryElement<HTMLButtonElement>(state.debugOverlay, '[data-control="randomize"]'),
    previousManeuverButton: queryElement<HTMLButtonElement>(state.debugOverlay, '[data-control="previous-maneuver"]'),
    pauseButton: queryElement<HTMLButtonElement>(state.debugOverlay, '[data-control="pause"]'),
    nextManeuverButton: queryElement<HTMLButtonElement>(state.debugOverlay, '[data-control="next-maneuver"]'),
    screenshotButton: queryElement<HTMLButtonElement>(state.debugOverlay, '[data-control="screenshot"]'),
    cameraPanRange: queryElement<HTMLInputElement>(state.debugOverlay, '[data-control="camera-pan"]'),
    cameraTiltRange: queryElement<HTMLInputElement>(state.debugOverlay, '[data-control="camera-tilt"]'),
    cameraZoomRange: queryElement<HTMLInputElement>(state.debugOverlay, '[data-control="camera-zoom"]'),
    cameraPanValue: queryElement<HTMLSpanElement>(state.debugOverlay, '[data-value="camera-pan"]'),
    cameraTiltValue: queryElement<HTMLSpanElement>(state.debugOverlay, '[data-value="camera-tilt"]'),
    cameraZoomValue: queryElement<HTMLSpanElement>(state.debugOverlay, '[data-value="camera-zoom"]'),
    cameraResetButton: queryElement<HTMLButtonElement>(state.debugOverlay, '[data-control="camera-reset"]'),
    progressTrack: queryElement<HTMLDivElement>(state.debugOverlay, '[data-control="progress"]'),
    progressThumb: queryElement<HTMLDivElement>(state.debugOverlay, '.debug-console__progress-thumb'),
    progressFill: queryElement<HTMLDivElement>(state.debugOverlay, '.debug-console__progress-fill'),
    progressValue: queryElement<HTMLSpanElement>(state.debugOverlay, '[data-value="progress-value"]'),
    progressLabel: queryElement<HTMLSpanElement>(state.debugOverlay, '[data-value="progress-label"]'),
    attitudeHorizon: queryElement<HTMLDivElement>(state.debugOverlay, '.debug-console__attitude-horizon'),
    attitudePitchScale: queryElement<HTMLDivElement>(state.debugOverlay, '.debug-console__attitude-pitch-scale'),
    attitudeBankBug: queryElement<HTMLDivElement>(state.debugOverlay, '.debug-console__attitude-bank-bug'),
    headingScale: queryElement<HTMLDivElement>(state.debugOverlay, '[data-value="heading-scale"]'),
    values: {
      aircraft: queryElement(state.debugOverlay, '[data-value="aircraft"]'),
      maneuver: queryElement(state.debugOverlay, '[data-value="maneuver"]'),
      fps: queryElement(state.debugOverlay, '[data-value="fps"]'),
      dt: queryElement(state.debugOverlay, '[data-value="dt"]'),
      planePos: queryElement(state.debugOverlay, '[data-value="plane-pos"]'),
      cameraPos: queryElement(state.debugOverlay, '[data-value="camera-pos"]'),
      view: queryElement(state.debugOverlay, '[data-value="view"]'),
      screen: queryElement(state.debugOverlay, '[data-value="screen"]'),
      regions: queryElement(state.debugOverlay, '[data-value="regions"]'),
      elevation: queryElement(state.debugOverlay, '[data-value="elevation"]'),
      collision: queryElement(state.debugOverlay, '[data-value="collision"]'),
      smoke: queryElement(state.debugOverlay, '[data-value="smoke"]'),
      time: queryElement(state.debugOverlay, '[data-value="time"]'),
      paused: queryElement(state.debugOverlay, '[data-value="paused"]'),
      runtime: queryElement(state.debugOverlay, '[data-value="runtime"]'),
      heading: queryElement(state.debugOverlay, '[data-value="heading"]'),
      pitch: queryElement(state.debugOverlay, '[data-value="pitch"]'),
      bank: queryElement(state.debugOverlay, '[data-value="bank"]'),
      range: queryElement(state.debugOverlay, '[data-value="range"]'),
    },
    chartPaths: {
      altitude: queryElement<SVGPathElement>(state.debugOverlay, '[data-chart="altitude"]'),
      bank: queryElement<SVGPathElement>(state.debugOverlay, '[data-chart="bank"]'),
      pitch: queryElement<SVGPathElement>(state.debugOverlay, '[data-chart="pitch"]'),
      range: queryElement<SVGPathElement>(state.debugOverlay, '[data-chart="range"]'),
    },
    chartValues: {
      altitude: queryElement(state.debugOverlay, '[data-chart-value="altitude"]'),
      bank: queryElement(state.debugOverlay, '[data-chart-value="bank"]'),
      pitch: queryElement(state.debugOverlay, '[data-chart-value="pitch"]'),
      range: queryElement(state.debugOverlay, '[data-chart-value="range"]'),
    },
  };

  panel.mapSelect.value = state.runtime.mapVariant;
  panel.aircraftSelect.value = state.runtime.forcedAircraftIndex === null
    ? 'random'
    : String(Math.max(0, Math.min(state.aircraftLabels.length - 1, Math.floor(state.runtime.forcedAircraftIndex))));
  panel.maneuverSelect.value = state.runtime.forcedManeuver ?? 'random';
  updateRandomizedSelectionStatus(state, panel);
  panel.cameraViewSelect.value = state.cameraView;
  panel.topDownModeSelect.value = state.topDownMode;
  panel.cameraPanRange.value = cameraPanDegrees(state).toFixed(0);
  panel.cameraTiltRange.value = cameraTiltDegrees(state).toFixed(0);
  panel.cameraZoomRange.value = state.cameraPan.zoom.toFixed(2);

  panel.mapSelect.addEventListener('change', () => {
    updateMapVariant(panel.mapSelect.value as MapVariant);
  });
  panel.aircraftSelect.addEventListener('change', () => {
    state.runtime.forcedAircraftIndex = panel.aircraftSelect.value === 'random'
      ? null
      : Number(panel.aircraftSelect.value);
    requestShowRestart(state);
  });
  panel.maneuverSelect.addEventListener('change', () => {
    state.runtime.forcedManeuver = panel.maneuverSelect.value === 'random'
      ? null
      : panel.maneuverSelect.value as ManeuverKey;
    requestShowRestart(state);
  });
  panel.cameraViewSelect.addEventListener('change', () => {
    state.cameraView = panel.cameraViewSelect.value as FlybyCameraView;
    if (state.cameraView === 'topDown' && state.topDownMode === 'static') {
      latchTopDownAnchor(state);
    }
  });
  panel.topDownModeSelect.addEventListener('change', () => {
    state.topDownMode = panel.topDownModeSelect.value as FlybyTopDownMode;
    if (state.topDownMode === 'static') {
      latchTopDownAnchor(state);
    } else {
      state.topDownAnchor = null;
    }
  });
  panel.randomizeButton.addEventListener('click', () => {
    state.runtime.forcedAircraftIndex = null;
    state.runtime.forcedManeuver = null;
    panel.aircraftSelect.value = 'random';
    panel.maneuverSelect.value = 'random';
    requestShowRestart(state);
  });
  panel.pauseButton.addEventListener('click', () => {
    togglePause(state);
  });
  panel.previousManeuverButton.addEventListener('click', () => {
    cycleManeuverSelection(state, panel, -1);
  });
  panel.nextManeuverButton.addEventListener('click', () => {
    cycleManeuverSelection(state, panel, 1);
  });
  panel.screenshotButton.addEventListener('click', () => {
    downloadFrame(state.canvas);
  });
  panel.cameraPanRange.addEventListener('input', () => {
    setCameraPanDegrees(state, Number(panel.cameraPanRange.value));
  });
  panel.cameraTiltRange.addEventListener('input', () => {
    const degrees = Math.max(
      -CAMERA_CONTROL_TILT_LIMIT_DEG,
      Math.min(CAMERA_CONTROL_TILT_LIMIT_DEG, Number(panel.cameraTiltRange.value)),
    );
    setCameraTiltDegrees(state, degrees);
  });
  panel.cameraZoomRange.addEventListener('input', () => {
    state.cameraPan.zoom = clampCameraZoom(Number(panel.cameraZoomRange.value));
  });
  panel.cameraResetButton.addEventListener('click', () => {
    resetCameraControls(state);
  });
  panel.progressTrack.addEventListener('pointerdown', (event) => {
    const ratio = progressRatioFromPointer(panel, event.clientX);
    queueSeekToProgress(state, ratio);
    panel.progressTrack.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  panel.progressTrack.addEventListener('pointermove', (event) => {
    if (!panel.progressTrack.hasPointerCapture(event.pointerId)) return;
    queueSeekToProgress(state, progressRatioFromPointer(panel, event.clientX));
  });
  panel.progressTrack.addEventListener('pointerup', (event) => {
    if (panel.progressTrack.hasPointerCapture(event.pointerId)) {
      panel.progressTrack.releasePointerCapture(event.pointerId);
    }
  });
  panel.progressTrack.addEventListener('pointercancel', (event) => {
    if (panel.progressTrack.hasPointerCapture(event.pointerId)) {
      panel.progressTrack.releasePointerCapture(event.pointerId);
    }
  });
  panel.progressTrack.addEventListener('keydown', (event) => {
    let delta = 0;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') delta = -0.02;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') delta = 0.02;
    if (event.key === 'PageDown') delta = -0.1;
    if (event.key === 'PageUp') delta = 0.1;
    if (event.key === 'Home') {
      queueSeekToProgress(state, 0);
      event.preventDefault();
      return;
    }
    if (event.key === 'End') {
      queueSeekToProgress(state, 1);
      event.preventDefault();
      return;
    }
    if (delta !== 0) {
      const current = state.showSnapshot
        ? clamp01(state.showSnapshot.totalDuration <= 0 ? 0 : state.currentTime / state.showSnapshot.totalDuration)
        : 0;
      queueSeekToProgress(state, current + delta);
      event.preventDefault();
    }
  });

  state.debugOverlay.classList.toggle('is-hidden', !state.debugOverlayVisible);
  state.debugOverlay.parentElement?.classList.toggle('is-debug-hidden', !state.debugOverlayVisible);
  state.debugPanel = panel;
  return panel;
}

function chartValue(sample: TelemetrySample, key: typeof TELEMETRY_CHARTS[number]['key']): number {
  switch (key) {
    case 'altitude': return sample.altitude;
    case 'bank': return sample.bankDeg;
    case 'pitch': return sample.pitchDeg;
    case 'range': return sample.range;
  }
}

function createSparklinePath(samples: TelemetrySample[], key: typeof TELEMETRY_CHARTS[number]['key']): string {
  if (samples.length < 2) {
    return 'M 0 24 L 100 24';
  }

  const values = samples.map((sample) => chartValue(sample, key));
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (key === 'bank' || key === 'pitch') {
    const maxAbs = Math.max(10, ...values.map((value) => Math.abs(value)));
    min = -maxAbs;
    max = maxAbs;
  } else if (Math.abs(max - min) < 0.001) {
    min -= 1;
    max += 1;
  }
  const padTop = 4;
  const padBottom = 4;
  const height = 48 - padTop - padBottom;

  return samples
    .map((sample, index) => {
      const x = (index / (samples.length - 1)) * 100;
      const value = chartValue(sample, key);
      const ratio = (value - min) / (max - min);
      const y = 48 - padBottom - ratio * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

function recordTelemetrySample(state: AppState): void {
  const range = Math.hypot(
    state.obj.p.x - state.renderDebug.cameraPos.x,
    state.obj.p.y - state.renderDebug.cameraPos.y,
    state.obj.p.z - state.renderDebug.cameraPos.z,
  );
  const overallProgress = state.showSnapshot
    ? clamp01(state.currentTime / Math.max(state.showSnapshot.totalDuration, SIMULATION_STEP))
    : getManeuverProgress(state.currentManeuver);
  state.telemetryHistory.push({
    time: state.currentTime,
    altitude: state.obj.p.y,
    pitchDeg: wrapSignedDegrees(angle16ToDegrees(state.obj.a.p)),
    bankDeg: wrapSignedDegrees(angle16ToDegrees(state.obj.a.b)),
    headingDeg: wrapCompassDegrees(angle16ToDegrees(state.obj.a.h)),
    range,
    progress: overallProgress,
    smokeCount: state.smokeInst.nPth,
    vaporCount: state.vaporInst.nPth,
  });
  if (state.telemetryHistory.length > state.telemetryMaxSamples) {
    state.telemetryHistory.shift();
  }
}

function updateDebugOverlay(state: AppState, dt: number): void {
  const panel = initializeDebugOverlay(state);
  const now = performance.now();
  state.fpsFrameCount += 1;
  const elapsed = now - state.fpsSampleTime;
  if (elapsed >= 250) {
    state.fps = (state.fpsFrameCount * 1000) / elapsed;
    state.fpsFrameCount = 0;
    state.fpsSampleTime = now;
  }

  recordTelemetrySample(state);
  const latest = state.telemetryHistory[state.telemetryHistory.length - 1];
  const maneuver = state.currentManeuver;
  const progress = state.showSnapshot
    ? clamp01(state.currentTime / Math.max(state.showSnapshot.totalDuration, SIMULATION_STEP))
    : getManeuverProgress(maneuver);
  const progressPercent = Math.round(progress * 100);
  const screen = state.renderDebug.targetScreen;
  const screenText = screen
    ? `${screen.x.toFixed(1)} ${screen.y.toFixed(1)}`
    : 'clipped';

  panel.progressFill.style.width = `${progressPercent}%`;
  panel.progressThumb.style.left = `${progressPercent}%`;
  panel.progressTrack.setAttribute('aria-valuenow', String(progressPercent));
  panel.progressTrack.setAttribute('aria-valuetext', `${progressPercent}%`);
  panel.progressValue.textContent = `${progressPercent}%`;
  panel.progressLabel.textContent = `${maneuver?.type ?? 'NONE'} | ${getManeuverMetric(maneuver)}`;
  panel.pauseButton.classList.toggle('is-active', state.paused);
  panel.pauseButton.setAttribute('aria-pressed', state.paused ? 'true' : 'false');
  panel.pauseButton.setAttribute('aria-label', state.paused ? 'Resume render' : 'Pause render');
  panel.pauseButton.setAttribute('title', state.paused ? 'Resume render' : 'Pause render');
  panel.cameraViewSelect.value = state.cameraView;
  panel.topDownModeSelect.value = state.topDownMode;
  panel.topDownModeSelect.disabled = state.cameraView !== 'topDown';
  const currentPanDeg = cameraPanDegrees(state);
  const currentTiltDeg = cameraTiltDegrees(state);
  const topDownView = state.cameraView === 'topDown';
  panel.cameraPanRange.disabled = topDownView;
  panel.cameraTiltRange.disabled = topDownView;
  panel.cameraPanRange.value = currentPanDeg.toFixed(0);
  panel.cameraTiltRange.value = currentTiltDeg.toFixed(0);
  panel.cameraZoomRange.value = state.cameraPan.zoom.toFixed(2);
  panel.cameraPanValue.textContent = topDownView ? 'fixed' : `${fmtSigned(currentPanDeg)} deg`;
  panel.cameraTiltValue.textContent = topDownView ? 'fixed' : `${fmtSigned(currentTiltDeg)} deg`;
  panel.cameraZoomValue.textContent = `${state.cameraPan.zoom.toFixed(2)}x`;
  state.debugOverlay.classList.toggle('is-paused', state.paused);

  panel.values.aircraft.textContent = getAircraftLabel(state);
  panel.values.maneuver.textContent = getManeuverLabel(state.currentManeuverKey);
  updateRandomizedSelectionStatus(state, panel);
  panel.values.fps.textContent = state.fps.toFixed(1);
  panel.values.dt.textContent = `${(dt * 1000).toFixed(1)} ms`;
  panel.values.planePos.textContent = fmtVec(state.obj.p);
  panel.values.cameraPos.textContent = fmtVec(state.renderDebug.cameraPos);
  panel.values.view.textContent = getCameraViewLabel(state);
  panel.values.screen.textContent = screenText;
  panel.values.regions.textContent = `${state.renderDebug.objectRegion} / ${state.renderDebug.eyeRegion}`;
  panel.values.elevation.textContent = state.renderDebug.objectElevation;
  panel.values.collision.textContent = state.renderDebug.objectCollision;
  panel.values.smoke.textContent = `${state.smokeInst.nPth} / ${state.vaporInst.nPth}`;
  panel.values.time.textContent = `${state.currentTime.toFixed(2)} s`;
  panel.values.paused.textContent = state.paused ? 'yes' : 'no';
  panel.values.runtime.textContent = `${state.renderDebug.seed} / ${state.renderDebug.scenario} / ${state.runtime.mapVariant}`;
  panel.values.heading.textContent = Math.round(latest.headingDeg).toString().padStart(3, '0');
  panel.values.pitch.textContent = `${fmtSigned(latest.pitchDeg)} deg`;
  panel.values.bank.textContent = `${fmtSigned(latest.bankDeg)} deg`;
  panel.values.range.textContent = `${latest.range.toFixed(1)} m`;

  const attitudeOffset = Math.max(-34, Math.min(34, latest.pitchDeg * 1.25));
  panel.attitudeHorizon.style.transform = `translateY(${attitudeOffset}px) rotate(${latest.bankDeg.toFixed(2)}deg)`;
  panel.attitudePitchScale.style.transform = `translateY(${attitudeOffset}px) rotate(${latest.bankDeg.toFixed(2)}deg)`;
  panel.attitudeBankBug.style.transform = `translateX(-50%) rotate(${latest.bankDeg.toFixed(2)}deg)`;
  panel.headingScale.innerHTML = buildHeadingScale(latest.headingDeg);

  for (const chart of TELEMETRY_CHARTS) {
    panel.chartPaths[chart.key].setAttribute('d', createSparklinePath(state.telemetryHistory, chart.key));
    panel.chartValues[chart.key].textContent = `${chartValue(latest, chart.key).toFixed(1)} ${chart.unit}`;
  }
}

function passedTime(): number {
  const now = performance.now();
  if (lastTime === 0) {
    lastTime = now;
    return 0;
  }

  let dt = (now - lastTime) / 1000;
  lastTime = now;

  if (dt > 0.1) dt = 0.1;
  return dt * timeScale;
}

function proceed(obj: PosAtt, dist: number): void {
  const vec = vec3(0, 0, dist);
  rotLtoG(vec, vec, obj.a);
  obj.p.x += vec.x;
  obj.p.y += vec.y;
  obj.p.z += vec.z;
}

function mAhead(dist: number, nextManeuvers: ManeuverState[] = []): ManeuverState {
  return { type: 'AHEAD', dist, initialDist: dist, nextManeuvers };
}

function mPitch(ctr: number, sgn: number, nextManeuvers: ManeuverState[] = []): ManeuverState {
  return { type: 'PITCH', ctr, initialCtr: ctr, sgn, nextManeuvers };
}

function mBank(ctr: number, sgn: number, nextManeuvers: ManeuverState[] = []): ManeuverState {
  return { type: 'BANK', ctr, initialCtr: ctr, sgn, nextManeuvers };
}

function mTurn(ctr: number, sgn: number, nextManeuvers: ManeuverState[] = []): ManeuverState {
  return { type: 'TURN', ctr, initialCtr: ctr, sgn, nextManeuvers };
}

const maneuverCreators = [
  (): ManeuverState => mAhead(1000.0),
  (): ManeuverState => mAhead(300.0, [
    mBank(65536, 1, [
      mAhead(300.0),
    ]),
  ]),
  (): ManeuverState => mAhead(500.0, [
    mPitch(65536, 1, [
      mAhead(500.0),
    ]),
  ]),
  (): ManeuverState => mAhead(450.0, [
    mPitch(12800, 1, [
      mAhead(500.0),
    ]),
  ]),
  (): ManeuverState => mAhead(400.0, [
    mPitch(0x4000, 1, [
      mAhead(50.0, [
        mPitch(0x6000, 1, [
          mBank(0x18000, 1, [
            mPitch(0x6000, 1, [
              mAhead(50.0, [
                mPitch(0x6000, 1, [
                  mBank(0x18000, 1, [
                    mPitch(0x2000, 1, [
                      mAhead(400.0),
                    ]),
                  ]),
                ]),
              ]),
            ]),
          ]),
        ]),
      ]),
    ]),
  ]),
  (): ManeuverState => mAhead(450.0, [
    mBank(12800, 1, [
      mTurn(65536, 1, [
        mBank(12800, -1, [
          mAhead(500.0),
        ]),
      ]),
    ]),
  ]),
];

const maneuverIndexByKey: Record<ManeuverKey, number> = {
  straight: 0,
  roll: 1,
  loop: 2,
  climb: 3,
  eight: 4,
  turn360: 5,
};

function createManeuverByKey(key: ManeuverKey): ManeuverState {
  return maneuverCreators[maneuverIndexByKey[key]]();
}

function pickScenarioManeuverKey(state: AppState): ManeuverKey | null {
  switch (state.runtime.scenario) {
    case 'straight':
    case 'runway':
    case 'signal':
      return 'straight';
    case 'roll':
      return 'roll';
    case 'loop':
    case 'smoke_ribbon':
    case 'smoke_wire':
    case 'smoke_trail':
    case 'smoke_solid':
      return 'loop';
    default:
      return null;
  }
}

function applyScenarioSpawn(state: AppState): boolean {
  switch (state.runtime.scenario) {
    case 'runway':
      state.obj.p = vec3(92.86, state.config.altitude, -900);
      state.obj.a = { h: 0, p: 0, b: 0 };
      state.eye.p = vec3(20, state.config.altitude + 15, -1080);
      state.eye.a = { h: 0, p: 0, b: 0 };
      return true;
    case 'signal':
      state.obj.p = vec3(96, state.config.altitude, 1300);
      state.obj.a = { h: 0, p: 0, b: 0 };
      state.eye.p = vec3(60, state.config.altitude + 25, 1050);
      state.eye.a = { h: 0, p: 0, b: 0 };
      return true;
    default:
      return false;
  }
}

function beginManeuverEffects(maneuver: ManeuverState | null, state: AppState): void {
  if (!maneuver) return;

  if (maneuver.type === 'PITCH' || maneuver.type === 'TURN') {
    beginAppendSmokeNode(state.smokeInst);
    beginAppendSmokeNode(state.vaporInst);
  } else if (maneuver.type === 'BANK') {
    beginAppendSmokeNode(state.vaporInst);
  }
}

function endManeuverEffects(maneuver: ManeuverState | null, state: AppState): void {
  if (!maneuver) return;

  if (maneuver.type === 'PITCH' || maneuver.type === 'TURN') {
    endAppendSmokeNode(state.smokeInst);
    endAppendSmokeNode(state.vaporInst);
  } else if (maneuver.type === 'BANK') {
    endAppendSmokeNode(state.vaporInst);
  }
}

function advanceToNextManeuver(state: AppState): void {
  const current = state.currentManeuver;
  if (!current) return;

  endManeuverEffects(current, state);
  state.currentManeuver = current.nextManeuvers[0] ?? null;
  beginManeuverEffects(state.currentManeuver, state);
}

function stepSimulation(state: AppState, dt: number): void {
  const maneuver = state.currentManeuver;
  if (!maneuver) return;

  state.currentTime += dt;
  const vel = dt * 100.0;

  switch (maneuver.type) {
    case 'AHEAD':
      proceed(state.obj, vel);
      maneuver.dist = (maneuver.dist ?? 0) - vel;
      if ((maneuver.dist ?? 0) <= 0) advanceToNextManeuver(state);
      break;
    case 'PITCH':
      proceed(state.obj, vel);
      pitchUp(state.obj.a, state.obj.a, (maneuver.sgn ?? 1) * dt * 8192, 0);
      appendSmokeNode(state.smokeInst, state.obj, state.currentTime);
      appendSmokeNode(state.vaporInst, state.obj, state.currentTime);
      maneuver.ctr = (maneuver.ctr ?? 0) - dt * 8192;
      if ((maneuver.ctr ?? 0) <= 0) advanceToNextManeuver(state);
      break;
    case 'BANK':
      proceed(state.obj, vel);
      state.obj.a.b += (maneuver.sgn ?? 1) * dt * 32768;
      appendSmokeNode(state.vaporInst, state.obj, state.currentTime);
      maneuver.ctr = (maneuver.ctr ?? 0) - dt * 32768;
      if ((maneuver.ctr ?? 0) <= 0) advanceToNextManeuver(state);
      break;
    case 'TURN':
      appendSmokeNode(state.smokeInst, state.obj, state.currentTime);
      appendSmokeNode(state.vaporInst, state.obj, state.currentTime);
      proceed(state.obj, vel);
      state.obj.a.h += (maneuver.sgn ?? 1) * dt * 8192;
      maneuver.ctr = (maneuver.ctr ?? 0) - dt * 8192;
      if ((maneuver.ctr ?? 0) <= 0) advanceToNextManeuver(state);
      break;
  }
}

function restoreShowFromSnapshot(state: AppState, gpuAircraftList: GpuSrf[]): void {
  const snapshot = state.showSnapshot;
  if (!snapshot) return;

  state.currentTime = 0;
  state.telemetryHistory.length = 0;
  clearSmokeInstance(state.smokeInst);
  clearSmokeInstance(state.vaporInst);
  state.show.aircraft = snapshot.aircraftIndex;
  state.gpuAircraft = gpuAircraftList[state.show.aircraft];
  state.obj = clonePosAtt(snapshot.obj);
  state.eye = clonePosAtt(snapshot.eye);
  state.currentManeuverKey = snapshot.maneuverKey;
  state.currentManeuver = createManeuverByKey(snapshot.maneuverKey);
  beginManeuverEffects(state.currentManeuver, state);
}

function applySeekToProgress(state: AppState, gpuAircraftList: GpuSrf[], ratio: number): void {
  const snapshot = state.showSnapshot;
  if (!snapshot) return;

  restoreShowFromSnapshot(state, gpuAircraftList);
  const targetTime = Math.min(
    clamp01(ratio) * snapshot.totalDuration,
    Math.max(0, snapshot.totalDuration - 0.000001),
  );
  let remaining = targetTime;
  while (!state.quitFlag && remaining >= SIMULATION_STEP) {
    stepSimulation(state, SIMULATION_STEP);
    remaining -= SIMULATION_STEP;
  }
  if (!state.quitFlag && remaining > 0.000001) {
    stepSimulation(state, remaining);
  }
  lastTime = 0;
  timeAccumulator = 0;
}

function startNewShow(state: AppState, gpuAircraftList: GpuSrf[]): void {
  state.currentTime = 0;
  state.telemetryHistory.length = 0;
  clearSmokeInstance(state.smokeInst);
  clearSmokeInstance(state.vaporInst);

  if (state.runtime.forcedAircraftIndex !== null) {
    const clamped = Math.max(0, Math.min(state.aircraft.length - 1, Math.floor(state.runtime.forcedAircraftIndex)));
    state.show.aircraft = clamped;
  } else {
    state.show.aircraft = Math.floor(state.random() * state.aircraft.length);
  }
  state.gpuAircraft = gpuAircraftList[state.show.aircraft];

  if (!applyScenarioSpawn(state)) {
    const dir = Math.floor(state.random() * 0x10000);
    const altitude = state.config.altitude;
    state.obj.p = vec3(
      -500.0 * sin16(dir),
      altitude,
      500.0 * cos16(dir),
    );
    state.obj.a = { h: dir + 0x8000, p: 0, b: 0 };

    const distance = Math.floor(state.random() * 150 + 50);
    const dir2 = Math.floor(state.random() * 0x10000);
    state.eye.p = vec3(
      -distance * sin16(dir2),
      altitude + (state.random() * 50 - 25),
      distance * cos16(dir2),
    );
    state.eye.a = { h: 0, p: 0, b: 0 };
  }

  if (state.runtime.forcedManeuver !== null) {
    state.currentManeuverKey = state.runtime.forcedManeuver;
    state.currentManeuver = createManeuverByKey(state.runtime.forcedManeuver);
  } else {
    state.currentManeuverKey = pickScenarioManeuverKey(state);
    state.currentManeuver = state.currentManeuverKey ? createManeuverByKey(state.currentManeuverKey) : null;
  }
  if (state.currentManeuver === null) {
    const acro = MANEUVER_OPTIONS[Math.floor(state.random() * MANEUVER_OPTIONS.length)];
    state.currentManeuverKey = acro.key;
    state.currentManeuver = createManeuverByKey(acro.key);
  }
  state.showSnapshot = state.currentManeuverKey
    ? {
      aircraftIndex: state.show.aircraft,
      maneuverKey: state.currentManeuverKey,
      obj: clonePosAtt(state.obj),
      eye: clonePosAtt(state.eye),
      totalDuration: maneuverDurationSeconds(state.currentManeuver),
    }
    : null;
  beginManeuverEffects(state.currentManeuver, state);
  if (state.cameraView === 'topDown' && state.topDownMode === 'static') {
    latchTopDownAnchor(state);
  }
  lastTime = 0;
  timeAccumulator = 0;
}

function configureSmokeClass(state: AppState): void {
  state.smokeClass = initSmokeClass(state.config.smokeType);
  state.smokeClass.stp = [1, 2, 4];
  state.smokeClass.bbx = [vec3(200, 200, 200), vec3(500, 500, 500), vec3(500, 500, 500)];

  if (state.config.smokeType === ARS_RIBBONSMOKE) {
    state.smokeClass.rbn = {
      t0: 0.2, t1: 30.0, iniw: 0, maxw: 10, dw: 3,
      inic: { r: 1, g: 1, b: 1 }, endc: { r: 1, g: 1, b: 1 }, tc: 0,
    };
  } else if (state.config.smokeType === ARS_WIRESMOKE) {
    state.smokeClass.wir = {
      t0: 0.2, t1: 30.0, iniw: 0, maxw: 10, dw: 3,
      inic: { r: 1, g: 1, b: 1 }, endc: { r: 1, g: 1, b: 1 }, tc: 0,
    };
  } else if (state.config.smokeType === ARS_TRAILSMOKE) {
    state.smokeClass.trl = {
      t0: 0.2, t1: 30.0, iniw: 0, maxw: 10, dw: 3,
      inic: { r: 1, g: 1, b: 1 }, endc: { r: 1, g: 1, b: 1 }, tc: 0,
    };
  } else if (state.config.smokeType === ARS_SOLIDSMOKE) {
    state.smokeClass.sld = {
      t0: 0.2, t1: 30.0, iniw: 0, maxw: 10, dw: 3,
      inic: { r: 1, g: 1, b: 1 }, endc: { r: 1, g: 1, b: 1 }, tc: 0,
    };
  }

  state.vaporClass = initSmokeClass(ARS_TRAILSMOKE);
  state.vaporClass.trl = {
    t0: 0.1, t1: 1.0, iniw: 10, maxw: 10, dw: 0,
    inic: { r: 1, g: 1, b: 1 }, endc: { r: 1, g: 1, b: 1 }, tc: 0,
  };
}

export function flyByMain(
  state: AppState,
  renderer: Renderer,
  gpuAircraftList: GpuSrf[],
  gpuField: GpuField,
): void {
  if (state.aircraft.length === 0) {
    console.error('No aircraft loaded');
    return;
  }

  state.gpuField = gpuField;

  configureSmokeClass(state);

  state.smokeInst = initSmokeInstance(1000, 100);
  state.vaporInst = initSmokeInstance(100, 10);

  startNewShow(state, gpuAircraftList);

  function mainLoop(): void {
    if (state.quitFlag) return;
    let didSeek = false;
    if (state.restartRequested) {
      state.restartRequested = false;
      startNewShow(state, gpuAircraftList);
    }
    if (state.pendingSeekRatio !== null) {
      applySeekToProgress(state, gpuAircraftList, state.pendingSeekRatio);
      state.pendingSeekRatio = null;
      didSeek = true;
    }

    if (didSeek) {
      drawScreen(state, renderer);
      updateDebugOverlay(state, 0);
    } else if (state.paused) {
      lastTime = 0;
      timeAccumulator = 0;
      drawScreen(state, renderer);
      updateDebugOverlay(state, 0);
    } else {
      const frameDt = passedTime();
      if (frameDt > 0) {
        timeAccumulator += frameDt;
      }

      if (timeAccumulator >= SIMULATION_STEP) {
        drawScreen(state, renderer);
        updateDebugOverlay(state, timeAccumulator);
        while (!state.quitFlag && timeAccumulator >= SIMULATION_STEP) {
          stepSimulation(state, SIMULATION_STEP);
          timeAccumulator -= SIMULATION_STEP;
        }
      }
    }

    if (state.currentManeuver === null) {
      startNewShow(state, gpuAircraftList);
    }

    if (!state.quitFlag) requestAnimationFrame(mainLoop);
  }

  requestAnimationFrame(mainLoop);
}

function drawScreen(
  state: AppState,
  renderer: Renderer,
): void {
  if (state.helpCount > 0) {
    state.helpCount -= 1;
    state.helpOverlay.classList.add('is-visible');
  } else {
    state.helpOverlay.classList.remove('is-visible');
  }

  const renderEye = resolveRenderCamera(state);
  const vec = subV3(state.obj.p, renderEye.p);
  state.renderDebug.targetVecWorld = { ...vec };
  state.renderDebug.cameraPos = { ...renderEye.p };

  const cameraVec = vec3(0, 0, 0);
  const prj = getStdProjection(state.canvas.width, state.canvas.height);
  prj.magx *= 2 * state.cameraPan.zoom;
  prj.magy *= 2 * state.cameraPan.zoom;
  convGtoL(cameraVec, state.obj.p, {
    p: renderEye.p,
    a: renderEye.a,
    t: makeTrigonomy(renderEye.a),
  });
  state.renderDebug.targetVecCamera = { ...cameraVec };
  state.renderDebug.targetVecMatrix = debugViewTransform(state.obj.p, renderEye);
  state.renderDebug.projectionMag = prj.magx;
  if (cameraVec.z > prj.nearz) {
    const screen = { x: 0, y: 0 };
    project(screen, cameraVec, prj);
    state.renderDebug.targetScreen = screen;
  } else {
    state.renderDebug.targetScreen = null;
  }
  const rootPos = { p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } };
  const objRegion = getFieldRegion(state.field, rootPos, state.obj.p);
  const eyeRegion = getFieldRegion(state.field, rootPos, renderEye.p);
  const objElevation = getFieldElevation(state.field, rootPos, state.obj.p, state.obj.a.h);
  const objCollision = getFieldSrfCollision(state.field, rootPos, state.obj.p, 0);
  const referenceScreens: string[] = [];
  const referenceCaptures: Array<{ label: string; x: number | null; y: number | null; clipped: boolean }> = [];
  for (const reference of CAPTURE_REFERENCE_POINTS) {
    const refCam = vec3(0, 0, 0);
    convGtoL(refCam, reference.point, {
      p: renderEye.p,
      a: renderEye.a,
      t: makeTrigonomy(renderEye.a),
    });
    if (refCam.z > prj.nearz) {
      const refScreen = { x: 0, y: 0 };
      project(refScreen, refCam, prj);
      referenceScreens.push(`${reference.label}:${refScreen.x.toFixed(0)},${refScreen.y.toFixed(0)}`);
      referenceCaptures.push({
        label: reference.label,
        x: refScreen.x,
        y: refScreen.y,
        clipped: false,
      });
    } else {
      referenceScreens.push(`${reference.label}:clip`);
      referenceCaptures.push({
        label: reference.label,
        x: null,
        y: null,
        clipped: true,
      });
    }
  }
  state.renderDebug.objectRegion = objRegion.inside ? `${objRegion.id}:${objRegion.tag || '-'}` : '-';
  state.renderDebug.eyeRegion = eyeRegion.inside ? `${eyeRegion.id}:${eyeRegion.tag || '-'}` : '-';
  state.renderDebug.objectElevation = objElevation.inside
    ? `${objElevation.elevation.toFixed(1)} ${objElevation.id}:${objElevation.tag || '-'}`
    : '-';
  state.renderDebug.objectCollision = objCollision.inside
    ? `${objCollision.id}:${objCollision.tag || '-'}`
    : '-';
  state.renderDebug.referenceScreens = referenceScreens.join(' ');

  const smokeVerts = drawSmoke(state.smokeClass, state.smokeInst, state.currentTime, renderEye);
  const vaporVerts = drawSmoke(state.vaporClass, state.vaporInst, state.currentTime, renderEye);

  const snapshot: WorldSnapshot = {
    camera: renderEye,
    cameraZoom: state.cameraPan.zoom,
    environment: state.environment,
    gpuField: state.gpuField,
    dynamicActors: [{
      key: getAircraftLabel(state),
      kind: 'aircraft',
      gpuModel: state.gpuAircraft,
      transform: state.obj,
    }],
    smokeGeometry: smokeVerts,
    vaporGeometry: vaporVerts,
  };

  renderer.render(snapshot);

  (window as Window & {
    __flybyCapture?: unknown;
  }).__flybyCapture = {
    mode: state.config.mode,
    map: state.runtime.mapVariant,
    seed: state.runtime.seed,
    scenario: state.runtime.scenario,
    aircraftIndex: state.show.aircraft,
    maneuver: state.currentManeuver?.type ?? null,
    smokeType: state.config.smokeType,
    cameraView: state.cameraView,
    topDownMode: state.topDownMode,
    object: { position: state.obj.p, attitude: state.obj.a },
    eye: { position: renderEye.p, attitude: renderEye.a },
    cameraTrim: {
      panDeg: cameraPanDegrees(state),
      tiltDeg: cameraTiltDegrees(state),
      zoom: state.cameraPan.zoom,
    },
    smoke: { primary: state.smokeInst.nPth, vapor: state.vaporInst.nPth },
    references: {
      text: state.renderDebug.referenceScreens,
      points: referenceCaptures,
    },
  };
}
