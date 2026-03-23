import type {
  AppMode,
  Attitude,
  CameraMode,
  CameraPose,
  DynamicActorSnapshot,
  Field,
  GpuField,
  GpuSrf,
  MapEnvironment,
  PosAtt,
  SrfModel,
  VehicleCommand,
  VehicleSpec,
  VehicleState,
  Vec3,
  WorldSnapshot,
} from "./types";
import {
  convLtoG,
  cos16,
  makeTrigonomy,
  rotFastLtoG,
  rotGtoL,
  sin16,
  vec3,
  vectorToHeadPitch,
} from "./math";
import {
  clampCameraPitch,
  downloadFrame,
  DebugInputController,
  GameplayInputController,
  wrapAngle16,
} from "./input";
import { Renderer } from "./renderer";
import { WorldQueryService } from "./world-query";

const FIXED_STEP = 1 / 120;
const ANGLE16_PER_DEGREE = 0x10000 / 360;
const RAD_TO_DEG = 180 / Math.PI;

interface ModelAsset {
  model: SrfModel;
  gpu: GpuSrf;
}

export interface GameRuntimeOptions {
  appMode: Exclude<AppMode, "scriptedFlyby">;
  renderer: Renderer;
  canvas: HTMLCanvasElement;
  hudRoot: HTMLDivElement;
  helpOverlay: HTMLDivElement;
  environment: MapEnvironment;
  field: Field;
  gpuField: GpuField;
  initialAltitude: number;
  modelsByFile: Map<string, ModelAsset>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function expDamp(current: number, target: number, lambda: number, dt: number): number {
  const t = 1 - Math.exp(-lambda * dt);
  return lerp(current, target, t);
}

function addVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function mulVec3(value: Vec3, scalar: number): Vec3 {
  return { x: value.x * scalar, y: value.y * scalar, z: value.z * scalar };
}

function dotVec3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function lengthVec3(value: Vec3): number {
  return Math.hypot(value.x, value.y, value.z);
}

function normalizeVec3(value: Vec3): Vec3 {
  const length = lengthVec3(value);
  if (length <= 1e-6) {
    return { x: 0, y: 0, z: 1 };
  }
  return {
    x: value.x / length,
    y: value.y / length,
    z: value.z / length,
  };
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
  };
}

function degreesToAngle16(degrees: number): number {
  return degrees * ANGLE16_PER_DEGREE;
}

function angle16ToDegrees(angle: number): number {
  return angle / ANGLE16_PER_DEGREE;
}

function lerpAngle16(current: number, target: number, t: number): number {
  let delta = wrapAngle16(target - current);
  if (delta > 0x8000) {
    delta -= 0x10000;
  }
  return wrapAngle16(current + delta * t);
}

function transformDirection(attitude: Attitude, local: Vec3): Vec3 {
  const world = vec3(0, 0, 0);
  rotFastLtoG(world, local, makeTrigonomy(attitude));
  return world;
}

function flattenXZ(value: Vec3): Vec3 {
  return normalizeVec3({ x: value.x, y: 0, z: value.z });
}

function basisFromAttitude(attitude: Attitude): { forward: Vec3; right: Vec3; up: Vec3 } {
  const trig = makeTrigonomy(attitude);
  const forward = vec3(0, 0, 0);
  const right = vec3(0, 0, 0);
  const up = vec3(0, 0, 0);
  rotFastLtoG(forward, vec3(0, 0, 1), trig);
  rotFastLtoG(right, vec3(1, 0, 0), trig);
  rotFastLtoG(up, vec3(0, 1, 0), trig);
  return { forward, right, up };
}

function localVelocity(linearVelocity: Vec3, attitude: Attitude): Vec3 {
  const local = vec3(0, 0, 0);
  rotGtoL(local, linearVelocity, attitude);
  return local;
}

function posAttFromState(state: VehicleState): PosAtt {
  return {
    p: { ...state.position },
    a: { ...state.attitude },
  };
}

function emptySmokeGeometry(): { lit: Float32Array; lines: Float32Array } {
  return {
    lit: new Float32Array(0),
    lines: new Float32Array(0),
  };
}

