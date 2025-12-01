import { useState, useCallback, useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Aircraft, type TelemetryData } from './components/Aircraft';
import { SceneEnvironment, type SkyboxMode } from './components/Scene';
import { AIRCRAFT_MODELS } from './utils/srfParser';
import type { ManeuverType } from './hooks/useFlightController';
import './styles/debugControls.css';

const MANEUVERS: ManeuverType[] = ['straight', 'roll', 'loop', 'climb', 'eight', 'turn360'];
const ALTITUDE = 300;
const MIN_ZOOM_FOV = 3;           // Tighter zoom (lower FOV = more zoom)
const MAX_ZOOM_FOV = 90;          // Wide angle

// Camera height presets
type CameraHeightPreset = 'low' | 'medium' | 'high' | 'random';
const CAMERA_HEIGHTS: Record<Exclude<CameraHeightPreset, 'random'>, { min: number; max: number; label: string }> = {
  low: { min: 50, max: 150, label: 'LOW (Ground Level)' },
  medium: { min: 250, max: 350, label: 'MEDIUM (Flight Level)' },
  high: { min: 450, max: 600, label: 'HIGH (Aerial View)' },
};

// Debug controls state
interface DebugState {
  skybox: SkyboxMode;
  showGround: boolean;
  showSmoke: boolean;
  showFlame: boolean;
  showUI: boolean;
  zoomLevel: number;
  buildingDensity: number;
  selectedAircraft: string; // 'random' or specific model
  selectedManeuver: string; // 'random' or specific maneuver
  cameraHeight: CameraHeightPreset;
}

const STORAGE_KEY = 'flyby2-debug-settings';
const DEFAULT_ZOOM = 40;
const DEFAULT_DENSITY = 4000;

// Load settings from localStorage
function loadDebugSettings(): DebugState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Migrate old showSky boolean to new skybox mode
      let skybox: SkyboxMode = parsed.skybox ?? 'day';
      if (typeof parsed.showSky === 'boolean') {
        skybox = parsed.showSky ? 'day' : 'none';
      }
      return {
        skybox,
        showGround: parsed.showGround !== false,
        showSmoke: parsed.showSmoke !== false,
        showFlame: parsed.showFlame !== false,
        showUI: parsed.showUI !== false,
        zoomLevel: parsed.zoomLevel ?? DEFAULT_ZOOM,
        buildingDensity: parsed.buildingDensity ?? DEFAULT_DENSITY,
        selectedAircraft: parsed.selectedAircraft ?? 'random',
        selectedManeuver: parsed.selectedManeuver ?? 'random',
        cameraHeight: parsed.cameraHeight ?? 'random',
      };
    }
  } catch (e) {
    console.warn('Failed to load settings from localStorage:', e);
  }
  return {
    skybox: 'day',
    showGround: true,
    showSmoke: true,
    showFlame: true,
    showUI: true,
    zoomLevel: DEFAULT_ZOOM,
    buildingDensity: DEFAULT_DENSITY,
    selectedAircraft: 'random',
    selectedManeuver: 'random',
    cameraHeight: 'random',
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
  cameraHeight,
}: {
  targetRef: React.RefObject<THREE.Vector3>;
  sessionKey: number;
  zoomLevel: number;
  onZoomChange: (zoom: number) => void;
  cameraHeight: CameraHeightPreset;
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
    
    // Determine camera altitude based on preset
    let cameraAltitude: number;
    if (cameraHeight === 'random') {
      // Pick a random preset
      const presets = Object.keys(CAMERA_HEIGHTS) as Array<keyof typeof CAMERA_HEIGHTS>;
      const randomPreset = presets[Math.floor(Math.random() * presets.length)];
      const { min, max } = CAMERA_HEIGHTS[randomPreset];
      cameraAltitude = min + Math.random() * (max - min);
    } else {
      const { min, max } = CAMERA_HEIGHTS[cameraHeight];
      cameraAltitude = min + Math.random() * (max - min);
    }

    fixedPosition.current.set(
      -distance * Math.sin(angle),
      cameraAltitude,
      distance * Math.cos(angle)
    );
  }, [sessionKey, cameraHeight]);

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
        newZoom = Math.max(MIN_ZOOM_FOV, Math.min(MAX_ZOOM_FOV, newZoom));
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
  onTelemetryUpdate,
}: {
  model: string;
  maneuver: ManeuverType;
  onComplete: () => void;
  positionRef: React.RefObject<THREE.Vector3>;
  showSmoke: boolean;
  showFlame: boolean;
  onTelemetryUpdate?: (telemetry: TelemetryData) => void;
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
      onTelemetryUpdate={onTelemetryUpdate}
      showSmoke={showSmoke}
      showFlame={showFlame}
      scale={1}
    />
  );
}

