import Jet from './Jet'
import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { FlightPath } from '../flightPaths'

// Blue wireframe grid ground - matching original FLYBY2 aesthetic
// Original had lines from -20000 to 20000 with spacing of 1000
// Animated grid with subtle pulse - adds life to the screensaver
const AnimatedGround = () => {
  const materialRef = useRef<THREE.LineBasicMaterial>(null)
  
  const gridGeometry = useMemo(() => {
    const gridSize = 400
    const spacing = 20
    const points: THREE.Vector3[] = []
    
    for (let i = -gridSize / 2; i <= gridSize / 2; i += spacing) {
      points.push(new THREE.Vector3(-gridSize / 2, 0, i))
      points.push(new THREE.Vector3(gridSize / 2, 0, i))
    }
    for (let i = -gridSize / 2; i <= gridSize / 2; i += spacing) {
      points.push(new THREE.Vector3(i, 0, -gridSize / 2))
      points.push(new THREE.Vector3(i, 0, gridSize / 2))
    }
    
    return new THREE.BufferGeometry().setFromPoints(points)
  }, [])
  
  useFrame(({ clock }) => {
    if (materialRef.current) {
      // Subtle pulsing opacity like old CRT monitors
      const pulse = 0.6 + Math.sin(clock.elapsedTime * 0.5) * 0.1
      materialRef.current.opacity = pulse
    }
  })

  return (
    <group position={[0, -0.5, 0]}>
      <lineSegments geometry={gridGeometry}>
        <lineBasicMaterial 
          ref={materialRef}
          color="#2060c0" 
          transparent 
          opacity={0.7} 
        />
      </lineSegments>
    </group>
  )
}

// Simple runway with dashed white center line
const Runway = () => {
  const dashPositions = useMemo(() => {
    const positions: [number, number, number][] = []
    for (let i = -90; i < 90; i += 12) {
      positions.push([0, i, 0.01])
    }
    return positions
  }, [])

  return (
    <group rotation={[-Math.PI / 2, 0, Math.PI / 4]} position={[20, -0.3, 0]}>
      {/* Main runway surface - dark gray */}
      <mesh>
        <planeGeometry args={[15, 200]} />
        <meshBasicMaterial color="#1a1a1a" />
      </mesh>
      
      {/* Center dashed lines */}
      {dashPositions.map((pos, i) => (
        <mesh key={i} position={pos}>
          <planeGeometry args={[0.4, 6]} />
          <meshBasicMaterial color="#888888" />
        </mesh>
      ))}
    </group>
  )
}

// Simple low-poly buildings like original FLYBY2 had
const Hangar = ({ position, size }: { 
  position: [number, number, number]
  size: [number, number, number] 
}) => {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color="#3a3a3a" flatShading />
    </mesh>
  )
}

// Control tower - simple cylinder
const Tower = ({ position, height }: { 
  position: [number, number, number]
  height: number
}) => {
  return (
    <group position={position}>
      {/* Tower base */}
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[2, 3, height, 6]} />
        <meshStandardMaterial color="#4a4a5a" flatShading />
      </mesh>
      {/* Tower top (control room) */}
      <mesh position={[0, height + 2, 0]}>
        <boxGeometry args={[6, 4, 6]} />
        <meshStandardMaterial color="#2a3a4a" flatShading />
      </mesh>
    </group>
  )
}

// Buildings cluster
const Buildings = () => {
  return (
    <group>
      {/* Hangars */}
      <Hangar position={[-70, 5, -35]} size={[25, 10, 18]} />
      <Hangar position={[-75, 4, 15]} size={[20, 8, 14]} />
      <Hangar position={[-50, 3.5, 55]} size={[18, 7, 12]} />
      
      {/* Tower */}
      <Tower position={[60, 0, -40]} height={18} />
      
      {/* Additional scattered structures */}
      <Hangar position={[45, 2.5, -60]} size={[12, 5, 10]} />
      <Hangar position={[35, 3, 65]} size={[14, 6, 12]} />
    </group>
  )
}

interface SceneProps {
  sceneKey: number
  currentPath: FlightPath
  startHeading: number
  startPosition: THREE.Vector3
}

const Scene = ({ sceneKey, currentPath, startHeading, startPosition }: SceneProps) => {
  return (
    <>
      {/* Minimal ambient light - keeping scene somewhat dark like original */}
      <ambientLight intensity={0.35} />
      
      {/* Main directional light from above-front (simulates sun) */}
      <directionalLight 
        position={[50, 100, 50]} 
        intensity={0.9} 
        color="#ffffff"
      />
      
      {/* Fill light from the side */}
      <directionalLight 
        position={[-30, 50, -30]} 
        intensity={0.25} 
        color="#4466aa"
      />
      
      {/* Dark fog for atmosphere - matches original black background */}
      <fog attach="fog" args={['#000000', 180, 500]} />
      
      {/* Blue wireframe grid ground - signature FLYBY2 look */}
      <AnimatedGround />
      
      {/* Runway */}
      <Runway />
      
      {/* Low-poly buildings */}
      <Buildings />
      
      {/* The jet with flight path */}
      <Jet 
        flightPath={currentPath.fn}
        startHeading={startHeading}
        startPosition={startPosition}
        sceneKey={sceneKey}
      />
    </>
  )
}

export default Scene
