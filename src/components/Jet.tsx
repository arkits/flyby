
import { useFrame } from '@react-three/fiber'
import { useRef, useState, useMemo } from 'react'
import * as THREE from 'three'
import { Line, useGLTF } from '@react-three/drei'

interface JetProps {
  flightPath?: (t: number) => { position: THREE.Vector3; lookAt: THREE.Vector3; bank?: number }
}

const defaultFlightPath = (t: number) => {
  const position = new THREE.Vector3(
    Math.sin(t) * 20,
    Math.sin(t * 2) * 5 + 5,
    Math.cos(t) * 20
  )
  const lookAt = new THREE.Vector3(
    Math.sin(t + 0.01) * 20,
    Math.sin((t + 0.01) * 2) * 5 + 5,
    Math.cos(t + 0.01) * 20
  )
  const bank = -Math.sin(t) * 0.5
  return { position, lookAt, bank }
}

const Jet = ({ flightPath = defaultFlightPath }: JetProps) => {
  const ref = useRef<THREE.Group>(null!)
  const exhaustRef = useRef<THREE.Object3D>(null!)
  const [trailPoints, setTrailPoints] = useState<THREE.Vector3[]>([])
  const maxTrailPoints = 120
  const exhaustWorldPos = useRef(new THREE.Vector3())

  // Load the GLB model
  const { scene, nodes } = useGLTF('/fighter_jet_low_poly.glb') as any

  useFrame((state) => {
    const t = state.clock.getElapsedTime()
    const { position, lookAt, bank } = flightPath(t)
    ref.current.position.copy(position)
    ref.current.lookAt(lookAt)
    ref.current.rotation.z = bank ?? 0
    // Get world position of the exhaust
    if (exhaustRef.current) {
      exhaustRef.current.getWorldPosition(exhaustWorldPos.current)
      setTrailPoints((prevPoints) => {
        const newPoints = [...prevPoints, exhaustWorldPos.current.clone()]
        if (newPoints.length > maxTrailPoints) newPoints.shift()
        return newPoints
      })
    }
  })

  const trailColor = useMemo(() => new THREE.Color(0.85, 0.85, 0.95), [])

  // Try to find an exhaust node, otherwise fallback to rear of bounding box
  let exhaustNode = null
  if (nodes && nodes.Exhaust) {
    exhaustNode = <primitive object={nodes.Exhaust} ref={exhaustRef} visible={false} />
  }

  // If no named node, place a dummy at the rear of the model
  // We'll assume the model is oriented +Z forward, so -Z is the exhaust
  // Compute bounding box only once
  const [rearPos] = useState<[number, number, number]>(() => {
    const bbox = new THREE.Box3().setFromObject(scene)
    const center = bbox.getCenter(new THREE.Vector3())
    // Place at rear center
    return [center.x, center.y, bbox.min.z]
  })

  return (
    <group>
      <group ref={ref} name="jet">
        {/* Model faces forward */}
        <primitive object={scene} rotation-y={Math.PI} />
        {/* Attach exhaust ref to named node or fallback dummy */}
        {exhaustNode || (
          <mesh ref={exhaustRef} position={rearPos} visible={false} />
        )}
        {/* Contrail */}
        {trailPoints.length > 1 && (
          <Line points={trailPoints} color={trailColor} lineWidth={3} />
        )}
      </group>
    </group>
  )
}

useGLTF.preload('/fighter_jet_low_poly.glb')

export default Jet
