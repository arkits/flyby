import { Canvas } from '@react-three/fiber'
import Scene from './components/Scene'
import { flightPaths } from './flightPaths'
import Camera from './components/Camera'
import { useState, useEffect } from 'react'

function App() {
  const [sceneIdx, setSceneIdx] = useState(0)
  const [showUI, setShowUI] = useState(true)
  
  // Auto-cycle through flight paths like a screensaver
  useEffect(() => {
    const interval = setInterval(() => {
      setSceneIdx((prev) => (prev + 1) % flightPaths.length)
    }, 25000) // Change maneuver every 25 seconds
    return () => clearInterval(interval)
  }, [])

  // Hide UI after 3 seconds of inactivity, show on mouse move
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    
    const hideUI = () => {
      timeout = setTimeout(() => setShowUI(false), 3000)
    }
    
    const showUIOnMove = () => {
      setShowUI(true)
      clearTimeout(timeout)
      hideUI()
    }
    
    hideUI()
    window.addEventListener('mousemove', showUIOnMove)
    window.addEventListener('click', showUIOnMove)
    
    return () => {
      clearTimeout(timeout)
      window.removeEventListener('mousemove', showUIOnMove)
      window.removeEventListener('click', showUIOnMove)
    }
  }, [])

  return (
    <>
      {/* UI overlay - fades in/out */}
      <div 
        style={{ 
          position: 'absolute', 
          top: 16, 
          left: 16, 
          zIndex: 10, 
          background: 'rgba(0, 0, 0, 0.7)', 
          color: '#fff', 
          padding: '10px 14px', 
          borderRadius: 6,
          fontFamily: '"SF Mono", "Monaco", "Consolas", monospace',
          fontSize: 11,
          border: '1px solid rgba(255,255,255,0.1)',
          opacity: showUI ? 1 : 0,
          transition: 'opacity 0.5s ease',
          pointerEvents: showUI ? 'auto' : 'none',
        }}
      >
        <div style={{ 
          marginBottom: 8, 
          fontSize: 10, 
          color: '#888',
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}>
          Flyby2 • Maneuver
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 280 }}>
          {flightPaths.map((s, i) => (
            <button
              key={s.name}
              style={{
                padding: '5px 10px',
                background: i === sceneIdx ? '#3d7cd9' : 'rgba(255,255,255,0.08)',
                color: i === sceneIdx ? '#fff' : '#aaa',
                border: 'none',
                borderRadius: 3,
                cursor: 'pointer',
                fontWeight: i === sceneIdx ? 600 : 400,
                fontSize: 11,
                fontFamily: 'inherit',
                transition: 'all 0.2s ease',
              }}
              onClick={() => setSceneIdx(i)}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>
      
      {/* Main 3D canvas */}
      <Canvas 
        gl={{ 
          antialias: true,
          powerPreference: 'high-performance',
        }}
        style={{ background: '#000000' }}
      >
        <color attach="background" args={['#000000']} />
        <Scene sceneIdx={sceneIdx} />
        <Camera sceneIdx={sceneIdx} />
      </Canvas>
    </>
  )
}

export default App
