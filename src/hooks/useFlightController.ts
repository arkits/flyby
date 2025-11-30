import { useRef, useCallback } from 'react';
import * as THREE from 'three';

// Constants from original FLYBY.C
const SPEED = 100; // units per second
// Loop radius = SPEED / (PITCH_RATE/FULL_CIRCLE * 2π) ≈ 127 units
// Need altitude > 2 * loop radius to avoid ground during loops
const ALTITUDE = 300;

// Angle conversions (original uses 16-bit angles: 0x10000 = 360°)
const FULL_CIRCLE = 65536;
const toRadians = (angle16: number) => (angle16 / FULL_CIRCLE) * Math.PI * 2;

// Maneuver types
export type ManeuverType = 'straight' | 'roll' | 'loop' | 'climb' | 'eight' | 'turn360';

// Flight state
export interface FlightState {
  position: THREE.Vector3;
  heading: number;  // radians
  pitch: number;    // radians
  bank: number;     // radians
  maneuverProgress: number;
  currentManeuver: ManeuverType;
  maneuverPhase: number;
  isComplete: boolean;
}

// Maneuver step definition
interface ManeuverStep {
  type: 'ahead' | 'pitch' | 'bank' | 'turn';
  value: number;  // distance for 'ahead', angle for others
  direction?: number; // 1 or -1
}

// Maneuver definitions ported from FLYBY.C
const MANEUVERS: Record<ManeuverType, ManeuverStep[]> = {
  straight: [
    { type: 'ahead', value: 1000 },
  ],
  roll: [
    { type: 'ahead', value: 300 },
    { type: 'bank', value: FULL_CIRCLE, direction: 1 },
    { type: 'ahead', value: 300 },
  ],
  loop: [
    { type: 'ahead', value: 500 },
    { type: 'pitch', value: FULL_CIRCLE, direction: 1 },
    { type: 'ahead', value: 500 },
  ],
  climb: [
    { type: 'ahead', value: 450 },
    { type: 'pitch', value: 12800, direction: 1 },
    { type: 'ahead', value: 500 },
  ],
  eight: [
    { type: 'ahead', value: 400 },
    { type: 'pitch', value: 0x4000, direction: 1 },
    { type: 'ahead', value: 50 },
    { type: 'pitch', value: 0x6000, direction: 1 },
    { type: 'bank', value: 0x18000, direction: 1 },
    { type: 'pitch', value: 0x6000, direction: 1 },
    { type: 'ahead', value: 50 },
    { type: 'pitch', value: 0x6000, direction: 1 },
    { type: 'bank', value: 0x18000, direction: 1 },
    { type: 'pitch', value: 0x2000, direction: 1 },
    { type: 'ahead', value: 400 },
  ],
  turn360: [
    { type: 'ahead', value: 450 },
    { type: 'bank', value: 12800, direction: 1 },
    { type: 'turn', value: FULL_CIRCLE, direction: 1 },
    { type: 'bank', value: 12800, direction: -1 },
    { type: 'ahead', value: 500 },
  ],
};

// Rate of rotation (from original: pitch = 8192/sec, bank = 32768/sec, turn = 8192/sec)
const PITCH_RATE = 8192;
const BANK_RATE = 32768;
const TURN_RATE = 8192;

