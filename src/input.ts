// FLYBY2 — Input
// Legacy scripted-flyby controls plus gameplay/debug input layers.

import type { AppState, VehicleCommand, VehicleKind } from './types';

const CAMERA_PAN_SENSITIVITY = 28;
export const CAMERA_PAN_PITCH_LIMIT = 14563;
export const CAMERA_ZOOM_MIN = 0.5;
export const CAMERA_ZOOM_MAX = 3.0;
const CAMERA_ZOOM_STEP = 0.1;

export function wrapAngle16(angle: number): number {
  const turn = 0x10000;
  return ((angle % turn) + turn) % turn;
}

export function clampCameraPitch(angle: number): number {
  return Math.max(
    -CAMERA_PAN_PITCH_LIMIT,
    Math.min(CAMERA_PAN_PITCH_LIMIT, angle),
  );
}

export function clampCameraZoom(zoom: number): number {
  return Math.max(CAMERA_ZOOM_MIN, Math.min(CAMERA_ZOOM_MAX, zoom));
}

export function downloadFrame(canvas: HTMLCanvasElement): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'flyby.png';
    a.click();
    URL.revokeObjectURL(url);
  });
}

export function togglePause(state: AppState): void {
  state.paused = !state.paused;
}

export function registerInputHandler(state: AppState): void {
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ') {
      e.preventDefault();
      togglePause(state);
      return;
    }

    if (e.key === 'd' || e.key === 'D') {
      state.debugOverlayVisible = !state.debugOverlayVisible;
      state.debugOverlay.classList.toggle('is-hidden', !state.debugOverlayVisible);
      state.debugOverlay.parentElement?.classList.toggle('is-debug-hidden', !state.debugOverlayVisible);
      return;
    }

    if (e.key === 't' || e.key === 'T') {
      downloadFrame(state.canvas);
      return;
    }

    if (e.key === 'x' || e.key === 'X') {
      state.quitFlag = true;
      state.helpCount = 0;
      state.helpOverlay.classList.remove('is-visible');
      return;
    }

    state.helpCount = 30;
    state.helpOverlay.classList.add('is-visible');
  });

  state.canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    state.cameraPan.dragging = true;
    state.cameraPan.pointerId = e.pointerId;
    state.cameraPan.lastX = e.clientX;
    state.cameraPan.lastY = e.clientY;
    state.canvas.classList.add('is-dragging');
    state.canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  state.canvas.addEventListener('pointermove', (e) => {
    if (!state.cameraPan.dragging || state.cameraPan.pointerId !== e.pointerId) return;
    const dx = e.clientX - state.cameraPan.lastX;
    const dy = e.clientY - state.cameraPan.lastY;
    state.cameraPan.lastX = e.clientX;
    state.cameraPan.lastY = e.clientY;
    state.cameraPan.heading = wrapAngle16(state.cameraPan.heading - dx * CAMERA_PAN_SENSITIVITY);
    state.cameraPan.pitch = clampCameraPitch(state.cameraPan.pitch + dy * CAMERA_PAN_SENSITIVITY);
  });

  function endCameraPan(pointerId: number): void {
    if (state.cameraPan.pointerId !== pointerId) return;
    state.cameraPan.dragging = false;
    state.cameraPan.pointerId = null;
    state.canvas.classList.remove('is-dragging');
  }

  state.canvas.addEventListener('pointerup', (e) => {
    endCameraPan(e.pointerId);
  });

  state.canvas.addEventListener('pointercancel', (e) => {
    endCameraPan(e.pointerId);
  });

  state.canvas.addEventListener('wheel', (e) => {
    state.cameraPan.zoom = clampCameraZoom(
      state.cameraPan.zoom + (e.deltaY < 0 ? CAMERA_ZOOM_STEP : -CAMERA_ZOOM_STEP),
    );
    e.preventDefault();
  }, { passive: false });
}

