import { Canvas } from '@react-three/fiber'
import Scene from './components/Scene'
import { flightPaths, generateRandomStart, generateRandomCameraPosition } from './flightPaths'
import Camera from './components/Camera'
import { useState, useEffect, useCallback, useMemo } from 'react'

// Generate a complete random scene configuration
function generateSceneConfig() {
  const pathIndex = Math.floor(Math.random() * flightPaths.length)
  const path = flightPaths[pathIndex]
  const { heading, position } = generateRandomStart()
  const cameraPosition = generateRandomCameraPosition()
  
  return {
    pathIndex,
    path,
    startHeading: heading,
    startPosition: position,
    cameraPosition,
  }
}

function App() {
  // Scene key increments to trigger full scene reset
  const [sceneKey, setSceneKey] = useState(0)
  const [sceneConfig, setSceneConfig] = useState(generateSceneConfig)
  const [showUI, setShowUI] = useState(true)
  
  // Generate new random scene - like original FLYBY2's random maneuver selection
  const nextScene = useCallback(() => {
    setSceneConfig(generateSceneConfig())
    setSceneKey(k => k + 1)
  }, [])
  
  // Auto-cycle through random maneuvers like a screensaver
  // Original FLYBY2 would pick random aircraft and maneuvers continuously
  useEffect(() => {
    const duration = sceneConfig.path.duration * 1000 + 2000 // Path duration + buffer
    const interval = setTimeout(nextScene, duration)
    return () => clearTimeout(interval)
  }, [sceneKey, sceneConfig.path.duration, nextScene])

  // Hide UI after 3 seconds of inactivity, show on mouse move
  // True screensaver behavior
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
    window.addEventListener('keydown', showUIOnMove)
    
    return () => {
      clearTimeout(timeout)
      window.removeEventListener('mousemove', showUIOnMove)
      window.removeEventListener('click', showUIOnMove)
      window.removeEventListener('keydown', showUIOnMove)
    }
  }, [])

  // Memoize vectors to prevent recreation
  const startPositionVec = useMemo(
    () => sceneConfig.startPosition.clone(),
    [sceneConfig.startPosition]
  )
  const cameraPositionVec = useMemo(
    () => sceneConfig.cameraPosition.clone(),
    [sceneConfig.cameraPosition]
  )

  return (
    <>
      {/* UI overlay - fades in/out like original screensaver */}
      <div 
        style={{ 
          position: 'absolute', 
          top: 16, 
          left: 16, 
          zIndex: 10, 
          background: 'rgba(0, 0, 0, 0.85)', 
          color: '#fff', 
          padding: '12px 16px', 
          borderRadius: 4,
          fontFamily: '"Courier New", "Lucida Console", monospace',
          fontSize: 12,
          border: '1px solid rgba(100, 150, 255, 0.3)',
          opacity: showUI ? 1 : 0,
          transition: 'opacity 0.5s ease',
          pointerEvents: showUI ? 'auto' : 'none',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div style={{ 
          marginBottom: 10, 
          fontSize: 14, 
          color: '#6090ff',
          fontWeight: 'bold',
          letterSpacing: 2,
          textTransform: 'uppercase',
        }}>
          FLYBY2
        </div>
        <div style={{ 
          fontSize: 10, 
          color: '#666',
          marginBottom: 8,
        }}>
          Soji Yamakawa • 1997
        </div>
        <div style={{ 
          display: 'flex', 
          gap: 4, 
          flexWrap: 'wrap', 
          maxWidth: 300,
        }}>
          {flightPaths.map((p, i) => (
            <button
              key={p.name}
              style={{
                padding: '4px 8px',
                background: i === sceneConfig.pathIndex 
                  ? 'rgba(80, 130, 220, 0.8)' 
                  : 'rgba(255,255,255,0.05)',
                color: i === sceneConfig.pathIndex ? '#fff' : '#888',
                border: i === sceneConfig.pathIndex 
                  ? '1px solid rgba(100, 150, 255, 0.6)' 
                  : '1px solid rgba(255,255,255,0.1)',
                borderRadius: 2,
                cursor: 'pointer',
                fontWeight: i === sceneConfig.pathIndex ? 600 : 400,
                fontSize: 11,
                fontFamily: 'inherit',
                transition: 'all 0.2s ease',
              }}
              onClick={() => {
                setSceneConfig({
                  ...generateSceneConfig(),
                  pathIndex: i,
                  path: flightPaths[i],
                })
                setSceneKey(k => k + 1)
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div style={{ 
          marginTop: 10, 
          fontSize: 9, 
          color: '#444',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          paddingTop: 8,
        }}>
          Press any key or click to show controls
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
        <Scene 
          sceneKey={sceneKey}
          currentPath={sceneConfig.path}
          startHeading={sceneConfig.startHeading}
          startPosition={startPositionVec}
        />
        <Camera 
          cameraPosition={cameraPositionVec} 
          sceneKey={sceneKey} 
        />
      </Canvas>
    </>
  )
}

export default App