const AIRCRAFT_SPEC: VehicleSpec = {
  key: "freeflight-f16",
  label: "F-16 Free Flight",
  kind: "aircraft",
  modelFile: "f16.srf",
  mass: 12000,
  inertia: { x: 4800, y: 3600, z: 5200 },
  collisionHalfExtents: { x: 7.5, y: 2.8, z: 8.5 },
  camera: {
    chaseDistance: 52,
    chaseHeight: 15,
    chaseLead: 18,
    orbitDistance: 46,
    cockpitOffset: { x: 0, y: 2.1, z: 2.3 },
    damping: 5.5,
  },
  aircraft: {
    minSpeed: 40,
    cruiseSpeed: 110,
    maxSpeed: 230,
    thrust: 150000,
    boostThrust: 55000,
    liftPower: 12,
    drag: 0.045,
    sideDrag: 0.22,
    pitchRate: 68,
    rollRate: 120,
    yawRate: 35,
    stallSpeed: 55,
    stallAngleDeg: 16,
  },
};

const CAR_SPEC: VehicleSpec = {
  key: "formula-car",
  label: "F1 Drive",
  kind: "car",
  modelFile: "f1.srf",
  mass: 820,
  inertia: { x: 1600, y: 900, z: 1500 },
  collisionHalfExtents: { x: 0.95, y: 0.7, z: 2.25 },
  camera: {
    chaseDistance: 10,
    chaseHeight: 3.5,
    chaseLead: 5,
    orbitDistance: 8.5,
    cockpitOffset: { x: 0, y: 1.05, z: 0.35 },
    damping: 8,
  },
  car: {
    engineForce: 10500,
    brakeForce: 14500,
    reverseForce: 5200,
    handbrakeForce: 3200,
    steerAngleDeg: 26,
    suspensionStiffness: 42000,
    suspensionDamping: 5200,
    rideHeight: 0.62,
    maxSpeed: 96,
    lateralGrip: 5.5,
    longitudinalGrip: 2.3,
    wheels: [
      { localPosition: { x: -0.85, y: -0.55, z: 1.65 }, radius: 0.34, suspensionRestLength: 0.28 },
      { localPosition: { x: 0.85, y: -0.55, z: 1.65 }, radius: 0.34, suspensionRestLength: 0.28 },
      { localPosition: { x: -0.82, y: -0.55, z: -1.35 }, radius: 0.36, suspensionRestLength: 0.3 },
      { localPosition: { x: 0.82, y: -0.55, z: -1.35 }, radius: 0.36, suspensionRestLength: 0.3 },
    ],
  },
};

function pickVehicleSpec(mode: Exclude<AppMode, "scriptedFlyby">): VehicleSpec {
  return mode === "drive" ? CAR_SPEC : AIRCRAFT_SPEC;
}

function fallbackAsset(spec: VehicleSpec, modelsByFile: Map<string, ModelAsset>): ModelAsset {
  const direct = modelsByFile.get(spec.modelFile);
  if (direct) return direct;
  const first = modelsByFile.values().next().value as ModelAsset | undefined;
  if (!first) {
    throw new Error("No vehicle models were loaded for gameplay modes");
  }
  return first;
}

export class GameRuntime {
  private readonly options: GameRuntimeOptions;

  private readonly worldQuery: WorldQueryService;

  private readonly gameplayInput: GameplayInputController;

  private readonly debugInput: DebugInputController;

  private readonly spec: VehicleSpec;

  private readonly asset: ModelAsset;

  private readonly actor: DynamicActorSnapshot;

  private vehicle: VehicleState;

  private previousPose: PosAtt;

  private cameraMode: CameraMode = "chase";

  private cameraPose: CameraPose;

  private paused = false;

  private accumulator = 0;

  private lastTime = 0;

  constructor(options: GameRuntimeOptions) {
    this.options = options;
    this.worldQuery = new WorldQueryService(options.field);
    this.gameplayInput = new GameplayInputController();
    this.debugInput = new DebugInputController(options.canvas);
    this.spec = pickVehicleSpec(options.appMode);
    this.asset = fallbackAsset(this.spec, options.modelsByFile);
    this.vehicle = this.createVehicleState();
    this.previousPose = posAttFromState(this.vehicle);
    this.cameraPose = {
      posAtt: posAttFromState(this.vehicle),
      target: { ...this.vehicle.position },
      distance: this.spec.camera.chaseDistance,
      zoom: 1,
    };
    this.actor = {
      key: this.spec.key,
      kind: this.spec.kind,
      gpuModel: this.asset.gpu,
      transform: posAttFromState(this.vehicle),
    };
    this.options.hudRoot.className = "game-console";
    this.options.helpOverlay.textContent =
      "P pause  C camera  drag trim  wheel zoom  R reset  T capture";
    this.options.helpOverlay.classList.add("is-visible");
  }

