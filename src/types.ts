// FLYBY2 — Core Type Definitions
// Ported from impulse.h (Blue Impulse 3D engine) and ASMOKE.H

// --- Math Primitives ---

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

// 16-bit integer angles: 0x10000 = 360 degrees
export interface Attitude {
  h: number; // heading
  p: number; // pitch
  b: number; // bank
}

export interface TrigCache {
  sinh: number; cosh: number;
  sinp: number; cosp: number;
  sinb: number; cosb: number;
}

export interface PosAtt {
  p: Vec3;
  a: Attitude;
}

export interface Axis {
  p: Vec3;
  a: Attitude;
  t: TrigCache;
}

// Color normalized to 0-1 (original BICOLOR was unsigned g,r,b in GRB order)
export interface Color {
  r: number;
  g: number;
  b: number;
}

// Screen-space point
export interface ScreenPoint {
  x: number;
  y: number;
}

// Perspective projection parameters
export interface Projection {
  lx: number;
  ly: number;
  cx: number;
  cy: number;
  magx: number;
  magy: number;
  nearz: number;
  farz: number;
}

// --- SRF Model ---

export interface SrfVertex {
  pos: Vec3;
  normal: Vec3;
  smoothFlag: number; // BI_ON = participates in smooth shading
}

export interface SrfPolygon {
  backFaceRemove: number;
  color: Color;
  normal: Vec3;
  center: Vec3;
  vertexIds: number[];
  bright: number; // BI_ON = unlit
  nVt: number;
}

export interface SrfModel {
  bbox: Vec3[];
  nv: number;
  vertices: SrfVertex[];
  np: number;
  polygons: SrfPolygon[];
}

// --- PC2 (2D Picture) ---

export type Pc2ObjectType = 'PST' | 'PLL' | 'LSQ' | 'PLG';

export interface Pc2Object {
  type: Pc2ObjectType;
  color: Color;
  visiDist: number;
  vertices: Vec2[];
  center: Vec2;
}

export interface Pc2 {
  min: Vec2;
  max: Vec2;
  objects: Pc2Object[];
}

// --- Terrain ---

export interface TerrainBlock {
  y: number;
  lup: number;
  col: Color[];
  vis: number[];
}

export interface Terrain {
  xSiz: number;
  zSiz: number;
  xWid: number;
  zWid: number;
  blocks: TerrainBlock[];
  side: number[];
  sdCol: Color[];
}

// --- Field Scene ---

export interface FieldSrf {
  pos: PosAtt;
  srf: SrfModel;
  fn: string;
  id: number;
  tag: string;
  lodDist: number;
}

export interface FieldPc2 {
  pos: PosAtt;
  pc2: Pc2;
  fn: string;
  lodDist: number;
}

export interface FieldTer {
  pos: PosAtt;
  ter: Terrain;
  fn: string;
  id: number;
  tag: string;
  lodDist: number;
}

export interface FieldRgn {
  pos: PosAtt;
  min: Vec2;
  max: Vec2;
  id: number;
  tag: string;
}

export interface FieldFld {
  pos: PosAtt;
  fld: Field;
  fn: string;
  lodDist: number;
}

export interface Field {
  sky: Color;
  gnd: Color;
  srf: FieldSrf[];
  ter: FieldTer[];
  pc2: FieldPc2[];
  plt: FieldPc2[];
  rgn: FieldRgn[];
  fld: FieldFld[];
}

// --- Smoke System ---

export interface SmokeAttr {
  t0: number;
  t1: number;
  iniw: number;
  maxw: number;
  dw: number;
  inic: Color;
  endc: Color;
  tc: number;
}

export interface SmokeNode {
  axs: Axis;
  left: Vec3;
  up: Vec3;
  t: number;
}

export const ARS_MAX_TIP_PER_INST = 8;

export interface SmokeInst {
  nMax: number;
  nDel: number;
  nPth: number;
  nTip: number;
  tip: Int32Array;
  pth: SmokeNode[];
}