// Inner scene component
function FlybyScene({
  skybox,
  showGround,
  showSmoke,
  showFlame,
  zoomLevel,
  buildingDensity,
  onZoomChange,
  onSceneInfoChange,
  onTelemetryUpdate,
  selectedAircraft,
  selectedManeuver,
  cameraHeight,
}: {
  skybox: SkyboxMode;
  showGround: boolean;
  showSmoke: boolean;
  showFlame: boolean;
  zoomLevel: number;
  buildingDensity: number;
  onZoomChange: (zoom: number) => void;
  onSceneInfoChange?: (model: string, maneuver: ManeuverType) => void;
  onTelemetryUpdate?: (telemetry: TelemetryData) => void;
  selectedAircraft: string;
  selectedManeuver: string;
  cameraHeight: CameraHeightPreset;
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
      <SceneEnvironment
        skybox={skybox}
        showGround={showGround}
        buildingDensity={buildingDensity}
      />
      <CameraController
        targetRef={aircraftPositionRef}
        sessionKey={sessionKey}
        zoomLevel={zoomLevel}
        onZoomChange={onZoomChange}
        cameraHeight={cameraHeight}
      />
      <AircraftWithTracking
        key={sessionKey}
        model={model}
        maneuver={maneuver}
        onComplete={handleManeuverComplete}
        positionRef={aircraftPositionRef}
        showSmoke={showSmoke}
        showFlame={showFlame}
        onTelemetryUpdate={onTelemetryUpdate}
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

// Helper to convert radians to degrees
function radToDeg(rad: number): number {
  return ((rad * 180 / Math.PI) % 360 + 360) % 360;
}

// Helper to format heading as compass direction
function formatHeading(rad: number): string {
  const deg = radToDeg(rad);
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(deg / 45) % 8;
  return `${Math.round(deg).toString().padStart(3, '0')}° ${directions[index]}`;
}

// Global telemetry store for real-time updates (avoids React state overhead)
const telemetryStore = {
  current: null as TelemetryData | null,
};

// Telemetry Panel UI Component - uses requestAnimationFrame for real-time updates
function TelemetryPanel({
  showUI,
}: {
  showUI: boolean;
}) {
  const altitudeRef = useRef<HTMLSpanElement>(null);
  const speedRef = useRef<HTMLSpanElement>(null);
  const headingRef = useRef<HTMLSpanElement>(null);
  const pitchRef = useRef<HTMLSpanElement>(null);
  const bankRef = useRef<HTMLSpanElement>(null);
  const maneuverRef = useRef<HTMLSpanElement>(null);
  const progressTextRef = useRef<HTMLSpanElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Use requestAnimationFrame to update DOM directly for smooth updates
  useEffect(() => {
    if (!showUI) return;

    let animationId: number;
    
    const updateDisplay = () => {
      const telemetry = telemetryStore.current;
      if (telemetry) {
        if (altitudeRef.current) altitudeRef.current.textContent = Math.round(telemetry.altitude).toLocaleString();
        if (speedRef.current) speedRef.current.textContent = String(telemetry.speed);
        if (headingRef.current) headingRef.current.textContent = formatHeading(telemetry.heading);
        if (pitchRef.current) pitchRef.current.textContent = `${radToDeg(telemetry.pitch).toFixed(1)}°`;
        if (bankRef.current) bankRef.current.textContent = `${radToDeg(telemetry.bank).toFixed(1)}°`;
        if (maneuverRef.current) maneuverRef.current.textContent = formatManeuverName(telemetry.currentManeuver);
        if (progressTextRef.current) progressTextRef.current.textContent = `${Math.round(telemetry.maneuverProgress * 100)}%`;
        if (progressBarRef.current) progressBarRef.current.style.width = `${telemetry.maneuverProgress * 100}%`;
      }
      animationId = requestAnimationFrame(updateDisplay);
    };
    
    animationId = requestAnimationFrame(updateDisplay);
    return () => cancelAnimationFrame(animationId);
  }, [showUI]);

  if (!showUI) return null;

  return (
    <div className="telemetry-panel">
      <div className="telemetry-header">
        &gt; FLIGHT_TELEMETRY
      </div>
      
      <div className="telemetry-grid">
        <div className="telemetry-item">
          <span className="telemetry-label">Altitude</span>
          <span ref={altitudeRef} className="telemetry-value large">---</span>
        </div>
        
        <div className="telemetry-item">
          <span className="telemetry-label">Speed</span>
          <span ref={speedRef} className="telemetry-value large">---</span>
        </div>
        
        <div className="telemetry-item full-width">
          <span className="telemetry-label">Heading</span>
          <span ref={headingRef} className="telemetry-value">---</span>
        </div>
        
        <div className="telemetry-item">
          <span className="telemetry-label">Pitch</span>
          <span ref={pitchRef} className="telemetry-value">---</span>
        </div>
        
        <div className="telemetry-item">
          <span className="telemetry-label">Bank</span>
          <span ref={bankRef} className="telemetry-value">---</span>
        </div>
        
        <div className="telemetry-item full-width">
          <span className="telemetry-label">Maneuver</span>
          <span ref={maneuverRef} className="telemetry-value">---</span>
        </div>
      </div>
      
      <div className="telemetry-bar-container">
        <div className="telemetry-bar-label">
          <span>Progress</span>
          <span ref={progressTextRef}>0%</span>
        </div>
        <div className="telemetry-bar">
          <div ref={progressBarRef} className="telemetry-bar-fill" style={{ width: '0%' }} />
        </div>
      </div>
    </div>
  );
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

      {/* Camera Height Selection */}
      <div className="cyberpunk-control">
        <div className="cyberpunk-select-label">CAMERA_HEIGHT:</div>
        <select
          value={state.cameraHeight}
          onChange={(e) => onChange('cameraHeight', e.target.value)}
          className="cyberpunk-select"
        >
          <option value="random">[ RANDOM ]</option>
          {(Object.keys(CAMERA_HEIGHTS) as Array<keyof typeof CAMERA_HEIGHTS>).map(key => (
            <option key={key} value={key}>{CAMERA_HEIGHTS[key].label}</option>
          ))}
        </select>
      </div>

      {/* Skybox Selection */}
      <div className="cyberpunk-control">
        <div className="cyberpunk-select-label">SKYBOX:</div>
        <select
          value={state.skybox}
          onChange={(e) => onChange('skybox', e.target.value)}
          className="cyberpunk-select"
        >
          <option value="none">NONE</option>
          <option value="day">DAY</option>
          <option value="night">NIGHT</option>
        </select>
      </div>

      {/* Toggle Controls */}
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
            min={MIN_ZOOM_FOV}
            max={MAX_ZOOM_FOV}
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

      {/* Building Density Slider */}
      <div className="cyberpunk-control">
        <div className="cyberpunk-slider-container">
          <div className="cyberpunk-slider-label">
            BUILDINGS: <span className="cyberpunk-value">{state.buildingDensity}</span>
          </div>
          <input
            type="range"
            min="0"
            max="20000"
            step="100"
            value={state.buildingDensity}
            onChange={(e) => onChange('buildingDensity', parseInt(e.target.value))}
            className="cyberpunk-slider"
          />
          <div className="cyberpunk-slider-labels">
            <span>FEW</span>
            <span>MANY</span>
          </div>
        </div>
      </div>

      <div className="cyberpunk-footer">
        &gt; PRESS [D] TO TOGGLE_UI
      </div>
    </div>
  );
}

const CAMERA_SETTINGS = {
  position: [0, 150, 200] as [number, number, number],
  fov: 35,
  near: 1,
  far: 30000,
};

const GL_SETTINGS = {
  antialias: true,
  toneMapping: THREE.ACESFilmicToneMapping,
  toneMappingExposure: 1.0,
};

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

  // Update global telemetry store for real-time display
  const handleTelemetryUpdate = useCallback((data: TelemetryData) => {
    telemetryStore.current = data;
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
        camera={CAMERA_SETTINGS}
        gl={GL_SETTINGS}
      >
        <FlybyScene
          skybox={debugState.skybox}
          showGround={debugState.showGround}
          showSmoke={debugState.showSmoke}
          showFlame={debugState.showFlame}
          zoomLevel={debugState.zoomLevel}
          buildingDensity={debugState.buildingDensity}
          onZoomChange={handleZoomChange}
          onSceneInfoChange={handleSceneInfoChange}
          onTelemetryUpdate={handleTelemetryUpdate}
          selectedAircraft={debugState.selectedAircraft}
          selectedManeuver={debugState.selectedManeuver}
          cameraHeight={debugState.cameraHeight}
        />
      </Canvas>

      <DebugControls
        state={debugState}
        onChange={handleDebugChange}
        sceneModel={sceneInfo.model}
        sceneManeuver={sceneInfo.maneuver}
      />

      <TelemetryPanel
        showUI={debugState.showUI}
      />

      <div style={{
        position: 'absolute',
        bottom: 20,
        left: 20,
        color: 'rgba(51, 255, 51, 0.5)',
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: '12px',
        pointerEvents: 'auto',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        zIndex: 1000,
      }}>
        <div style={{ fontWeight: 600, letterSpacing: '1px', textShadow: '0 0 5px rgba(51, 255, 51, 0.3)' }}>FLYBY2</div>
        <a
          href="https://github.com/arkits/flyby"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: 'rgba(51, 255, 51, 0.3)',
            textDecoration: 'none',
            fontSize: '10px',
            transition: 'color 0.2s',
            cursor: 'pointer'
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'rgba(51, 255, 51, 0.8)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(51, 255, 51, 0.3)'}
        >
          [ GITHUB_REPO ]
        </a>
      </div>
    </div>
  );
}