  start(): void {
    requestAnimationFrame(this.mainLoop);
  }

  private readonly mainLoop = (timestamp: number): void => {
    if (this.lastTime === 0) {
      this.lastTime = timestamp;
    }

    const frameDt = Math.min(0.1, (timestamp - this.lastTime) / 1000);
    this.lastTime = timestamp;
    this.processDebugInput();

    if (!this.paused) {
      this.accumulator += frameDt;
      while (this.accumulator >= FIXED_STEP) {
        this.previousPose = posAttFromState(this.vehicle);
        this.step(FIXED_STEP);
        this.accumulator -= FIXED_STEP;
      }
    }

    this.render(this.accumulator / FIXED_STEP);
    requestAnimationFrame(this.mainLoop);
  };

  private processDebugInput(): void {
    if (this.debugInput.consumePauseToggle()) {
      this.paused = !this.paused;
    }
    if (this.debugInput.consumeScreenshot()) {
      downloadFrame(this.options.canvas);
    }
    if (this.debugInput.consumeCycleCamera()) {
      this.cameraMode =
        this.cameraMode === "chase" ? "orbit" : this.cameraMode === "orbit" ? "cockpit" : "chase";
    }
    if (this.debugInput.consumeResetVehicle()) {
      this.debugInput.resetCameraTrim();
      this.vehicle = this.createVehicleState();
      this.previousPose = posAttFromState(this.vehicle);
    }
  }

  private createVehicleState(): VehicleState {
    const spec = this.spec;
    if (spec.kind === "aircraft") {
      return {
        spec,
        position: { x: 92.86, y: Math.max(this.options.initialAltitude + 55, 170), z: -420 },
        attitude: { h: 0, p: 0, b: 0 },
        linearVelocity: { x: 0, y: 0, z: spec.aircraft?.cruiseSpeed ?? 100 },
        angularVelocity: { x: 0, y: 0, z: 0 },
        grounded: false,
        throttle: 0.72,
        brake: 0,
        steer: 0,
        boost: 0,
        engineRpm: 4500,
        gear: 1,
        stall: 0,
        aoaDeg: 0,
        wheelCompression: [],
        wheelGrounded: [],
      };
    }

    const rideHeight = spec.car?.rideHeight ?? 0.6;
    const spawn = this.worldQuery.fitPointToGround({ x: 92.86, y: 0, z: 19.84 }, rideHeight);
    return {
      spec,
      position: spawn,
      attitude: { h: 0, p: 0, b: 0 },
      linearVelocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
      grounded: true,
      throttle: 0,
      brake: 0,
      steer: 0,
      boost: 0,
      engineRpm: 1200,
      gear: 1,
      stall: 0,
      aoaDeg: 0,
      wheelCompression: Array.from({ length: spec.car?.wheels.length ?? 0 }, () => 0),
      wheelGrounded: Array.from({ length: spec.car?.wheels.length ?? 0 }, () => true),
    };
  }

  private step(dt: number): void {
    const command = this.gameplayInput.sample(this.vehicle.spec.kind);
    if (this.vehicle.spec.kind === "aircraft") {
      this.stepAircraft(command, dt);
    } else {
      this.stepCar(command, dt);
    }
    this.updateCamera(dt);
  }

