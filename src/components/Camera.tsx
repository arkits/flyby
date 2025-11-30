import { useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera } from '@react-three/drei'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

interface CameraProps {
  cameraPosition: THREE.Vector3
  sceneKey: number
}

// Minimum camera height above ground
const MIN_CAMERA_HEIGHT = 1.5

const Camera = ({ cameraPosition, sceneKey }: CameraProps) => {
  const { scene } = useThree()
  const cameraRef = useRef<THREE.PerspectiveCamera>(null!)
  const currentLookAt = useRef(new THREE.Vector3())
  const jetVelocity = useRef(new THREE.Vector3())
  const lastJetPos = useRef(new THREE.Vector3())
  const frameCount = useRef(0)

  // When scene changes, set camera to the random position
  useEffect(() => {
    if (!cameraRef.current) return
    
    const newPos = cameraPosition.clone()
    // Ensure camera never goes below ground
    newPos.y = Math.max(newPos.y, MIN_CAMERA_HEIGHT)
    cameraRef.current.position.copy(newPos)
    
    // Reset tracking state
    currentLookAt.current.set(0, 25, 0)
    lastJetPos.current.set(0, 25, 0)
    jetVelocity.current.set(0, 0, 0)
    frameCount.current = 0
  }, [sceneKey, cameraPosition])

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
    const lookAheadFactor = 6
    const targetLookAt = jet.position.clone().add(
      jetVelocity.current.clone().multiplyScalar(lookAheadFactor)
    )
    
    // Smooth look-at transition (like original's camera tracking)
    currentLookAt.current.lerp(targetLookAt, 0.1)
    cameraRef.current.lookAt(currentLookAt.current)

    // Keep the camera upright (no roll) - like original
    const euler = new THREE.Euler().setFromQuaternion(cameraRef.current.quaternion)
    euler.z = 0
    cameraRef.current.quaternion.setFromEuler(euler)
  })

  return (
    <PerspectiveCamera 
      ref={cameraRef} 
      makeDefault 
      fov={50} // Slightly wider FOV like original
      near={0.1}
      far={800}
      position={cameraPosition}
    />
  )
}

export default Camera
