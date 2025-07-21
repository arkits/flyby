
import Jet from './Jet'
import * as THREE from 'three'

// Define various acrobatic flight paths
export const flightPaths = [
  {
    name: 'Circle',
    fn: (t: number) => {
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
  },
  {
    name: 'Loop',
    fn: (t: number) => {
      const r = 15
      const theta = t % (2 * Math.PI)
      const position = new THREE.Vector3(
        Math.sin(theta) * r,
        Math.cos(theta) * r + 10,
        0
      )
      const lookAt = new THREE.Vector3(
        Math.sin(theta + 0.01) * r,
        Math.cos(theta + 0.01) * r + 10,
        0
      )
      const bank = Math.sin(theta) * 0.7
      return { position, lookAt, bank }
    }
  },
  {
    name: 'Barrel Roll',
    fn: (t: number) => {
      const r = 18
      const position = new THREE.Vector3(
        Math.sin(t) * r,
        7 + Math.sin(t * 2) * 2,
        Math.cos(t) * r
      )
      const lookAt = new THREE.Vector3(
        Math.sin(t + 0.01) * r,
        7 + Math.sin((t + 0.01) * 2) * 2,
        Math.cos(t + 0.01) * r
      )
      const bank = Math.sin(t * 3) // Fast roll
      return { position, lookAt, bank }
    }
  },
  {
    name: 'Figure Eight',
    fn: (t: number) => {
      const r = 14
      const position = new THREE.Vector3(
        Math.sin(t) * r,
        7 + Math.sin(t * 2) * 2,
        Math.sin(t) * Math.cos(t) * r
      )
      const lookAt = new THREE.Vector3(
        Math.sin(t + 0.01) * r,
        7 + Math.sin((t + 0.01) * 2) * 2,
        Math.sin(t + 0.01) * Math.cos(t + 0.01) * r
      )
      const bank = Math.sin(t) * 0.7
      return { position, lookAt, bank }
    }
  },
  {
    name: 'Spiral Climb',
    fn: (t: number) => {
      const r = 10 + t * 0.5
      const position = new THREE.Vector3(
        Math.sin(t) * r,
        5 + t % 20,
        Math.cos(t) * r
      )
      const lookAt = new THREE.Vector3(
        Math.sin(t + 0.01) * r,
        5 + (t + 0.01) % 20,
        Math.cos(t + 0.01) * r
      )
      const bank = Math.sin(t) * 0.5
      return { position, lookAt, bank }
    }
  }
]

interface SceneProps {
  sceneIdx: number
}

const Scene = ({ sceneIdx }: SceneProps) => {
  const currentPath = flightPaths[sceneIdx].fn
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[0, 10, 0]} intensity={1} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]}>
        <planeGeometry args={[1000, 1000, 100, 100]} />
        <meshStandardMaterial color="#1F21B7" wireframe />
      </mesh>
      <Jet flightPath={currentPath} />
    </>
  )
}

export default Scene