  private stepAircraft(command: VehicleCommand, dt: number): void {
    const spec = this.vehicle.spec.aircraft;
    if (!spec) return;

    const localVel = localVelocity(this.vehicle.linearVelocity, this.vehicle.attitude);
    const speed = lengthVec3(this.vehicle.linearVelocity);
    const forwardSpeed = localVel.z;
    const aoaDeg = Math.atan2(-localVel.y, Math.max(8, Math.abs(forwardSpeed))) * RAD_TO_DEG;
    const stallByAngle = clamp((Math.abs(aoaDeg) - spec.stallAngleDeg) / spec.stallAngleDeg, 0, 1);
    const stallBySpeed = clamp((spec.stallSpeed - forwardSpeed) / spec.stallSpeed, 0, 1);
    const stall = Math.max(stallByAngle, stallBySpeed);
    const controlAuthority = 1 - stall * 0.7;

    this.vehicle.throttle = clamp(lerp(this.vehicle.throttle, command.throttle, dt * 2.5), 0, 1);
    this.vehicle.boost = command.boost;
    this.vehicle.brake = command.brake;

    const targetYawRate = command.yaw * spec.yawRate * controlAuthority;
    const targetPitchRate = command.pitch * spec.pitchRate * controlAuthority;
    const targetRollRate = command.roll * spec.rollRate * controlAuthority;
    this.vehicle.angularVelocity.x = expDamp(this.vehicle.angularVelocity.x, targetYawRate, 5, dt);
    this.vehicle.angularVelocity.y = expDamp(
      this.vehicle.angularVelocity.y,
      targetPitchRate,
      5,
      dt
    );
    this.vehicle.angularVelocity.z = expDamp(this.vehicle.angularVelocity.z, targetRollRate, 6, dt);

    this.vehicle.attitude.h = wrapAngle16(
      this.vehicle.attitude.h + degreesToAngle16(this.vehicle.angularVelocity.x * dt)
    );
    this.vehicle.attitude.p = clampCameraPitch(
      this.vehicle.attitude.p + degreesToAngle16(this.vehicle.angularVelocity.y * dt)
    );
    this.vehicle.attitude.b = wrapAngle16(
      this.vehicle.attitude.b + degreesToAngle16(this.vehicle.angularVelocity.z * dt)
    );

    const thrust = spec.thrust * this.vehicle.throttle + spec.boostThrust * this.vehicle.boost;
    const liftScale = clamp(1 - stall * 0.9, 0.08, 1);
    const localForce = {
      x: -localVel.x * spec.sideDrag * Math.max(16, speed),
      y: forwardSpeed * forwardSpeed * spec.liftPower * liftScale - localVel.y * spec.drag * 180,
      z: thrust - Math.sign(localVel.z || 1) * localVel.z * localVel.z * spec.drag * 180,
    };
    if (stall > 0.2) {
      localForce.y -= stall * 36000;
    }

    const worldForce = transformDirection(this.vehicle.attitude, localForce);
    worldForce.y -= this.vehicle.spec.mass * 9.81;
    const acceleration = mulVec3(worldForce, 1 / this.vehicle.spec.mass);
    this.vehicle.linearVelocity = addVec3(this.vehicle.linearVelocity, mulVec3(acceleration, dt));

    const maxSpeed = spec.maxSpeed + this.vehicle.boost * 35;
    const newSpeed = lengthVec3(this.vehicle.linearVelocity);
    if (newSpeed > maxSpeed) {
      this.vehicle.linearVelocity = mulVec3(normalizeVec3(this.vehicle.linearVelocity), maxSpeed);
    }

    const ground = this.worldQuery.sampleGround(this.vehicle.position);
    let nextPosition = addVec3(this.vehicle.position, mulVec3(this.vehicle.linearVelocity, dt));
    nextPosition = this.resolveObstacleCollision(nextPosition, 3.5);
    if (ground.hit && nextPosition.y <= ground.height + 6) {
      nextPosition.y = ground.height + 6;
      this.vehicle.linearVelocity.y = Math.max(0, this.vehicle.linearVelocity.y);
      this.vehicle.grounded = true;
    } else {
      this.vehicle.grounded = false;
    }

    this.vehicle.position = nextPosition;
    this.vehicle.engineRpm = 1400 + Math.max(0, forwardSpeed) * 55;
    this.vehicle.aoaDeg = aoaDeg;
    this.vehicle.stall = stall;
  }

