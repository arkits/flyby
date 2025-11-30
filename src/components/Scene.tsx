import Jet from './Jet'
import * as THREE from 'three'
import { useMemo } from 'react'
import { flightPaths } from '../flightPaths'

// Blue wireframe grid ground
const Ground = () => {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]}>
      <planeGeometry args={[500, 500, 50, 50]} />
      <meshBasicMaterial 
        color="#1a3a6e" 
        wireframe 
        transparent
        opacity={0.6}
      />
    </mesh>
  )
}

// Runway component with dashed white lines
const Runway = () => {
  const runwayGeometry = useMemo(() => {
    return new THREE.PlaneGeometry(15, 200)
  }, [])

  // Create dashed line markings
  const dashPositions = useMemo(() => {
    const positions: [number, number, number][] = []
    for (let i = -90; i < 90; i += 12) {
      positions.push([0, i, 0.01])
    }
    return positions
  }, [])

  return (
    <group rotation={[-Math.PI / 2, 0, Math.PI / 4]} position={[20, -0.5, 0]}>
      {/* Main runway surface */}
      <mesh geometry={runwayGeometry}>
        <meshBasicMaterial color="#2a2a2a" />
      </mesh>
      
      {/* Center dashed lines */}
      {dashPositions.map((pos, i) => (
        <mesh key={i} position={pos}>
          <planeGeometry args={[0.4, 6]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      ))}
      
      {/* Edge lines */}
      <mesh position={[-7, 0, 0.01]}>
        <planeGeometry args={[0.2, 200]} />
        <meshBasicMaterial color="#444444" />
      </mesh>
      <mesh position={[7, 0, 0.01]}>
        <planeGeometry args={[0.2, 200]} />
        <meshBasicMaterial color="#444444" />
      </mesh>
    </group>
  )
}

// Gray rectangular building (hangar-like)
const RectangularBuilding = ({ position, size }: { 
  position: [number, number, number]
  size: [number, number, number] 
}) => {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color="#5a5a5a" flatShading />
    </mesh>
  )
}

// Blue cylindrical storage tank / silo
const CylindricalTank = ({ position, radius, height }: { 
  position: [number, number, number]
  radius: number
  height: number
}) => {
  return (
    <group position={position}>
      {/* Main cylinder body */}
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[radius, radius, height, 8]} />
        <meshStandardMaterial color="#1a4a9e" flatShading />
      </mesh>
      {/* Top cap */}
      <mesh position={[0, height + 0.5, 0]}>
        <cylinderGeometry args={[radius * 0.3, radius, 1, 8]} />
        <meshStandardMaterial color="#0d3a7e" flatShading />
      </mesh>
    </group>
  )
}

// Collection of buildings
const Buildings = () => {
  return (
    <group>
      {/* Gray rectangular buildings (hangars) - left side */}
      <RectangularBuilding position={[-80, 7, -40]} size={[30, 14, 20]} />
      <RectangularBuilding position={[-85, 5, 20]} size={[25, 10, 15]} />
      <RectangularBuilding position={[-60, 4, 60]} size={[20, 8, 12]} />
      
      {/* Blue cylindrical tanks - right side cluster */}
      <CylindricalTank position={[70, -1, -30]} radius={8} height={15} />
      <CylindricalTank position={[85, -1, -15]} radius={6} height={12} />
      <CylindricalTank position={[75, -1, 5]} radius={7} height={10} />
      <CylindricalTank position={[90, -1, 20]} radius={5} height={8} />
      
      {/* Additional scattered buildings */}
      <RectangularBuilding position={[50, 3, -70]} size={[15, 6, 10]} />
      <CylindricalTank position={[-50, -1, -60]} radius={5} height={10} />
      <RectangularBuilding position={[30, 4, 80]} size={[18, 8, 14]} />
      <CylindricalTank position={[60, -1, 60]} radius={6} height={11} />
    </group>
  )
}

interface SceneProps {
  sceneIdx: number
}

const Scene = ({ sceneIdx }: SceneProps) => {
  const currentPath = flightPaths[sceneIdx].fn
  
  return (
    <>
      {/* Minimal ambient light for the scene */}
      <ambientLight intensity={0.4} />
      
      {/* Main directional light from above-front */}
      <directionalLight 
        position={[50, 100, 50]} 
        intensity={1.0} 
        color="#ffffff"
      />
      
      {/* Fill light from the side */}
      <directionalLight 
        position={[-30, 50, -30]} 
        intensity={0.3} 
        color="#6688bb"
      />
      
      {/* Black background - handled by CSS, but we add fog for depth */}
      <fog attach="fog" args={['#000000', 150, 400]} />
      
      {/* Blue wireframe grid ground */}
      <Ground />
      
      {/* Runway */}
      <Runway />
      
      {/* Buildings */}
      <Buildings />
      
      {/* The jet */}
      <Jet flightPath={currentPath} sceneIdx={sceneIdx} />
    </>
  )
}

export default Scene
