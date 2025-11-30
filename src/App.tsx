import { useState, useCallback, useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Aircraft } from './components/Aircraft';
import { SceneEnvironment } from './components/Scene';
import { AIRCRAFT_MODELS } from './utils/srfParser';
import type { ManeuverType } from './hooks/useFlightController';
import './styles/debugControls.css';

const MANEUVERS: ManeuverType[] = ['straight', 'roll', 'loop', 'climb', 'eight', 'turn360'];
const ALTITUDE = 300;

// Debug controls state
interface DebugState {
  showSky: boolean;
  showGround: boolean;
  showSmoke: boolean;
  showFlame: boolean;
  showUI: boolean;
  zoomLevel: number;
  selectedAircraft: string; // 'random' or specific model
  selectedManeuver: string; // 'random' or specific maneuver
}

const STORAGE_KEY = 'flyby2-debug-settings';
const DEFAULT_ZOOM = 40;

// Load settings from localStorage
function loadDebugSettings(): DebugState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        showSky: parsed.showSky !== false,
        showGround: parsed.showGround !== false,
        showSmoke: parsed.showSmoke !== false,
        showFlame: parsed.showFlame !== false,
        showUI: parsed.showUI !== false,
        zoomLevel: parsed.zoomLevel ?? DEFAULT_ZOOM,
        selectedAircraft: parsed.selectedAircraft ?? 'random',
        selectedManeuver: parsed.selectedManeuver ?? 'random',
      };
    }
  } catch (e) {
    console.warn('Failed to load settings from localStorage:', e);
  }
  return {
    showSky: true,
    showGround: true,
    showSmoke: true,
    showFlame: true,
    showUI: true,
    zoomLevel: DEFAULT_ZOOM,
    selectedAircraft: 'random',
    selectedManeuver: 'random',
  };
}

// Save settings to localStorage
function saveDebugSettings(state: DebugState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save settings to localStorage:', e);
  }
}

// Camera controller that tracks the aircraft
function CameraController({ 
  targetRef, 
  sessionKey,
  zoomLevel,
  onZoomChange,
}: { 
  targetRef: React.RefObject<THREE.Vector3>; 
  sessionKey: number;
  zoomLevel: number;
  onZoomChange: (zoom: number) => void;
}) {
  const { camera, gl } = useThree();
  const fixedPosition = useRef(new THREE.Vector3());
  
  const zoomLevelRef = useRef(zoomLevel);
  const onZoomChangeRef = useRef(onZoomChange);
  
  useEffect(() => {
    zoomLevelRef.current = zoomLevel;
  }, [zoomLevel]);
  
  useEffect(() => {
    onZoomChangeRef.current = onZoomChange;
  }, [onZoomChange]);
  
  useEffect(() => {
    const angle = Math.random() * Math.PI * 2;
    const distance = 40 + Math.random() * 40;
    
    fixedPosition.current.set(
      -distance * Math.sin(angle),
      ALTITUDE + (Math.random() * 40 - 20),
      distance * Math.cos(angle)
    );
    
    camera.position.copy(fixedPosition.current);
  }, [camera, sessionKey]);
  
  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = zoomLevel;
      camera.updateProjectionMatrix();
    }
  }, [camera, zoomLevel]);
  
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      
      if (camera instanceof THREE.PerspectiveCamera) {
        const zoomSpeed = 2;
        let newZoom = zoomLevelRef.current + event.deltaY * 0.01 * zoomSpeed;
        newZoom = Math.max(10, Math.min(90, newZoom));
        onZoomChangeRef.current(newZoom);
      }
    };
    
    const canvas = gl.domElement;
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [camera, gl]);
  
  useFrame(() => {
    camera.position.copy(fixedPosition.current);
    
    if (targetRef.current) {
      camera.lookAt(targetRef.current);
    }
  });
  
  return null;
}

// Main aircraft wrapper
function AircraftWithTracking({
  model,
  maneuver,
  onComplete,
  positionRef,
  showSmoke,
  showFlame,
}: {
  model: string;
  maneuver: ManeuverType;
  onComplete: () => void;
  positionRef: React.RefObject<THREE.Vector3>;
  showSmoke: boolean;
  showFlame: boolean;
}) {
  const handlePositionUpdate = useCallback((position: THREE.Vector3) => {
    if (positionRef.current) {
      positionRef.current.copy(position);
    }
  }, [positionRef]);
  
  return (
    <Aircraft
      modelName={model}
      maneuver={maneuver}
      onManeuverComplete={onComplete}
      onPositionUpdate={handlePositionUpdate}
      showSmoke={showSmoke}
      showFlame={showFlame}
      scale={1}
    />
  );
}