  private stepCar(command: VehicleCommand, dt: number): void {
    const spec = this.vehicle.spec.car;
    if (!spec) return;

    this.vehicle.throttle = command.throttle;
    this.vehicle.brake = command.brake;
    this.vehicle.steer = command.steer;
    this.vehicle.boost = command.handbrake;

    const forwardFlat = {
      x: -sin16(this.vehicle.attitude.h),
      y: 0,
      z: cos16(this.vehicle.attitude.h),
    };
    const rightFlat = {
      x: forwardFlat.z,
      y: 0,
      z: -forwardFlat.x,
    };

    const forwardSpeed = dotVec3(this.vehicle.linearVelocity, forwardFlat);
    const lateralSpeed = dotVec3(this.vehicle.linearVelocity, rightFlat);
    let driveForce = command.throttle * spec.engineForce;
    if (command.brake > 0.05) {
      if (Math.abs(forwardSpeed) < 2 && command.throttle < 0.1) {
        driveForce -= command.brake * spec.reverseForce;
      } else {
        driveForce -= Math.sign(forwardSpeed || 1) * spec.brakeForce * command.brake;
      }
    }
    if (command.handbrake > 0.05) {
      driveForce -= Math.sign(forwardSpeed || 1) * spec.handbrakeForce * command.handbrake * 0.4;
    }

    const dragForward = -forwardSpeed * 1.9;
    const dragLateral = -lateralSpeed * spec.lateralGrip * (command.handbrake > 0.05 ? 0.24 : 1);
    const forwardAccel = driveForce / this.vehicle.spec.mass + dragForward;
    const lateralAccel = dragLateral;
    let newVelocity = addVec3(
      this.vehicle.linearVelocity,
      addVec3(mulVec3(forwardFlat, forwardAccel * dt), mulVec3(rightFlat, lateralAccel * dt))
    );

    const flatSpeed = lengthVec3({ x: newVelocity.x, y: 0, z: newVelocity.z });
    if (flatSpeed > spec.maxSpeed) {
      const flat = flattenXZ(newVelocity);
      newVelocity = {
        x: flat.x * spec.maxSpeed,
        y: newVelocity.y,
        z: flat.z * spec.maxSpeed,
      };
    }

    const steerAuthority = clamp(flatSpeed / 16, 0.15, 1);
    const yawRateTarget =
      command.steer * spec.steerAngleDeg * steerAuthority * (1 + command.handbrake * 0.35) * 3.2;
    this.vehicle.angularVelocity.x = expDamp(this.vehicle.angularVelocity.x, yawRateTarget, 7, dt);
    this.vehicle.attitude.h = wrapAngle16(
      this.vehicle.attitude.h + degreesToAngle16(this.vehicle.angularVelocity.x * dt)
    );

    const wheelHeights: number[] = [];
    let compressionTotal = 0;
    let groundedCount = 0;
    const trig = makeTrigonomy(this.vehicle.attitude);
    spec.wheels.forEach((wheel, index) => {
      const mount = vec3(0, 0, 0);
      convLtoG(mount, wheel.localPosition, {
        p: this.vehicle.position,
        a: this.vehicle.attitude,
        t: trig,
      });
      const sample = this.worldQuery.sampleGround(mount);
      const wheelBottom = mount.y - (wheel.radius + wheel.suspensionRestLength);
      const compression = sample.hit
        ? clamp((sample.height - wheelBottom) / wheel.suspensionRestLength, 0, 1)
        : 0;
      this.vehicle.wheelCompression[index] = compression;
      this.vehicle.wheelGrounded[index] = sample.hit && compression > 0;
      compressionTotal += compression;
      if (sample.hit) {
        wheelHeights.push(sample.height + wheel.radius);
      }
      if (this.vehicle.wheelGrounded[index]) {
        groundedCount += 1;
      }
    });

    const avgWheelHeight =
      wheelHeights.length > 0
        ? wheelHeights.reduce((sum, value) => sum + value, 0) / wheelHeights.length
        : this.vehicle.position.y - spec.rideHeight;
    const avgCompression = spec.wheels.length > 0 ? compressionTotal / spec.wheels.length : 0;

    let nextPosition = addVec3(this.vehicle.position, mulVec3(newVelocity, dt));
    nextPosition = this.resolveObstacleCollision(nextPosition, 1.5);
    nextPosition.y = avgWheelHeight + spec.rideHeight + avgCompression * 0.12;
    nextPosition = this.worldQuery.constrainPointAboveGround(nextPosition, spec.rideHeight);
    this.vehicle.position = nextPosition;
    this.vehicle.linearVelocity = {
      x: newVelocity.x,
      y: 0,
      z: newVelocity.z,
    };
    this.vehicle.grounded = groundedCount > 0;

    const frontAverage =
      ((this.vehicle.wheelCompression[0] ?? 0) + (this.vehicle.wheelCompression[1] ?? 0)) * 0.5;
    const rearAverage =
      ((this.vehicle.wheelCompression[2] ?? 0) + (this.vehicle.wheelCompression[3] ?? 0)) * 0.5;
    const leftAverage =
      ((this.vehicle.wheelCompression[0] ?? 0) + (this.vehicle.wheelCompression[2] ?? 0)) * 0.5;
    const rightAverage =
      ((this.vehicle.wheelCompression[1] ?? 0) + (this.vehicle.wheelCompression[3] ?? 0)) * 0.5;
    const targetPitch = degreesToAngle16((rearAverage - frontAverage) * 9);
    const targetBank = degreesToAngle16(
      (leftAverage - rightAverage) * 12 - command.steer * flatSpeed * 0.8
    );
    this.vehicle.attitude.p = lerpAngle16(
      this.vehicle.attitude.p,
      targetPitch,
      clamp(dt * 5, 0, 1)
    );
    this.vehicle.attitude.b = lerpAngle16(this.vehicle.attitude.b, targetBank, clamp(dt * 6, 0, 1));
    this.vehicle.engineRpm = 1200 + Math.max(0, Math.abs(forwardSpeed)) * 110;
    this.vehicle.aoaDeg = 0;
    this.vehicle.stall = 0;
  }

