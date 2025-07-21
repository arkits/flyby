
import { Canvas } from '@react-three/fiber'
import Scene, { flightPaths } from './components/Scene'
import Camera from './components/Camera'
import { useState } from 'react'

function App() {
  const [sceneIdx, setSceneIdx] = useState(0)
  return (
    <>
      {/* UI outside Canvas */}
      <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10, background: 'rgba(30,30,40,0.8)', color: '#fff', padding: 8, borderRadius: 8 }}>
        {flightPaths.map((s, i) => (
          <button
            key={s.name}
            style={{
              margin: 2,
              padding: '4px 10px',
              background: i === sceneIdx ? '#4F8EF7' : '#222',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: i === sceneIdx ? 'bold' : 'normal',
            }}
            onClick={() => setSceneIdx(i)}
          >
            {s.name}
          </button>
        ))}
      </div>
      <Canvas gl={{ antialias: true }}>
        <Scene sceneIdx={sceneIdx} />
        <Camera />
      </Canvas>
    </>
  )
}

export default App
