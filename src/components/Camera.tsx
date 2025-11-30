import { useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera } from '@react-three/drei'
import { useEffect, useRef, useMemo } from 'react'
import * as THREE from 'three'

interface CameraProps {
  sceneIdx: number
}

// Minimum camera height above ground
const MIN_CAMERA_HEIGHT = 1.5

const Camera = ({ sceneIdx }: CameraProps) => {
  const { scene } = useThree()
  const cameraRef = useRef<THREE.PerspectiveCamera>(null!)
  const currentLookAt = useRef(new THREE.Vector3())
  const jetVelocity = useRef(new THREE.Vector3())
  const lastJetPos = useRef(new THREE.Vector3())
  const frameCount = useRef(0)

  // Ground-based camera positions - one per flight path, closer to action
  const cameraPositions = useMemo(() => [
    new THREE.Vector3(0, 3, 45),        // Flyby - front view
    new THREE.Vector3(-25, 4, 35),      // Loop - side angle to see vertical
    new THREE.Vector3(40, 3, 30),       // Barrel Roll - side view
    new THREE.Vector3(-30, 5, 40),      // Immelmann - good angle for half loop
    new THREE.Vector3(15, 4, 35),       // Cuban Eight - centered view
    new THREE.Vector3(30, 3, 40),       // Aileron Roll - side view
  ], [])

  // When scene changes, instantly reset camera position and look-at
  useEffect(() => {
    if (!cameraRef.current) return
    
    const newPos = cameraPositions[sceneIdx % cameraPositions.length].clone()
    // Ensure camera never goes below ground
    newPos.y = Math.max(newPos.y, MIN_CAMERA_HEIGHT)
    cameraRef.current.position.copy(newPos)
    
    // Reset tracking state
    currentLookAt.current.set(0, 15, 0)
    lastJetPos.current.set(0, 15, 0)
    jetVelocity.current.set(0, 0, 0)
    frameCount.current = 0
  }, [sceneIdx, cameraPositions])

  useFrame(() => {
    const jet = scene.getObjectByName('jet')
    if (!jet || !cameraRef.current) return

    frameCount.current++
    
    // Ensure camera stays above ground
    if (cameraRef.current.position.y < MIN_CAMERA_HEIGHT) {
      cameraRef.current.position.y = MIN_CAMERA_HEIGHT
    }
    
    // Skip smooth tracking for first few frames after scene change
    if (frameCount.current < 5) {
      cameraRef.current.lookAt(jet.position)
      lastJetPos.current.copy(jet.position)
      currentLookAt.current.copy(jet.position)
      return
    }

    // Track jet velocity for look-ahead
    jetVelocity.current.subVectors(jet.position, lastJetPos.current)
    lastJetPos.current.copy(jet.position)

    // Look ahead of the jet slightly based on its velocity
    const lookAheadFactor = 8
    const targetLookAt = jet.position.clone().add(
      jetVelocity.current.clone().multiplyScalar(lookAheadFactor)
    )
    
    // Smooth look-at transition
    currentLookAt.current.lerp(targetLookAt, 0.08)
    cameraRef.current.lookAt(currentLookAt.current)

    // Keep the camera upright (no roll)
    const euler = new THREE.Euler().setFromQuaternion(cameraRef.current.quaternion)
    euler.z = 0
    cameraRef.current.quaternion.setFromEuler(euler)
  })

  return (
    <PerspectiveCamera 
      ref={cameraRef} 
      makeDefault 
      fov={45}
      near={0.1}
      far={600}
      position={cameraPositions[0]}
    />
  )
}

export default Camera