export interface SmokeClass {
  stp: number[];
  bbx: Vec3[];
  sw: number;
  rbn: SmokeAttr;
  wir: SmokeAttr;
  trl: SmokeAttr;
  sld: SmokeAttr;
}

export const ARS_RIBBONSMOKE = 1;
export const ARS_WIRESMOKE = 2;
export const ARS_TRAILSMOKE = 4;
export const ARS_SOLIDSMOKE = 8;

// --- Constants ---

export const BI_OFF = 0;
export const BI_ON = 1;
export const BI_OK = 1;
export const BI_ERR = 0;

export const YSPI = 3.14159265;
export const YSEPS = 0.0001;

export const BiOrgP: Vec3 = { x: 0, y: 0, z: 0 };
export const BiVecX: Vec3 = { x: 1, y: 0, z: 0 };
export const BiVecY: Vec3 = { x: 0, y: 1, z: 0 };
export const BiVecZ: Vec3 = { x: 0, y: 0, z: 1 };
export const BiOrgPA: PosAtt = { p: { x: 0, y: 0, z: 0 }, a: { h: 0, p: 0, b: 0 } };

export const BiBlack:   Color = { r: 0, g: 0, b: 0 };
export const BiBlue:    Color = { r: 0, g: 0, b: 1 };
export const BiRed:     Color = { r: 1, g: 0, b: 0 };
export const BiGreen:   Color = { r: 0, g: 1, b: 0 };
export const BiCyan:    Color = { r: 0, g: 1, b: 1 };
export const BiYellow:  Color = { r: 1, g: 1, b: 0 };
export const BiMagenta: Color = { r: 1, g: 0, b: 1 };
export const BiWhite:   Color = { r: 1, g: 1, b: 1 };

// --- GPU Vertex Format ---

export interface GpuSrf {
  oneSided: GpuPrimitive;
  twoSided: GpuPrimitive;
}

export interface GpuField {
  sceneLit: GpuPrimitive;
  sceneShadow: GpuPrimitive;
  sceneUnlit: GpuPrimitive;
  sceneLines: GpuPrimitive;
  scenePoints: GpuPrimitive;
  overlayUnlit: GpuPrimitive;
  overlayLines: GpuPrimitive;
  overlayPoints: GpuPrimitive;
  sceneLitBufferSize: number;
  sceneShadowBufferSize: number;
  sceneUnlitBufferSize: number;
  sceneLinesBufferSize: number;
  scenePointsBufferSize: number;
  overlayUnlitBufferSize: number;
  overlayLinesBufferSize: number;
  overlayPointsBufferSize: number;
}

export interface GpuPrimitive {
  buffer: GPUBuffer;
  vertexCount: number;
}

export const VERTEX_STRIDE = 13; // floats per lit vertex

// --- Config ---

export interface Config {
  mode: FlybyMode;
  fieldFile: string;
  aircraft: string[];
  altitude: number;
  smokeType: number;
}

export type FlybyMode = 'flyby2' | 'flyby2_s';
export type AppMode = 'scriptedFlyby' | 'freeFlight' | 'drive';
export type MapVariant = 'airport' | 'airport-improved' | 'airport-night' | 'downtown';
export type SkyMode = 'clear' | 'night' | 'hazy';
export type CameraMode = 'chase' | 'orbit' | 'cockpit';
export type VehicleKind = 'aircraft' | 'car';

export interface SkySettings {
  mode: SkyMode;
  topColor: Color;
  horizonColor: Color;
  bottomColor: Color;
  curve: number;
  glow: number;
}

export interface CloudSettings {
  color: Color;
  shadowColor: Color;
  coverage: number;
  softness: number;
  scale: number;
  bandScale: number;
  speed: number;
  density: number;
  height: number;
}

export interface DirectionalLightSettings {
  direction: Vec3;
  color: Color;
  intensity: number;
  shadowStrength: number;
}

export interface HemisphereLightSettings {
  skyColor: Color;
  groundColor: Color;
  intensity: number;
  balance: number;
}

export interface FogSettings {
  color: Color;
  start: number;
  end: number;
  density: number;
  heightFalloff: number;
}

