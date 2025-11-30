import * as THREE from 'three'

export interface FlightPathResult {
  position: THREE.Vector3
  direction: THREE.Vector3
  bank: number
}

export interface FlightPath {
  name: string
  fn: (t: number, startHeading: number, startPos: THREE.Vector3) => FlightPathResult
  duration: number // Duration in seconds before cycling
}

// Constants matching original FLYBY2
const VELOCITY = 80 // Units per second (slightly adjusted for visual appeal)
const ALTITUDE = 25 // Base altitude

// Helper to calculate position along a path given heading, pitch, and distance traveled
function proceedFromStart(
  startPos: THREE.Vector3,
  heading: number,
  pitch: number,
  distance: number
): THREE.Vector3 {
  const dir = new THREE.Vector3(
    Math.sin(heading) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(heading) * Math.cos(pitch)
  )
  return startPos.clone().add(dir.multiplyScalar(distance))
}

// Helper to get direction vector from heading and pitch
function getDirection(heading: number, pitch: number): THREE.Vector3 {
  return new THREE.Vector3(
    Math.sin(heading) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(heading) * Math.cos(pitch)
  ).normalize()
}

/**
 * FlyByStraight - Simple straight flyby
 * Original: Fly ahead 1000 units
 */
const straightPath: FlightPath = {
  name: 'Straight',
  duration: 12,
  fn: (t: number, startHeading: number, startPos: THREE.Vector3) => {
    const distance = t * VELOCITY
    const position = proceedFromStart(startPos, startHeading, 0, distance)
    const direction = getDirection(startHeading, 0)
    return { position, direction, bank: 0 }
  }
}

/**
 * FlyByRoll - Fly ahead, do a barrel roll, fly ahead
 * Original: Fly 300, 360° roll, fly 300
 */
const rollPath: FlightPath = {
  name: 'Roll',
  duration: 14,
  fn: (t: number, startHeading: number, startPos: THREE.Vector3) => {
    const phase1End = 3.5 // Fly ahead time
    const phase2End = 7.5 // Roll time
    const rollDuration = phase2End - phase1End
    
    let distance: number
    let bank = 0
    
    if (t < phase1End) {
      // Phase 1: Fly ahead
      distance = t * VELOCITY
    } else if (t < phase2End) {
      // Phase 2: Roll while flying
      const rollT = t - phase1End
      distance = phase1End * VELOCITY + rollT * VELOCITY
      bank = (rollT / rollDuration) * Math.PI * 2 // Full 360° roll
    } else {
      // Phase 3: Fly ahead after roll
      distance = phase2End * VELOCITY + (t - phase2End) * VELOCITY
    }
    
    const position = proceedFromStart(startPos, startHeading, 0, distance)
    const direction = getDirection(startHeading, 0)
    return { position, direction, bank }
  }
}

/**
 * FlyByLoop - Fly ahead, vertical loop, fly ahead
 * Original: Fly 500, full loop (65536 pitch), fly 500
 */
const loopPath: FlightPath = {
  name: 'Loop',
  duration: 16,
  fn: (t: number, startHeading: number, startPos: THREE.Vector3) => {
    const phase1End = 3 // Approach time
    const loopDuration = 8 // Time to complete loop
    const phase2End = phase1End + loopDuration
    const loopRadius = 35
    
    let position: THREE.Vector3
    let direction: THREE.Vector3
    const bank = 0
    
    if (t < phase1End) {
      // Phase 1: Fly ahead
      const distance = t * VELOCITY
      position = proceedFromStart(startPos, startHeading, 0, distance)
      direction = getDirection(startHeading, 0)
    } else if (t < phase2End) {
      // Phase 2: Vertical loop
      const loopT = (t - phase1End) / loopDuration
      const loopAngle = loopT * Math.PI * 2 // Full 360° loop
      
      // Calculate position on the loop circle
      const loopStartPos = proceedFromStart(startPos, startHeading, 0, phase1End * VELOCITY)
      
      // Loop is perpendicular to ground, in the plane of travel
      const forwardDir = new THREE.Vector3(Math.sin(startHeading), 0, Math.cos(startHeading))
      const upDir = new THREE.Vector3(0, 1, 0)
      
      // Center of loop is above and forward from loop start
      const loopCenter = loopStartPos.clone()
        .add(upDir.clone().multiplyScalar(loopRadius))
      
      // Position on loop
      position = loopCenter.clone()
        .add(forwardDir.clone().multiplyScalar(Math.sin(loopAngle) * loopRadius))
        .add(upDir.clone().multiplyScalar(-Math.cos(loopAngle) * loopRadius))
      
      // Direction is tangent to loop
      direction = forwardDir.clone().multiplyScalar(Math.cos(loopAngle))
        .add(upDir.clone().multiplyScalar(Math.sin(loopAngle)))
        .normalize()
    } else {
      // Phase 3: Exit straight
      const loopEndPos = proceedFromStart(startPos, startHeading, 0, phase1End * VELOCITY)
        .add(new THREE.Vector3(Math.sin(startHeading), 0, Math.cos(startHeading)).multiplyScalar(loopRadius * 2))
      const exitDistance = (t - phase2End) * VELOCITY
      position = loopEndPos.clone().add(
        new THREE.Vector3(Math.sin(startHeading), 0, Math.cos(startHeading)).multiplyScalar(exitDistance)
      )
      direction = getDirection(startHeading, 0)
    }
    
    return { position, direction, bank }
  }
}

