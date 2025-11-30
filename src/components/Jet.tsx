import { useFrame } from '@react-three/fiber'
import { useRef, useState, useMemo, useEffect } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'

interface JetProps {
  flightPath: (t: number) => { 
    position: THREE.Vector3
    direction: THREE.Vector3
    bank?: number 
  }
  sceneIdx: number
}

// Trail point with position and right vector for consistent offset
interface TrailPoint {
  pos: THREE.Vector3
  right: THREE.Vector3  // Perpendicular direction for ribbon offset
}

// Single flat ribbon trail using stored right vectors
const FlatRibbon = ({ 
  points, 
  width, 
  offset,
  color = '#ffffff',
  opacity = 0.8 
}: { 
  points: TrailPoint[]
  width: number
  offset: number
  color?: string
  opacity?: number
}) => {
  const geometry = useMemo(() => {
    if (points.length < 3) return null
    
    const vertices: number[] = []
    const indices: number[] = []
    
    for (let i = 0; i < points.length; i++) {
      const { pos, right } = points[i]
      
      // Fade out ribbon towards end
      const fade = 1 - (i / points.length) * 0.4
      const w = width * fade
      
      // Apply offset using the stored right vector
      const centerOffset = right.clone().multiplyScalar(offset)
      const offsetPoint = pos.clone().add(centerOffset)
      
      // Create two vertices per point (ribbon edges)
      const v1 = offsetPoint.clone().add(right.clone().multiplyScalar(w * 0.5))
      const v2 = offsetPoint.clone().sub(right.clone().multiplyScalar(w * 0.5))
      
      vertices.push(v1.x, v1.y, v1.z)
      vertices.push(v2.x, v2.y, v2.z)
      
      // Create triangles
      if (i < points.length - 1) {
        const idx = i * 2
        indices.push(idx, idx + 1, idx + 2)
        indices.push(idx + 1, idx + 3, idx + 2)
      }
    }
    
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    geom.setIndex(indices)
    geom.computeVertexNormals()
    
    return geom
  }, [points, width, offset])
  
  if (!geometry || points.length < 3) return null
  
  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial 
        color={color}
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  )
}

// Triple contrail - 3 flat ribbons, middle one thick
const TripleContrail = ({ points }: { points: TrailPoint[] }) => {
  if (points.length < 3) return null
  
  return (
    <group>
      {/* Left thin ribbon */}
      <FlatRibbon 
        points={points} 
        width={0.12} 
        offset={-1.5}
        color="#ffffff"
        opacity={0.9}
      />
      
      {/* Center thick ribbon */}
      <FlatRibbon 
        points={points} 
        width={0.5} 
        offset={0}
        color="#ffffff"
        opacity={0.95}
      />
      
      {/* Right thin ribbon */}
      <FlatRibbon 
        points={points} 
        width={0.12} 
        offset={1.5}
        color="#ffffff"
        opacity={0.9}
      />
    </group>
  )
}

const Jet = ({ flightPath, sceneIdx }: JetProps) => {
  const ref = useRef<THREE.Group>(null!)
  const exhaustRef = useRef<THREE.Object3D>(null!)
  const [trailPoints, setTrailPoints] = useState<TrailPoint[]>([])
  const maxTrailPoints = 200
  const exhaustWorldPos = useRef(new THREE.Vector3())
  const frameSkip = useRef(0)
  
  // For smooth rotation
  const currentQuaternion = useRef(new THREE.Quaternion())
  const targetQuaternion = useRef(new THREE.Quaternion())
  
  // Load the GLB model
  const { scene } = useGLTF('/fighter_jet_low_poly.glb')
  
  // Clone the scene so we can modify it
  const clonedScene = useMemo(() => scene.clone(), [scene])

  // Clear contrail when scene changes
  useEffect(() => {
    setTrailPoints([])
    currentQuaternion.current.identity()
    targetQuaternion.current.identity()
  }, [sceneIdx])

  useFrame((state) => {
    const t = state.clock.getElapsedTime()
    const { position, direction, bank = 0 } = flightPath(t)
    
    // Set position
    ref.current.position.copy(position)
    
    // Calculate rotation from direction vector
    const lookAtMatrix = new THREE.Matrix4()
    const up = new THREE.Vector3(0, 1, 0)
    
    const targetPoint = position.clone().add(direction)
    lookAtMatrix.lookAt(position, targetPoint, up)
    
    targetQuaternion.current.setFromRotationMatrix(lookAtMatrix)
    
    // Apply bank (roll)
    const bankQuaternion = new THREE.Quaternion()
    bankQuaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), bank)
    targetQuaternion.current.multiply(bankQuaternion)
    
    // Smooth interpolation
    currentQuaternion.current.slerp(targetQuaternion.current, 0.12)
    ref.current.quaternion.copy(currentQuaternion.current)
    
    // Get world position and right vector for contrail
    frameSkip.current++
    if (exhaustRef.current && frameSkip.current % 2 === 0) {
      exhaustRef.current.getWorldPosition(exhaustWorldPos.current)
      
      // Calculate the jet's right vector in world space
      // This ensures contrail offset follows the jet's orientation
      const jetRight = new THREE.Vector3(1, 0, 0)
      jetRight.applyQuaternion(currentQuaternion.current)
      
      setTrailPoints((prevPoints) => {
        const newPoint: TrailPoint = {
          pos: exhaustWorldPos.current.clone(),
          right: jetRight.clone()
        }
        const newPoints = [...prevPoints, newPoint]
        if (newPoints.length > maxTrailPoints) newPoints.shift()
        return newPoints
      })
    }
  })

  // Calculate exhaust position (rear of the jet)
  const rearPos = useMemo<[number, number, number]>(() => {
    const bbox = new THREE.Box3().setFromObject(clonedScene)
    const center = bbox.getCenter(new THREE.Vector3())
    return [center.x, center.y, bbox.max.z * 0.9]
  }, [clonedScene])

  return (
    <>
      <group ref={ref} name="jet">
        <group rotation={[0, -Math.PI / 2, 0]}>
          <primitive object={clonedScene} scale={0.5} />
        </group>
        
        <mesh ref={exhaustRef} position={rearPos} visible={false}>
          <sphereGeometry args={[0.1]} />
        </mesh>
      </group>
      
      <TripleContrail points={trailPoints} />
    </>
  )
}

useGLTF.preload('/fighter_jet_low_poly.glb')

export default Jet
