
import { useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera } from '@react-three/drei'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

const Camera = () => {
  const { scene } = useThree()
  const cameraRef = useRef<THREE.PerspectiveCamera>(null!)
  const [cameraIndex, setCameraIndex] = useState(0)

  const cameraPositions = [
    new THREE.Vector3(0, 2, 10),
    new THREE.Vector3(10, 3, 0),
    new THREE.Vector3(0, 5, -10),
  ]

  useEffect(() => {
    const interval = setInterval(() => {
      setCameraIndex((prevIndex) => (prevIndex + 1) % cameraPositions.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  useFrame(() => {
    const jet = scene.getObjectByName('jet')
    if (jet) {
      cameraRef.current.lookAt(jet.position)
      cameraRef.current.position.lerp(cameraPositions[cameraIndex], 0.05)
    }
  })

  return <PerspectiveCamera ref={cameraRef} makeDefault />
}

export default Camera