/**
 * FlyByClimb - Fly ahead, pitch up steeply, continue climbing
 * Original: Fly 450, pitch up ~70°, fly 500
 */
const climbPath: FlightPath = {
  name: 'Climb',
  duration: 12,
  fn: (t: number, startHeading: number, startPos: THREE.Vector3) => {
    const phase1End = 4 // Level flight time
    const pitchDuration = 2 // Time to pitch up
    const phase2End = phase1End + pitchDuration
    const maxPitch = Math.PI * 0.4 // ~72° pitch up
    
    let position: THREE.Vector3
    let direction: THREE.Vector3
    const bank = 0
    let currentPitch = 0
    
    if (t < phase1End) {
      // Phase 1: Level approach
      const distance = t * VELOCITY
      position = proceedFromStart(startPos, startHeading, 0, distance)
      direction = getDirection(startHeading, 0)
    } else if (t < phase2End) {
      // Phase 2: Pitching up
      const pitchT = (t - phase1End) / pitchDuration
      currentPitch = pitchT * maxPitch
      
      // Integrate the curved path during pitch-up
      const basePos = proceedFromStart(startPos, startHeading, 0, phase1End * VELOCITY)
      const pitchRadius = VELOCITY * pitchDuration / maxPitch
      
      const forwardDir = new THREE.Vector3(Math.sin(startHeading), 0, Math.cos(startHeading))
      const upDir = new THREE.Vector3(0, 1, 0)
      
      // Arc position
      position = basePos.clone()
        .add(forwardDir.clone().multiplyScalar(Math.sin(currentPitch) * pitchRadius))
        .add(upDir.clone().multiplyScalar((1 - Math.cos(currentPitch)) * pitchRadius))
      
      direction = getDirection(startHeading, currentPitch)
    } else {
      // Phase 3: Continue climbing at steep angle
      const pitchEndPos = proceedFromStart(startPos, startHeading, 0, phase1End * VELOCITY)
      const pitchRadius = VELOCITY * pitchDuration / maxPitch
      const forwardDir = new THREE.Vector3(Math.sin(startHeading), 0, Math.cos(startHeading))
      const upDir = new THREE.Vector3(0, 1, 0)
      
      const phase2EndPos = pitchEndPos.clone()
        .add(forwardDir.clone().multiplyScalar(Math.sin(maxPitch) * pitchRadius))
        .add(upDir.clone().multiplyScalar((1 - Math.cos(maxPitch)) * pitchRadius))
      
      const climbDistance = (t - phase2End) * VELOCITY
      const climbDir = getDirection(startHeading, maxPitch)
      position = phase2EndPos.clone().add(climbDir.clone().multiplyScalar(climbDistance))
      direction = climbDir
      currentPitch = maxPitch
    }
    
    return { position, direction, bank }
  }
}

/**
 * FlyByEight - Figure-8 maneuver
 * Original: Complex sequence of pitch/bank maneuvers
 */