// Inner scene component
function FlybyScene({ 
  showSky, 
  showGround, 
  showSmoke,
  showFlame,
  zoomLevel,
  onZoomChange,
  onSceneInfoChange,
  selectedAircraft,
  selectedManeuver,
}: { 
  showSky: boolean; 
  showGround: boolean; 
  showSmoke: boolean;
  showFlame: boolean;
  zoomLevel: number;
  onZoomChange: (zoom: number) => void;
  onSceneInfoChange?: (model: string, maneuver: ManeuverType) => void;
  selectedAircraft: string;
  selectedManeuver: string;
}) {
  const [sessionKey, setSessionKey] = useState(0);
  const [model, setModel] = useState(() => 
    selectedAircraft === 'random' 
      ? AIRCRAFT_MODELS[Math.floor(Math.random() * AIRCRAFT_MODELS.length)]
      : selectedAircraft
  );
  const [maneuver, setManeuver] = useState<ManeuverType>(() =>
    selectedManeuver === 'random'
      ? MANEUVERS[Math.floor(Math.random() * MANEUVERS.length)]
      : selectedManeuver as ManeuverType
  );
  
  const aircraftPositionRef = useRef<THREE.Vector3>(new THREE.Vector3(0, ALTITUDE, 0));
  
  // Update when selection changes from debug controls
  useEffect(() => {
    if (selectedAircraft !== 'random') {
      setModel(selectedAircraft);
      setSessionKey(k => k + 1);
    }
  }, [selectedAircraft]);
  
  useEffect(() => {
    if (selectedManeuver !== 'random') {
      setManeuver(selectedManeuver as ManeuverType);
      setSessionKey(k => k + 1);
    }
  }, [selectedManeuver]);
  
  useEffect(() => {
    onSceneInfoChange?.(model, maneuver);
  }, [model, maneuver, onSceneInfoChange]);
  
  const handleManeuverComplete = useCallback(() => {
    setTimeout(() => {
      const newModel = selectedAircraft === 'random'
        ? AIRCRAFT_MODELS[Math.floor(Math.random() * AIRCRAFT_MODELS.length)]
        : selectedAircraft;
      const newManeuver = selectedManeuver === 'random'
        ? MANEUVERS[Math.floor(Math.random() * MANEUVERS.length)]
        : selectedManeuver as ManeuverType;
      
      setModel(newModel);
      setManeuver(newManeuver);
      setSessionKey(k => k + 1);
    }, 500);
  }, [selectedAircraft, selectedManeuver]);
  
  return (
    <>
      <SceneEnvironment showSky={showSky} showGround={showGround} />
      <CameraController 
        targetRef={aircraftPositionRef} 
        sessionKey={sessionKey}
        zoomLevel={zoomLevel}
        onZoomChange={onZoomChange}
      />
      <AircraftWithTracking
        key={sessionKey}
        model={model}
        maneuver={maneuver}
        onComplete={handleManeuverComplete}
        positionRef={aircraftPositionRef}
        showSmoke={showSmoke}
        showFlame={showFlame}
      />
    </>
  );
}

// Format names for display
function formatModelName(model: string): string {
  return model.replace(/\.(SRF|srf)$/i, '').toUpperCase();
}

function formatManeuverName(maneuver: string): string {
  const names: Record<string, string> = {
    straight: 'STRAIGHT',
    roll: 'BARREL ROLL',
    loop: 'LOOP',
    climb: 'CLIMB',
    eight: 'FIGURE-8',
    turn360: '360° TURN',
    random: 'RANDOM',
  };
  return names[maneuver] || maneuver.toUpperCase();
}

