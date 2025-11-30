import * as THREE from 'three'

export interface FlightPathResult {
  position: THREE.Vector3
  direction: THREE.Vector3
  bank: number
}

export interface FlightPath {
  name: string
  fn: (t: number) => FlightPathResult
}

// Define various acrobatic flight paths - realistic jet maneuvers
export const flightPaths: FlightPath[] = [
  {
    name: 'Flyby',
    fn: (t: number) => {
      // Classic low flyby with banking turns
      const speed = 0.5
      const cycle = (t * speed) % (Math.PI * 4)
      
      let position: THREE.Vector3
      let direction: THREE.Vector3
      let bank = 0
      
      if (cycle < Math.PI * 2) {
        // Approach and pass
        const p = cycle / (Math.PI * 2)
        position = new THREE.Vector3(
          -80 + p * 160,
          15 + Math.sin(p * Math.PI) * 8,
          40 - p * 30
        )
        direction = new THREE.Vector3(1, Math.cos(p * Math.PI) * 0.2, -0.2).normalize()
        bank = Math.sin(p * Math.PI * 2) * 0.4
      } else {
        // Return pass from other side
        const p = (cycle - Math.PI * 2) / (Math.PI * 2)
        position = new THREE.Vector3(
          80 - p * 160,
          20 + Math.sin(p * Math.PI) * 10,
          10 + p * 30
        )
        direction = new THREE.Vector3(-1, Math.cos(p * Math.PI) * 0.15, 0.3).normalize()
        bank = -Math.sin(p * Math.PI * 2) * 0.5
      }
      
      return { position, direction, bank }
    }
  },
  {
    name: 'Vertical 360',
    fn: (t: number) => {
      // Vertical 360 loop - the classic aerobatic maneuver
      const speed = 0.4
      const cycle = (t * speed) % (Math.PI * 3)
      
      let position: THREE.Vector3
      let direction: THREE.Vector3
      let bank = 0
      
      const loopRadius = 30
      const loopCenterY = 40
      
      if (cycle < Math.PI * 0.5) {
        // Approach - level flight building speed
        const p = cycle / (Math.PI * 0.5)
        position = new THREE.Vector3(-60 + p * 60, 10, 0)
        direction = new THREE.Vector3(1, 0, 0)
        bank = 0
      } else if (cycle < Math.PI * 2.5) {
        // The loop itself - full 360 vertical circle
        const loopProgress = (cycle - Math.PI * 0.5) / (Math.PI * 2)
        const angle = loopProgress * Math.PI * 2
        
        position = new THREE.Vector3(
          0 + Math.sin(angle) * loopRadius,
          loopCenterY - Math.cos(angle) * loopRadius,
          0
        )
        
        // Direction is tangent to the circle
        direction = new THREE.Vector3(
          Math.cos(angle),
          Math.sin(angle),
          0
        ).normalize()
        
        bank = 0
      } else {
        // Exit - level flight
        const p = (cycle - Math.PI * 2.5) / (Math.PI * 0.5)
        position = new THREE.Vector3(0 + p * 60, 10, p * 20)
        direction = new THREE.Vector3(1, 0, 0.3).normalize()
        bank = 0
      }
      
      return { position, direction, bank }
    }
  },
  {
    name: 'Barrel Roll',
    fn: (t: number) => {
      // Barrel roll - corkscrew motion
      const speed = 0.5
      const cycle = (t * speed) % (Math.PI * 4)
      
      const rollRadius = 10
      const forwardSpeed = 20
      
      // Continuous forward motion with rolling
      const forwardPos = ((cycle / (Math.PI * 4)) * forwardSpeed * 4) - forwardSpeed * 2
      const rollAngle = cycle * 1.5
      
      const position = new THREE.Vector3(
        forwardPos * 3,
        25 + Math.cos(rollAngle) * rollRadius,
        Math.sin(rollAngle) * rollRadius
      )
      
      // Direction is primarily forward with slight variations
      const direction = new THREE.Vector3(1, 0, 0).normalize()
      
      const bank = rollAngle
      
      return { position, direction, bank }
    }
  },
  {
    name: 'Immelmann',
    fn: (t: number) => {
      // Immelmann turn - half loop up, then half roll
      const speed = 0.45
      const cycle = (t * speed) % (Math.PI * 3.5)
      
      let position: THREE.Vector3
      let direction: THREE.Vector3
      let bank = 0
      
      const loopRadius = 25
      
      if (cycle < Math.PI * 0.75) {
        // Level approach
        const p = cycle / (Math.PI * 0.75)
        position = new THREE.Vector3(-50 + p * 50, 12, 20)
        direction = new THREE.Vector3(1, 0, 0)
        bank = 0
      } else if (cycle < Math.PI * 1.75) {
        // Half loop up
        const p = (cycle - Math.PI * 0.75) / Math.PI
        const angle = p * Math.PI
        position = new THREE.Vector3(
          0 + Math.sin(angle) * loopRadius,
          12 + loopRadius - Math.cos(angle) * loopRadius,
          20
        )
        direction = new THREE.Vector3(
          Math.cos(angle),
          Math.sin(angle),
          0
        ).normalize()
        bank = 0
      } else if (cycle < Math.PI * 2.25) {
        // Half roll to upright (now flying opposite direction)
        const p = (cycle - Math.PI * 1.75) / (Math.PI * 0.5)
        position = new THREE.Vector3(25 - p * 15, 62, 20)
        direction = new THREE.Vector3(-1, 0, 0)
        bank = Math.PI * (1 - p)
      } else {
        // Exit opposite direction
        const p = (cycle - Math.PI * 2.25) / (Math.PI * 1.25)
        position = new THREE.Vector3(10 - p * 70, 62 - p * 45, 20 - p * 40)
        direction = new THREE.Vector3(-0.9, -0.3, -0.3).normalize()
        bank = -0.2
      }
      
      return { position, direction, bank }
    }
  },
  {
    name: 'Cuban Eight',
    fn: (t: number) => {
      // Cuban Eight - two loops with half rolls at top
      const speed = 0.35
      const cycle = (t * speed) % (Math.PI * 5)
      
      let position: THREE.Vector3
      let direction: THREE.Vector3
      let bank = 0
      
      const loopRadius = 22
      const loopCenterY = 35
      
      if (cycle < Math.PI * 0.5) {
        // Entry
        const p = cycle / (Math.PI * 0.5)
        position = new THREE.Vector3(-40 + p * 40, 13, 0)
        direction = new THREE.Vector3(1, 0.1, 0).normalize()
        bank = 0
      } else if (cycle < Math.PI * 1.75) {
        // First 5/8 loop
        const p = (cycle - Math.PI * 0.5) / (Math.PI * 1.25)
        const angle = p * Math.PI * 1.25
        position = new THREE.Vector3(
          Math.sin(angle) * loopRadius,
          loopCenterY - Math.cos(angle) * loopRadius,
          0
        )
        direction = new THREE.Vector3(
          Math.cos(angle),
          Math.sin(angle),
          0
        ).normalize()
        bank = 0
      } else if (cycle < Math.PI * 2.25) {
        // Half roll at 45 degree down line
        const p = (cycle - Math.PI * 1.75) / (Math.PI * 0.5)
        const baseAngle = Math.PI * 1.25
        position = new THREE.Vector3(
          Math.sin(baseAngle) * loopRadius - p * 15,
          loopCenterY - Math.cos(baseAngle) * loopRadius - p * 15,
          0
        )
        direction = new THREE.Vector3(-0.707, -0.707, 0).normalize()
        bank = p * Math.PI
      } else if (cycle < Math.PI * 3.5) {
        // Second 5/8 loop (opposite direction)
        const p = (cycle - Math.PI * 2.25) / (Math.PI * 1.25)
        const angle = Math.PI * 0.25 + p * Math.PI * 1.25
        position = new THREE.Vector3(
          -20 - Math.sin(angle) * loopRadius,
          loopCenterY - Math.cos(angle) * loopRadius,
          0
        )
        direction = new THREE.Vector3(
          -Math.cos(angle),
          Math.sin(angle),
          0
        ).normalize()
        bank = Math.PI
      } else {
        // Exit
        const p = (cycle - Math.PI * 3.5) / (Math.PI * 1.5)
        position = new THREE.Vector3(-20 + p * 60, 13 + p * 5, p * 30)
        direction = new THREE.Vector3(1, 0.05, 0.4).normalize()
        bank = Math.PI * (1 - p)
      }
      
      return { position, direction, bank }
    }
  },
  {
    name: 'Aileron Roll',
    fn: (t: number) => {
      // Quick aileron rolls while flying level
      const speed = 0.6
      const cycle = (t * speed) % (Math.PI * 4)
      
      // Fly in a wide circle, doing rolls
      const circleAngle = cycle * 0.3
      const circleRadius = 50
      
      const position = new THREE.Vector3(
        Math.sin(circleAngle) * circleRadius,
        22 + Math.sin(cycle * 2) * 3,
        Math.cos(circleAngle) * circleRadius
      )
      
      // Direction tangent to circle
      const direction = new THREE.Vector3(
        Math.cos(circleAngle),
        0,
        -Math.sin(circleAngle)
      ).normalize()
      
      // Fast rolling
      const bank = cycle * 3
      
      return { position, direction, bank }
    }
  }
]