const eightPath: FlightPath = {
  name: 'Figure-8',
  duration: 22,
  fn: (t: number, startHeading: number, startPos: THREE.Vector3) => {
    // Simplified figure-8: two connected vertical loops in opposite directions
    const phase1End = 3 // Entry
    const loop1Duration = 6
    const phase2End = phase1End + loop1Duration
    const transitionDuration = 2
    const phase3End = phase2End + transitionDuration
    const loop2Duration = 6
    const phase4End = phase3End + loop2Duration
    const loopRadius = 28
    
    let position: THREE.Vector3
    let direction: THREE.Vector3
    let bank = 0
    
    const forwardDir = new THREE.Vector3(Math.sin(startHeading), 0, Math.cos(startHeading))
    const upDir = new THREE.Vector3(0, 1, 0)
    
    if (t < phase1End) {
      // Entry
      const distance = t * VELOCITY
      position = proceedFromStart(startPos, startHeading, 0, distance)
      direction = getDirection(startHeading, 0)
    } else if (t < phase2End) {
      // First 3/4 loop (going up and over)
      const loopT = (t - phase1End) / loop1Duration
      const loopAngle = loopT * Math.PI * 1.5 // 270° of loop
      
      const loopStartPos = proceedFromStart(startPos, startHeading, 0, phase1End * VELOCITY)
      const loopCenter = loopStartPos.clone().add(upDir.clone().multiplyScalar(loopRadius))
      
      position = loopCenter.clone()
        .add(forwardDir.clone().multiplyScalar(Math.sin(loopAngle) * loopRadius))
        .add(upDir.clone().multiplyScalar(-Math.cos(loopAngle) * loopRadius))
      
      direction = forwardDir.clone().multiplyScalar(Math.cos(loopAngle))
        .add(upDir.clone().multiplyScalar(Math.sin(loopAngle)))
        .normalize()
    } else if (t < phase3End) {
      // Transition with half-roll (flying inverted, rolling to upright)
      const transT = (t - phase2End) / transitionDuration
      
      // Position continues down and forward at 45°
      const transStartPos = proceedFromStart(startPos, startHeading, 0, phase1End * VELOCITY)
        .add(forwardDir.clone().multiplyScalar(loopRadius))
        .add(upDir.clone().multiplyScalar(loopRadius * 2))
      
      const downForward = forwardDir.clone().multiplyScalar(0.707)
        .add(upDir.clone().multiplyScalar(-0.707))
      
      position = transStartPos.clone().add(downForward.clone().multiplyScalar(transT * VELOCITY * transitionDuration))
      direction = downForward.normalize()
      bank = Math.PI * (1 - transT) // Half-roll during descent
    } else if (t < phase4End) {
      // Second 3/4 loop (inverted direction)
      const loopT = (t - phase3End) / loop2Duration
      const loopAngle = Math.PI * 0.25 + loopT * Math.PI * 1.5
      
      // Start position of second loop
      const loop2StartPos = proceedFromStart(startPos, startHeading, 0, phase1End * VELOCITY)
        .add(forwardDir.clone().multiplyScalar(loopRadius + VELOCITY * transitionDuration * 0.707))
        .add(upDir.clone().multiplyScalar(loopRadius * 2 - VELOCITY * transitionDuration * 0.707))
      
      const loop2Center = loop2StartPos.clone()
        .add(forwardDir.clone().multiplyScalar(-Math.sin(Math.PI * 0.25) * loopRadius))
        .add(upDir.clone().multiplyScalar(Math.cos(Math.PI * 0.25) * loopRadius))
      
      position = loop2Center.clone()
        .add(forwardDir.clone().multiplyScalar(-Math.sin(loopAngle) * loopRadius))
        .add(upDir.clone().multiplyScalar(-Math.cos(loopAngle) * loopRadius))
      
      direction = forwardDir.clone().multiplyScalar(-Math.cos(loopAngle))
        .add(upDir.clone().multiplyScalar(Math.sin(loopAngle)))
        .normalize()
    } else {
      // Exit
      const exitT = t - phase4End
      const exitPos = proceedFromStart(startPos, startHeading, 0, phase1End * VELOCITY)
        .add(forwardDir.clone().multiplyScalar(-loopRadius))
      position = exitPos.clone().add(forwardDir.clone().multiplyScalar(-exitT * VELOCITY))
      direction = forwardDir.clone().multiplyScalar(-1)
    }
    
    return { position, direction, bank }
  }
}

/**
 * FlyBy360 - Horizontal 360° turn with banking
 * Original: Bank, turn 360°, unbank, fly ahead
 */