// Debug Controls UI Component
function DebugControls({ 
  state, 
  onChange,
  sceneModel,
  sceneManeuver,
}: { 
  state: DebugState; 
  onChange: (key: keyof DebugState, value: boolean | number | string) => void;
  sceneModel?: string;
  sceneManeuver?: ManeuverType;
}) {
  if (!state.showUI) return null;
  
  return (
    <div className="cyberpunk-panel">
      <div className="cyberpunk-header">
        &gt; DEBUG_CONTROLS.SYS
      </div>
      
      {/* Current Scene Info */}
      {(sceneModel || sceneManeuver) && (
        <div className="cyberpunk-scene-info">
          <div className="cyberpunk-scene-label">ACTIVE_SCENE</div>
          {sceneModel && (
            <div className="cyberpunk-scene-value">
              AIRCRAFT: {formatModelName(sceneModel)}
            </div>
          )}
          {sceneManeuver && (
            <div className="cyberpunk-scene-value" style={{ marginTop: '4px' }}>
              MANEUVER: {formatManeuverName(sceneManeuver)}
            </div>
          )}
        </div>
      )}
      
      {/* Aircraft Selection */}
      <div className="cyberpunk-control">
        <div className="cyberpunk-select-label">SELECT_AIRCRAFT:</div>
        <select 
          value={state.selectedAircraft}
          onChange={(e) => onChange('selectedAircraft', e.target.value)}
          className="cyberpunk-select"
        >
          <option value="random">[ RANDOM ]</option>
          {AIRCRAFT_MODELS.map(model => (
            <option key={model} value={model}>{formatModelName(model)}</option>
          ))}
        </select>
      </div>
      
      {/* Maneuver Selection */}
      <div className="cyberpunk-control">
        <div className="cyberpunk-select-label">SELECT_MANEUVER:</div>
        <select 
          value={state.selectedManeuver}
          onChange={(e) => onChange('selectedManeuver', e.target.value)}
          className="cyberpunk-select"
        >
          <option value="random">[ RANDOM ]</option>
          {MANEUVERS.map(m => (
            <option key={m} value={m}>{formatManeuverName(m)}</option>
          ))}
        </select>
      </div>
      
      {/* Toggle Controls */}
      <div className="cyberpunk-control">
        <label className="cyberpunk-label">
          <input
            type="checkbox"
            checked={state.showSky}
            onChange={(e) => onChange('showSky', e.target.checked)}
            className="cyberpunk-checkbox"
          />
          <span>[{state.showSky ? 'X' : ' '}] SHOW_SKY</span>
        </label>
      </div>
      
      <div className="cyberpunk-control">
        <label className="cyberpunk-label">
          <input
            type="checkbox"
            checked={state.showGround}
            onChange={(e) => onChange('showGround', e.target.checked)}
            className="cyberpunk-checkbox"
          />
          <span>[{state.showGround ? 'X' : ' '}] SHOW_GROUND</span>
        </label>
      </div>
      
      <div className="cyberpunk-control">
        <label className="cyberpunk-label">
          <input
            type="checkbox"
            checked={state.showSmoke}
            onChange={(e) => onChange('showSmoke', e.target.checked)}
            className="cyberpunk-checkbox"
          />
          <span>[{state.showSmoke ? 'X' : ' '}] SMOKE_TRAILS</span>
        </label>
      </div>
      
      <div className="cyberpunk-control">
        <label className="cyberpunk-label">
          <input
            type="checkbox"
            checked={state.showFlame}
            onChange={(e) => onChange('showFlame', e.target.checked)}
            className="cyberpunk-checkbox"
          />
          <span>[{state.showFlame ? 'X' : ' '}] JET_FLAME</span>
        </label>
      </div>
      
      {/* Zoom Slider */}
      <div className="cyberpunk-control">
        <div className="cyberpunk-slider-container">
          <div className="cyberpunk-slider-label">
            ZOOM: <span className="cyberpunk-value">{Math.round(state.zoomLevel)}°</span>
          </div>
          <input
            type="range"
            min="10"
            max="90"
            step="1"
            value={state.zoomLevel}
            onChange={(e) => onChange('zoomLevel', parseFloat(e.target.value))}
            className="cyberpunk-slider"
          />
          <div className="cyberpunk-slider-labels">
            <span>IN</span>
            <span>OUT</span>
          </div>
        </div>
      </div>
      
      <div className="cyberpunk-footer">
        &gt; PRESS [D] TO TOGGLE_UI
      </div>
    </div>
  );
}

// Main App component
export default function App() {
  const [debugState, setDebugState] = useState<DebugState>(() => loadDebugSettings());
  const [sceneInfo, setSceneInfo] = useState<{ model?: string; maneuver?: ManeuverType }>({});

  useEffect(() => {
    saveDebugSettings(debugState);
  }, [debugState]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'd') {
        setDebugState(prev => ({ ...prev, showUI: !prev.showUI }));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleDebugChange = useCallback((key: keyof DebugState, value: boolean | number | string) => {
    setDebugState(prev => ({ ...prev, [key]: value }));
  }, []);
  
  const handleZoomChange = useCallback((zoom: number) => {
    setDebugState(prev => ({ ...prev, zoomLevel: zoom }));
  }, []);
  
  const handleSceneInfoChange = useCallback((model: string, maneuver: ManeuverType) => {
    setSceneInfo({ model, maneuver });
  }, []);

  return (
    <div style={{ 
      width: '100vw', 
      height: '100vh', 
      background: '#000',
      overflow: 'hidden',
      cursor: debugState.showUI ? 'auto' : 'none',
    }}>
      <Canvas
        shadows
        camera={{
          position: [0, 150, 200],
          fov: 35,
          near: 1,
          far: 30000,
        }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
        }}
      >
        <FlybyScene 
          showSky={debugState.showSky} 
          showGround={debugState.showGround}
          showSmoke={debugState.showSmoke}
          showFlame={debugState.showFlame}
          zoomLevel={debugState.zoomLevel}
          onZoomChange={handleZoomChange}
          onSceneInfoChange={handleSceneInfoChange}
          selectedAircraft={debugState.selectedAircraft}
          selectedManeuver={debugState.selectedManeuver}
        />
      </Canvas>
      
      <DebugControls 
        state={debugState} 
        onChange={handleDebugChange}
        sceneModel={sceneInfo.model}
        sceneManeuver={sceneInfo.maneuver}
      />
      
      <div style={{
        position: 'absolute',
        bottom: 20,
        left: 20,
        color: 'rgba(255,255,255,0.3)',
        fontFamily: 'monospace',
        fontSize: '12px',
        pointerEvents: 'none',
        userSelect: 'none',
      }}>
        FLYBY2
      </div>
    </div>
  );
}