export interface GroundMaterialSettings {
  primary: Color;
  secondary: Color;
  accent: Color;
  paved: Color;
  detailScale: number;
  breakupScale: number;
  stripScale: number;
  patchScale: number;
  pavementBias: number;
  shoulderDepth: number;
}

export interface EmissiveAccentSettings {
  color: Color;
  strength: number;
  threshold: number;
  saturationBoost: number;
}

export interface MapEnvironment {
  key: MapVariant;
  sky: SkySettings;
  cloud: CloudSettings;
  keyLight: DirectionalLightSettings;
  hemisphere: HemisphereLightSettings;
  fog: FogSettings;
  ground: GroundMaterialSettings;
  emissive: EmissiveAccentSettings;
}
export type CaptureScenario =
  | 'straight'
  | 'roll'
  | 'loop'
  | 'runway'
  | 'signal'
  | 'smoke_ribbon'
  | 'smoke_wire'
  | 'smoke_trail'
  | 'smoke_solid';

export type ManeuverKey = 'straight' | 'roll' | 'loop' | 'climb' | 'eight' | 'turn360';

export interface RuntimeOptions {
  appMode: AppMode;
  mode: FlybyMode;
  mapVariant: MapVariant;
  seed: number | null;
  scenario: CaptureScenario | null;
  forcedAircraftIndex: number | null;
  forcedManeuver: ManeuverKey | null;
  smokeOverride: number | null;
}

export interface VehicleCommand {
  throttle: number;
  brake: number;
  steer: number;
  pitch: number;
  roll: number;
  yaw: number;
  handbrake: number;
  boost: number;
  reset: boolean;
}

export interface VehicleCameraRigSpec {
  chaseDistance: number;
  chaseHeight: number;
  chaseLead: number;
  orbitDistance: number;
  cockpitOffset: Vec3;
  damping: number;
}

export interface AircraftDynamicsSpec {
  minSpeed: number;
  cruiseSpeed: number;
  maxSpeed: number;
  thrust: number;
  boostThrust: number;
  liftPower: number;
  drag: number;
  sideDrag: number;
  pitchRate: number;
  rollRate: number;
  yawRate: number;
  stallSpeed: number;
  stallAngleDeg: number;
}

export interface VehicleWheelSpec {
  localPosition: Vec3;
  radius: number;
  suspensionRestLength: number;
}

export interface CarDynamicsSpec {
  engineForce: number;
  brakeForce: number;
  reverseForce: number;
  handbrakeForce: number;
  steerAngleDeg: number;
  suspensionStiffness: number;
  suspensionDamping: number;
  rideHeight: number;
  maxSpeed: number;
  lateralGrip: number;
  longitudinalGrip: number;
  wheels: VehicleWheelSpec[];
}

export interface VehicleSpec {
  key: string;
  label: string;
  kind: VehicleKind;
  modelFile: string;
  mass: number;
  inertia: Vec3;
  collisionHalfExtents: Vec3;
  camera: VehicleCameraRigSpec;
  aircraft?: AircraftDynamicsSpec;
  car?: CarDynamicsSpec;
}

export interface VehicleState {
  spec: VehicleSpec;
  position: Vec3;
  attitude: Attitude;
  linearVelocity: Vec3;
  angularVelocity: Vec3;
  grounded: boolean;
  throttle: number;
  brake: number;
  steer: number;
  boost: number;
  engineRpm: number;
  gear: number;
  stall: number;
  aoaDeg: number;
  wheelCompression: number[];
  wheelGrounded: boolean[];
}

export interface CameraPose {
  posAtt: PosAtt;
  target: Vec3;
  distance: number;
  zoom: number;
}

export interface DynamicActorSnapshot {
  key: string;
  kind: VehicleKind;
  gpuModel: GpuSrf;
  transform: PosAtt;
}

export interface WorldSnapshot {
  camera: PosAtt;
  cameraZoom: number;
  environment: MapEnvironment;
  gpuField: GpuField;
  dynamicActors: DynamicActorSnapshot[];
  smokeGeometry: { lit: Float32Array; lines: Float32Array };
  vaporGeometry: { lit: Float32Array; lines: Float32Array };
}

