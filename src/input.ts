// FLYBY2 — Keyboard Input
// Ported from idevice.c (Win32 keyboard) for DOM events

import type { AppState } from './types';

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
