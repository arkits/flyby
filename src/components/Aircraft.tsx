import { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { loadSRF, AIRCRAFT_MODELS } from '../utils/srfParser';
import { useFlightController } from '../hooks/useFlightController';
import { ExhaustTrail, WingVaporTrails } from './SmokeTrail';
import type { ManeuverType } from '../hooks/useFlightController';

interface AircraftProps {
  modelName?: string;
  maneuver?: ManeuverType;
  onManeuverComplete?: () => void;
  onPositionUpdate?: (position: THREE.Vector3) => void;
  showSmoke?: boolean;
  showFlame?: boolean;
  scale?: number;
}

/**
 * Jet exhaust flame effect
 */
function JetFlame({ 
  positionRef, 
  quaternionRef 
}: { 
  positionRef: React.RefObject<THREE.Vector3>; 
  quaternionRef: React.RefObject<THREE.Quaternion>;
}) {
  const flameRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.PointLight>(null);
  const timeRef = useRef(0);
  
  // Create flame geometry - cone pointing backwards
  const flameGeometry = useMemo(() => {
    return new THREE.ConeGeometry(0.8, 4, 8);
  }, []);
  
  // Animated flame material
  const flameMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        baseColor: { value: new THREE.Color(0xff4400) },
        tipColor: { value: new THREE.Color(0xffaa00) },
      },
      vertexShader: `
        varying vec2 vUv;
        varying float vY;
        void main() {
          vUv = uv;
          vY = position.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3 baseColor;
        uniform vec3 tipColor;
        varying vec2 vUv;
        varying float vY;
        
        void main() {
          // Flame gradient from tip (hot) to base (cooler)
          float t = smoothstep(-2.0, 2.0, vY);
          vec3 color = mix(tipColor, baseColor, t);
          
          // Subtle flickering effect - much slower and gentler
          float flicker = 0.95 + 0.05 * sin(time * 8.0 + vY * 2.0);
          
          // Fade at edges
          float alpha = (1.0 - t * 0.4) * flicker;
          alpha *= smoothstep(0.0, 0.3, 1.0 - abs(vUv.x - 0.5) * 2.0);
          alpha *= 0.6; // Reduce overall opacity for subtlety
          
          gl_FragColor = vec4(color * 0.8, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }, []);
  
  useFrame((_, delta) => {
    if (!flameRef.current || !positionRef.current || !quaternionRef.current) return;
    
    timeRef.current += delta;
    flameMaterial.uniforms.time.value = timeRef.current;
    
    // Position flame at exhaust (back of aircraft)
    const exhaustOffset = new THREE.Vector3(0, 0, -8);
    exhaustOffset.applyQuaternion(quaternionRef.current);
    
    flameRef.current.position.copy(positionRef.current).add(exhaustOffset);
    flameRef.current.quaternion.copy(quaternionRef.current);
    
    // Rotate to point backwards (cone points along Y by default)
    flameRef.current.rotateX(Math.PI / 2);
    
    // Subtle scale variation - much less animated
    const scaleFlicker = 0.97 + 0.03 * Math.sin(timeRef.current * 6);
    const lengthFlicker = 0.95 + 0.05 * Math.sin(timeRef.current * 5);
    flameRef.current.scale.set(scaleFlicker, lengthFlicker, scaleFlicker);
    
    // Update point light for glow - reduced intensity and variation
    if (glowRef.current) {
      glowRef.current.position.copy(flameRef.current.position);
      glowRef.current.intensity = 0.8 + Math.sin(timeRef.current * 8) * 0.2;
    }
  });
  
  return (
    <>
      <mesh 
        ref={flameRef} 
        geometry={flameGeometry} 
        material={flameMaterial}
        frustumCulled={false}
      />
      <pointLight 
        ref={glowRef}
        color="#ff4400"
        intensity={0.8}
        distance={15}
        decay={2}
      />
    </>
  );
}

export function Aircraft({ 
  modelName, 
  maneuver, 
  onManeuverComplete,
  onPositionUpdate,
  showSmoke = true,
  showFlame = true,
  scale = 1 
}: AircraftProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [currentModel, setCurrentModel] = useState<string>('');
  const flight = useFlightController();
  const completedRef = useRef(false);
  
  // Track position and quaternion for effects
  const trailPositionRef = useRef(new THREE.Vector3());
  const trailQuaternionRef = useRef(new THREE.Quaternion());
  const isEmittingRef = useRef(false);

  // Select random model if not specified
  const selectedModel = useMemo(() => {
    return modelName ?? AIRCRAFT_MODELS[Math.floor(Math.random() * AIRCRAFT_MODELS.length)];
  }, [modelName]);

  // Load the SRF model
  useEffect(() => {
    if (selectedModel === currentModel && geometry) return;
    
    loadSRF(`/models/${selectedModel}`)
      .then((geo) => {
        setGeometry(geo);
        setCurrentModel(selectedModel);
      })
      .catch((err) => {
        console.error('Failed to load aircraft model:', err);
      });
  }, [selectedModel, currentModel, geometry]);

  // Initialize flight when geometry is loaded
  useEffect(() => {
    if (geometry) {
      flight.initFlight(maneuver);
      completedRef.current = false;
    }
  }, [geometry, maneuver, flight]);

  // Material with vertex colors and flat shading
  const material = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      metalness: 0.4,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
  }, []);

  // Update flight each frame
  useFrame((_, delta) => {
    if (!meshRef.current || !geometry) return;
    
    const clampedDelta = Math.min(delta, 0.1);
    
    flight.update(clampedDelta);
    
    const position = flight.getPosition();
    const quaternion = flight.getQuaternion();
    
    meshRef.current.position.copy(position);
    meshRef.current.quaternion.copy(quaternion);
    
    // Update trail tracking refs
    trailPositionRef.current.copy(position);
    trailQuaternionRef.current.copy(quaternion);
    isEmittingRef.current = flight.isEmittingSmoke();
    
    onPositionUpdate?.(position);
    
    if (flight.isComplete() && !completedRef.current) {
      completedRef.current = true;
      onManeuverComplete?.();
    }
  });

  if (!geometry) {
    return null;
  }

  return (
    <>
      <mesh
        ref={meshRef}
        geometry={geometry}
        material={material}
        scale={[scale, scale, scale]}
        castShadow
        receiveShadow
        frustumCulled={false}
      />
      
      {/* Jet exhaust flame */}
      {showFlame && (
        <JetFlame
          positionRef={trailPositionRef}
          quaternionRef={trailQuaternionRef}
        />
      )}
      
      {showSmoke && (
        <>
          <ExhaustTrail
            positionRef={trailPositionRef}
            quaternionRef={trailQuaternionRef}
            emittingRef={isEmittingRef}
          />
          
          <WingVaporTrails
            positionRef={trailPositionRef}
            quaternionRef={trailQuaternionRef}
            emittingRef={isEmittingRef}
            wingSpan={5}
          />
        </>
      )}
    </>
  );
}