  private resolveObstacleCollision(nextPosition: Vec3, clearance: number): Vec3 {
    const hit = this.worldQuery.raycastSegment(this.vehicle.position, nextPosition, 28);
    if (hit === null || hit.kind !== "obstacle") {
      return nextPosition;
    }

    this.vehicle.linearVelocity = {
      x: this.vehicle.linearVelocity.x * 0.18,
      y: Math.max(0, this.vehicle.linearVelocity.y * 0.1),
      z: this.vehicle.linearVelocity.z * 0.18,
    };
    return addVec3(hit.point, mulVec3(hit.normal, clearance));
  }

  private updateCamera(dt: number): void {
    const debugTrim = this.debugInput.cameraTrim;
    const vehiclePose = posAttFromState(this.vehicle);
    const vehicleBasis = basisFromAttitude(this.vehicle.attitude);
    const velocityLead = mulVec3(this.vehicle.linearVelocity, 0.08);
    const target = addVec3(
      this.vehicle.position,
      addVec3(
        mulVec3(vehicleBasis.up, this.spec.camera.chaseHeight * 0.3),
        mulVec3(vehicleBasis.forward, this.spec.camera.chaseLead)
      )
    );

    let desiredPosition = { ...this.cameraPose.posAtt.p };
    if (this.cameraMode === "cockpit") {
      desiredPosition = vec3(0, 0, 0);
      convLtoG(desiredPosition, this.spec.camera.cockpitOffset, {
        p: vehiclePose.p,
        a: vehiclePose.a,
        t: makeTrigonomy(vehiclePose.a),
      });
    } else if (this.cameraMode === "orbit") {
      const orbitHeading = angle16ToDegrees(debugTrim.heading) * (Math.PI / 180);
      const orbitPitch = clamp(angle16ToDegrees(debugTrim.pitch), -80, 80) * (Math.PI / 180);
      const orbitDistance = this.spec.camera.orbitDistance / debugTrim.zoom;
      desiredPosition = {
        x: target.x + Math.sin(orbitHeading) * Math.cos(orbitPitch) * orbitDistance,
        y: target.y + Math.sin(orbitPitch) * orbitDistance + 2.5,
        z: target.z - Math.cos(orbitHeading) * Math.cos(orbitPitch) * orbitDistance,
      };
    } else {
      const chaseDistance = this.spec.camera.chaseDistance / debugTrim.zoom;
      const chaseOffset = addVec3(
        mulVec3(vehicleBasis.forward, -chaseDistance),
        addVec3(mulVec3(vehicleBasis.up, this.spec.camera.chaseHeight), velocityLead)
      );
      desiredPosition = addVec3(this.vehicle.position, chaseOffset);
    }

    if (this.cameraMode !== "cockpit") {
      const resolvedDistance = this.worldQuery.resolveCameraDistance(target, desiredPosition);
      const desiredDirection = normalizeVec3(subVec3(desiredPosition, target));
      desiredPosition = addVec3(target, mulVec3(desiredDirection, resolvedDistance));
      desiredPosition = this.worldQuery.constrainPointAboveGround(
        desiredPosition,
        this.vehicle.spec.kind === "car" ? 1.4 : 3.2
      );
    }

    this.cameraPose.posAtt.p = lerpVec3(
      this.cameraPose.posAtt.p,
      desiredPosition,
      clamp(1 - Math.exp(-this.spec.camera.damping * dt), 0, 1)
    );

    const lookVector = subVec3(target, this.cameraPose.posAtt.p);
    vectorToHeadPitch(this.cameraPose.posAtt.a, lookVector);
    if (this.cameraMode === "chase") {
      this.cameraPose.posAtt.a.h = wrapAngle16(this.cameraPose.posAtt.a.h + debugTrim.heading);
      this.cameraPose.posAtt.a.p = clampCameraPitch(this.cameraPose.posAtt.a.p + debugTrim.pitch);
    } else if (this.cameraMode === "cockpit") {
      this.cameraPose.posAtt.a = { ...this.vehicle.attitude };
      this.cameraPose.posAtt.a.h = wrapAngle16(this.cameraPose.posAtt.a.h + debugTrim.heading);
      this.cameraPose.posAtt.a.p = clampCameraPitch(this.cameraPose.posAtt.a.p + debugTrim.pitch);
    }
    this.cameraPose.target = target;
    this.cameraPose.distance = lengthVec3(subVec3(this.cameraPose.posAtt.p, target));
    this.cameraPose.zoom = debugTrim.zoom;
  }