const turn360Path: FlightPath = {
  name: '360 Turn',
  duration: 16,
  fn: (t: number, startHeading: number, startPos: THREE.Vector3) => {
    const phase1End = 3 // Entry
    const bankInDuration = 1
    const phase2End = phase1End + bankInDuration
    const turnDuration = 8
    const phase3End = phase2End + turnDuration
    const bankOutDuration = 1
    const phase4End = phase3End + bankOutDuration
    
    const turnRadius = 50
    const bankAngle = Math.PI * 0.35 // ~63° bank for turn
    
    let position: THREE.Vector3
    let direction: THREE.Vector3
    let bank = 0
    
    if (t < phase1End) {
      // Entry - straight
      const distance = t * VELOCITY
      position = proceedFromStart(startPos, startHeading, 0, distance)
      direction = getDirection(startHeading, 0)
    } else if (t < phase2End) {
      // Banking into turn
      const bankT = (t - phase1End) / bankInDuration
      bank = bankT * bankAngle
      const distance = phase1End * VELOCITY + (t - phase1End) * VELOCITY
      position = proceedFromStart(startPos, startHeading, 0, distance)
      direction = getDirection(startHeading, 0)
    } else if (t < phase3End) {
      // 360° turn
      const turnT = (t - phase2End) / turnDuration
      const turnAngle = turnT * Math.PI * 2
      bank = bankAngle
      
      // Center of turn circle
      const turnStartPos = proceedFromStart(startPos, startHeading, 0, phase2End * VELOCITY)
      const rightDir = new THREE.Vector3(Math.cos(startHeading), 0, -Math.sin(startHeading))
      const turnCenter = turnStartPos.clone().add(rightDir.clone().multiplyScalar(turnRadius))
      
      // Position on turn circle
      const currentHeading = startHeading + turnAngle
      position = turnCenter.clone().add(
        new THREE.Vector3(-Math.cos(startHeading + turnAngle), 0, Math.sin(startHeading + turnAngle))
          .multiplyScalar(turnRadius)
      )
      
      direction = getDirection(currentHeading, 0)
    } else if (t < phase4End) {
      // Banking out of turn
      const bankOutT = (t - phase3End) / bankOutDuration
      bank = bankAngle * (1 - bankOutT)
      
      // Continue from end of turn
      const turnEndPos = proceedFromStart(startPos, startHeading, 0, phase2End * VELOCITY)
      const exitDistance = (t - phase3End) * VELOCITY
      position = turnEndPos.clone().add(
        new THREE.Vector3(Math.sin(startHeading), 0, Math.cos(startHeading)).multiplyScalar(exitDistance)
      )
      direction = getDirection(startHeading, 0)
    } else {
      // Exit straight
      const turnEndPos = proceedFromStart(startPos, startHeading, 0, phase2End * VELOCITY)
      const exitDistance = (t - phase3End) * VELOCITY
      position = turnEndPos.clone().add(
        new THREE.Vector3(Math.sin(startHeading), 0, Math.cos(startHeading)).multiplyScalar(exitDistance)
      )
      direction = getDirection(startHeading, 0)
    }
    
    return { position, direction, bank }
  }
}

// All flight paths matching original FLYBY2 maneuvers
export const flightPaths: FlightPath[] = [
  straightPath,
  rollPath,
  loopPath,
  climbPath,
  eightPath,
  turn360Path,
]

// Generate random starting position (like original FLYBY2)
export function generateRandomStart(): { heading: number; position: THREE.Vector3 } {
  const heading = Math.random() * Math.PI * 2
  const startDistance = 120
  
  // Start at edge, facing center
  const position = new THREE.Vector3(
    -Math.sin(heading) * startDistance,
    ALTITUDE + (Math.random() - 0.5) * 10,
    Math.cos(heading) * startDistance
  )
  
  // Heading points toward center
  const inwardHeading = heading + Math.PI
  
  return { heading: inwardHeading, position }
}

// Generate random camera position (like original - stationary ground observer)
export function generateRandomCameraPosition(): THREE.Vector3 {
  const angle = Math.random() * Math.PI * 2
  const distance = 40 + Math.random() * 60 // 40-100 units from center
  
  return new THREE.Vector3(
    Math.sin(angle) * distance,
    2 + Math.random() * 8, // 2-10 units above ground
    Math.cos(angle) * distance
  )
}