function clampUnit(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function positiveAxis(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function keyActive(keys: Set<string>, ...codes: string[]): boolean {
  return codes.some((code) => keys.has(code));
}

export class DebugInputController {
  private readonly canvas: HTMLCanvasElement;

  readonly cameraTrim = {
    heading: 0,
    pitch: 0,
    zoom: 1,
    dragging: false,
    pointerId: null as number | null,
    lastX: 0,
    lastY: 0,
  };

  private pauseRequested = false;
  private screenshotRequested = false;
  private cycleCameraRequested = false;
  private resetVehicleRequested = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      if (event.key === 'p' || event.key === 'P') {
        this.pauseRequested = true;
      } else if (event.key === 't' || event.key === 'T') {
        this.screenshotRequested = true;
      } else if (event.key === 'c' || event.key === 'C') {
        this.cycleCameraRequested = true;
      } else if (event.key === 'r' || event.key === 'R') {
        this.resetVehicleRequested = true;
      }
    });

    this.canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      this.cameraTrim.dragging = true;
      this.cameraTrim.pointerId = event.pointerId;
      this.cameraTrim.lastX = event.clientX;
      this.cameraTrim.lastY = event.clientY;
      this.canvas.classList.add('is-dragging');
      this.canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.cameraTrim.dragging || this.cameraTrim.pointerId !== event.pointerId) return;
      const dx = event.clientX - this.cameraTrim.lastX;
      const dy = event.clientY - this.cameraTrim.lastY;
      this.cameraTrim.lastX = event.clientX;
      this.cameraTrim.lastY = event.clientY;
      this.cameraTrim.heading = wrapAngle16(this.cameraTrim.heading - dx * CAMERA_PAN_SENSITIVITY);
      this.cameraTrim.pitch = clampCameraPitch(this.cameraTrim.pitch + dy * CAMERA_PAN_SENSITIVITY);
    });

    const endDrag = (pointerId: number): void => {
      if (this.cameraTrim.pointerId !== pointerId) return;
      this.cameraTrim.dragging = false;
      this.cameraTrim.pointerId = null;
      this.canvas.classList.remove('is-dragging');
    };

    this.canvas.addEventListener('pointerup', (event) => {
      endDrag(event.pointerId);
    });
    this.canvas.addEventListener('pointercancel', (event) => {
      endDrag(event.pointerId);
    });
    this.canvas.addEventListener('wheel', (event) => {
      this.cameraTrim.zoom = clampCameraZoom(
        this.cameraTrim.zoom + (event.deltaY < 0 ? CAMERA_ZOOM_STEP : -CAMERA_ZOOM_STEP),
      );
      event.preventDefault();
    }, { passive: false });
  }

  resetCameraTrim(): void {
    this.cameraTrim.heading = 0;
    this.cameraTrim.pitch = 0;
    this.cameraTrim.zoom = 1;
  }

  consumePauseToggle(): boolean {
    const requested = this.pauseRequested;
    this.pauseRequested = false;
    return requested;
  }

  consumeScreenshot(): boolean {
    const requested = this.screenshotRequested;
    this.screenshotRequested = false;
    return requested;
  }

  consumeCycleCamera(): boolean {
    const requested = this.cycleCameraRequested;
    this.cycleCameraRequested = false;
    return requested;
  }

  consumeResetVehicle(): boolean {
    const requested = this.resetVehicleRequested;
    this.resetVehicleRequested = false;
    return requested;
  }
}

export class GameplayInputController {
  private readonly keys = new Set<string>();

  constructor() {
    window.addEventListener('keydown', (event) => {
      this.keys.add(event.code);
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
    });
  }

  private sampleGamepad(): {
    steer: number;
    throttle: number;
    brake: number;
    pitch: number;
    roll: number;
    yaw: number;
    handbrake: number;
    boost: number;
  } {
    const pads = navigator.getGamepads?.() ?? [];
    const pad = pads.find((candidate): candidate is Gamepad => candidate !== null);
    if (!pad) {
      return {
        steer: 0,
        throttle: 0,
        brake: 0,
        pitch: 0,
        roll: 0,
        yaw: 0,
        handbrake: 0,
        boost: 0,
      };
    }

    return {
      steer: clampUnit(pad.axes[0] ?? 0),
      throttle: positiveAxis((pad.buttons[7]?.value ?? 0) || ((1 - (pad.axes[5] ?? 1)) * 0.5)),
      brake: positiveAxis((pad.buttons[6]?.value ?? 0) || ((1 - (pad.axes[4] ?? 1)) * 0.5)),
      pitch: clampUnit(-(pad.axes[1] ?? 0)),
      roll: clampUnit(pad.axes[0] ?? 0),
      yaw: clampUnit((pad.buttons[5]?.value ?? 0) - (pad.buttons[4]?.value ?? 0)),
      handbrake: positiveAxis(pad.buttons[1]?.value ?? 0),
      boost: positiveAxis(pad.buttons[0]?.value ?? 0),
    };
  }

  sample(kind: VehicleKind): VehicleCommand {
    const pad = this.sampleGamepad();
    const steerKeys = (keyActive(this.keys, 'KeyD', 'ArrowRight') ? 1 : 0)
      - (keyActive(this.keys, 'KeyA', 'ArrowLeft') ? 1 : 0);
    const throttleKeys = keyActive(this.keys, 'KeyW', 'ArrowUp') ? 1 : 0;
    const brakeKeys = keyActive(this.keys, 'KeyS', 'ArrowDown') ? 1 : 0;
    const rollKeys = (keyActive(this.keys, 'KeyD') ? 1 : 0)
      - (keyActive(this.keys, 'KeyA') ? 1 : 0);
    const pitchKeys = (keyActive(this.keys, 'ArrowDown') ? 1 : 0)
      - (keyActive(this.keys, 'ArrowUp') ? 1 : 0);
    const yawKeys = (keyActive(this.keys, 'KeyE') ? 1 : 0)
      - (keyActive(this.keys, 'KeyQ') ? 1 : 0);

    if (kind === 'aircraft') {
      return {
        throttle: Math.max(throttleKeys, pad.throttle),
        brake: Math.max(brakeKeys, pad.brake),
        steer: clampUnit(steerKeys + pad.steer),
        pitch: clampUnit(pitchKeys + pad.pitch),
        roll: clampUnit(rollKeys + pad.roll),
        yaw: clampUnit(yawKeys + pad.yaw),
        handbrake: 0,
        boost: Math.max(keyActive(this.keys, 'ShiftLeft', 'ShiftRight') ? 1 : 0, pad.boost),
        reset: false,
      };
    }

    return {
      throttle: Math.max(throttleKeys, pad.throttle),
      brake: Math.max(brakeKeys, pad.brake),
      steer: clampUnit(steerKeys + pad.steer),
      pitch: 0,
      roll: 0,
      yaw: 0,
      handbrake: Math.max(keyActive(this.keys, 'Space', 'KeyB') ? 1 : 0, pad.handbrake),
      boost: 0,
      reset: false,
    };
  }
}