  private interpolatedTransform(alpha: number): PosAtt {
    const current = posAttFromState(this.vehicle);
    return {
      p: lerpVec3(this.previousPose.p, current.p, alpha),
      a: {
        h: Math.round(lerpAngle16(this.previousPose.a.h, current.a.h, alpha)),
        p: Math.round(lerpAngle16(this.previousPose.a.p, current.a.p, alpha)),
        b: Math.round(lerpAngle16(this.previousPose.a.b, current.a.b, alpha)),
      },
    };
  }

  private buildSnapshot(alpha: number): WorldSnapshot {
    this.actor.transform = this.interpolatedTransform(alpha);
    return {
      camera: this.cameraPose.posAtt,
      cameraZoom: this.cameraPose.zoom,
      environment: this.options.environment,
      gpuField: this.options.gpuField,
      dynamicActors: [this.actor],
      smokeGeometry: emptySmokeGeometry(),
      vaporGeometry: emptySmokeGeometry(),
    };
  }

  private render(alpha: number): void {
    this.options.renderer.render(this.buildSnapshot(alpha));
    this.options.hudRoot.innerHTML = this.buildHudMarkup();
  }

  private buildHudMarkup(): string {
    const speed = lengthVec3(this.vehicle.linearVelocity);
    const primary =
      this.vehicle.spec.kind === "aircraft"
        ? `alt ${this.vehicle.position.y.toFixed(1)} m`
        : `steer ${(this.vehicle.steer * 100).toFixed(0)}%`;
    const secondary =
      this.vehicle.spec.kind === "aircraft"
        ? `aoa ${this.vehicle.aoaDeg.toFixed(1)} deg | stall ${(this.vehicle.stall * 100).toFixed(0)}%`
        : `susp ${this.vehicle.wheelCompression.map((value) => value.toFixed(2)).join(" / ")}`;
    return `
      <div class="game-console__header">
        <span class="game-console__title">${this.vehicle.spec.label}</span>
        <span class="game-console__badge">${this.cameraMode}</span>
      </div>
      <div class="game-console__grid">
        <div><span>speed</span><strong>${speed.toFixed(1)} m/s</strong></div>
        <div><span>rpm</span><strong>${this.vehicle.engineRpm.toFixed(0)}</strong></div>
        <div><span>state</span><strong>${this.paused ? "paused" : "live"}</strong></div>
        <div><span>camera</span><strong>${this.cameraPose.distance.toFixed(1)} m</strong></div>
      </div>
      <div class="game-console__line">${primary}</div>
      <div class="game-console__line">${secondary}</div>
    `;
  }
}