// --- Application State ---

export interface ShowObj {
  aircraft: number;
}

export type ManeuverType = 'AHEAD' | 'PITCH' | 'BANK' | 'TURN';

export interface ManeuverState {
  type: ManeuverType;
  dist?: number;
  ctr?: number;
  sgn?: number;
  initialDist?: number;
  initialCtr?: number;
  nextManeuvers: ManeuverState[];
}

export interface TelemetrySample {
  time: number;
  altitude: number;
  pitchDeg: number;
  bankDeg: number;
  headingDeg: number;
  range: number;
  progress: number;
  smokeCount: number;
  vaporCount: number;
}

export interface DebugPanelRefs {
  mapSelect: HTMLSelectElement;
  aircraftSelect: HTMLSelectElement;
  maneuverSelect: HTMLSelectElement;
  randomizeButton: HTMLButtonElement;
  previousManeuverButton: HTMLButtonElement;
  pauseButton: HTMLButtonElement;
  nextManeuverButton: HTMLButtonElement;
  screenshotButton: HTMLButtonElement;
  cameraPanRange: HTMLInputElement;
  cameraTiltRange: HTMLInputElement;
  cameraZoomRange: HTMLInputElement;
  cameraPanValue: HTMLSpanElement;
  cameraTiltValue: HTMLSpanElement;
  cameraZoomValue: HTMLSpanElement;
  cameraResetButton: HTMLButtonElement;
  progressTrack: HTMLDivElement;
  progressThumb: HTMLDivElement;
  progressFill: HTMLDivElement;
  progressValue: HTMLSpanElement;
  progressLabel: HTMLSpanElement;
  attitudeHorizon: HTMLDivElement;
  attitudePitchScale: HTMLDivElement;
  attitudeBankBug: HTMLDivElement;
  headingScale: HTMLDivElement;
  values: Record<string, HTMLElement>;
  chartPaths: Record<string, SVGPathElement>;
  chartValues: Record<string, HTMLElement>;
}

export interface ShowSnapshot {
  aircraftIndex: number;
  maneuverKey: ManeuverKey;
  obj: PosAtt;
  eye: PosAtt;
  totalDuration: number;
}

export interface AppState {
  quitFlag: boolean;
  paused: boolean;
  helpCount: number;
  debugOverlayVisible: boolean;
  currentTime: number;
  config: Config;
  runtime: RuntimeOptions;
  random: () => number;
  aircraft: SrfModel[];
  aircraftLabels: string[];
  field: Field;
  environment: MapEnvironment;
  smokeClass: SmokeClass;
  vaporClass: SmokeClass;
  smokeInst: SmokeInst;
  vaporInst: SmokeInst;
  altitude: number;
  canvas: HTMLCanvasElement;
  debugOverlay: HTMLDivElement;
  helpOverlay: HTMLDivElement;
  fpsSampleTime: number;
  fpsFrameCount: number;
  fps: number;
  restartRequested: boolean;
  telemetryHistory: TelemetrySample[];
  telemetryMaxSamples: number;
  debugPanel: DebugPanelRefs | null;
  showSnapshot: ShowSnapshot | null;
  pendingSeekRatio: number | null;
  renderDebug: {
    targetVecWorld: Vec3;
    targetVecCamera: Vec3;
    targetVecMatrix: Vec3;
    targetScreen: ScreenPoint | null;
    projectionMag: number;
    objectRegion: string;
    eyeRegion: string;
    objectElevation: string;
    objectCollision: string;
    mode: string;
    seed: string;
    scenario: string;
    referenceScreens: string;
  };
  cameraPan: {
    heading: number;
    pitch: number;
    zoom: number;
    dragging: boolean;
    pointerId: number | null;
    lastX: number;
    lastY: number;
  };

  // Maneuver state
  show: ShowObj;
  obj: PosAtt;
  eye: PosAtt;
  gpuAircraft: GpuSrf;
  gpuField: GpuField;
  currentManeuverKey: ManeuverKey | null;
  currentManeuver: ManeuverState | null;
}