export function useFlightController() {
  const stateRef = useRef<FlightState>({
    position: new THREE.Vector3(0, ALTITUDE, 0),
    heading: 0,
    pitch: 0,
    bank: 0,
    maneuverProgress: 0,
    currentManeuver: 'straight',
    maneuverPhase: 0,
    isComplete: false,
  });
  
  const stepProgressRef = useRef(0);

  // Initialize a new flight
  const initFlight = useCallback((maneuver?: ManeuverType) => {
    const dir = Math.random() * Math.PI * 2;
    
    // Position aircraft at edge, facing center
    // Reduced from 500 to 200 units for closer camera view
    const startDistance = 200;
    const state = stateRef.current;
    state.position.set(
      -startDistance * Math.sin(dir),
      ALTITUDE + (Math.random() * 30 - 15),
      startDistance * Math.cos(dir)
    );
    state.heading = dir + Math.PI; // Face toward center
    state.pitch = 0;
    state.bank = 0;
    state.maneuverProgress = 0;
    state.currentManeuver = maneuver ?? getRandomManeuver();
    state.maneuverPhase = 0;
    state.isComplete = false;
    stepProgressRef.current = 0;
  }, []);

  // Get random maneuver
  const getRandomManeuver = (): ManeuverType => {
    const maneuvers: ManeuverType[] = ['straight', 'roll', 'loop', 'climb', 'eight', 'turn360'];
    return maneuvers[Math.floor(Math.random() * maneuvers.length)];
  };

  // Move aircraft forward
  const proceed = useCallback((distance: number) => {
    const state = stateRef.current;
    const forward = new THREE.Vector3(0, 0, distance);
    
    // Apply rotations: heading (Y), then pitch (X), then bank (Z)
    const euler = new THREE.Euler(state.pitch, state.heading, state.bank, 'YXZ');
    forward.applyEuler(euler);
    
    state.position.add(forward);
  }, []);

  // Update flight state (call each frame)
  const update = useCallback((deltaTime: number) => {
    const state = stateRef.current;
    if (state.isComplete) return state;
    
    const maneuver = MANEUVERS[state.currentManeuver];
    if (state.maneuverPhase >= maneuver.length) {
      state.isComplete = true;
      return state;
    }
    
    const step = maneuver[state.maneuverPhase];
    const vel = deltaTime * SPEED;
    
    switch (step.type) {
      case 'ahead': {
        proceed(vel);
        stepProgressRef.current += vel;
        if (stepProgressRef.current >= step.value) {
          state.maneuverPhase++;
          stepProgressRef.current = 0;
        }
        break;
      }
      case 'pitch': {
        proceed(vel);
        const pitchDelta = toRadians(deltaTime * PITCH_RATE) * (step.direction ?? 1);
        state.pitch += pitchDelta;
        stepProgressRef.current += deltaTime * PITCH_RATE;
        if (stepProgressRef.current >= step.value) {
          state.maneuverPhase++;
          stepProgressRef.current = 0;
        }
        break;
      }
      case 'bank': {
        proceed(vel);
        const bankDelta = toRadians(deltaTime * BANK_RATE) * (step.direction ?? 1);
        state.bank += bankDelta;
        stepProgressRef.current += deltaTime * BANK_RATE;
        if (stepProgressRef.current >= step.value) {
          state.maneuverPhase++;
          stepProgressRef.current = 0;
        }
        break;
      }
      case 'turn': {
        proceed(vel);
        const turnDelta = toRadians(deltaTime * TURN_RATE) * (step.direction ?? 1);
        state.heading += turnDelta;
        stepProgressRef.current += deltaTime * TURN_RATE;
        if (stepProgressRef.current >= step.value) {
          state.maneuverPhase++;
          stepProgressRef.current = 0;
        }
        break;
      }
    }
    
    state.maneuverProgress = state.maneuverPhase / maneuver.length;
    return state;
  }, [proceed]);

  // Get current quaternion for aircraft orientation
  const getQuaternion = useCallback(() => {
    const state = stateRef.current;
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler(state.pitch, state.heading, state.bank, 'YXZ');
    quaternion.setFromEuler(euler);
    return quaternion;
  }, []);

  // Get current position
  const getPosition = useCallback(() => {
    return stateRef.current.position.clone();
  }, []);

  // Check if maneuver is complete
  const isComplete = useCallback(() => {
    return stateRef.current.isComplete;
  }, []);

  // Get current maneuver name
  const getCurrentManeuver = useCallback(() => {
    return stateRef.current.currentManeuver;
  }, []);

  // Check if currently in a smoke-emitting maneuver phase
  const isEmittingSmoke = useCallback(() => {
    const state = stateRef.current;
    if (state.isComplete) return false;
    
    const maneuver = MANEUVERS[state.currentManeuver];
    if (state.maneuverPhase >= maneuver.length) return false;
    
    const step = maneuver[state.maneuverPhase];
    // Emit smoke during pitch, bank, and turn maneuvers
    return step.type === 'pitch' || step.type === 'bank' || step.type === 'turn';
  }, []);

  // Get current step type for different smoke effects
  const getCurrentStepType = useCallback(() => {
    const state = stateRef.current;
    if (state.isComplete) return 'ahead';
    
    const maneuver = MANEUVERS[state.currentManeuver];
    if (state.maneuverPhase >= maneuver.length) return 'ahead';
    
    return maneuver[state.maneuverPhase].type;
  }, []);

  return {
    initFlight,
    update,
    getQuaternion,
    getPosition,
    isComplete,
    getCurrentManeuver,
    isEmittingSmoke,
    getCurrentStepType,
    state: stateRef.current,
  };
}

